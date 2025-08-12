import asyncio
import opentelemetry.instrumentation.grpc
import os
import signal
from contextlib import (
    AbstractContextManager,
    _AsyncGeneratorContextManager,
    contextmanager,
)
from enum import Enum
from functools import wraps
from grpc.aio import (
    ClientCallDetails,
    StreamUnaryCall,
    StreamUnaryClientInterceptor,
    UnaryUnaryCall,
    UnaryUnaryClientInterceptor,
)
from log.log import get_logger
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
    OTLPSpanExporter,
)
from opentelemetry.sdk.environment_variables import (
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
)
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from rebootdev.aio.once import Once
from rebootdev.aio.signals import install_cleanup
from rebootdev.settings import (
    ENVVAR_RBT_NAME,
    ENVVAR_REBOOT_NODEJS,
    ENVVAR_REBOOT_TRACE_LEVEL,
)
from typing import Any, AsyncIterator, Callable, Optional

logger = get_logger(__name__)

provider: Optional[TracerProvider] = None


class TraceLevel(Enum):
    """
    The importance of a given span.

    OpenTelemetry does not have a concept of trace levels, but we can
    create our own to help manage the verbosity of our traces. Most
    notably we want to normally show only customer-relevant traces, but
    when debugging Reboot itself we want to see more details.
    """
    CUSTOMER = 0
    REBOOT_INTERNAL = 1


_trace_level = TraceLevel.CUSTOMER

# Whether the tracing should include python-specific traces (if True),
# or whether it should omit these as Python is merely an implementation
# detail (if False).
_python_specific = False


class FilteredBatchSpanProcessor(BatchSpanProcessor):
    """
    A BatchSpanProcessor that filters out Reboot-specific spans.

    This is a workaround for the fact that OpenTelemetry's SDKs don't
    always obey their own filters.
    """

    # TODO(rjh): this only works well if there are no child spans below
    #            the spans being filtered out; otherwise the child spans
    #            are orphaned. Instead of using this mechanism, we
    #            should replace OpenTelemetry's gRPC tracing
    #            interceptors with our own logic, so that we can filter
    #            which gRPC spans get _created_ (like we already do for
    #            other spans with the `level` parameter to e.g. the
    #            `span()` method below).

    def on_end(self, span):
        # The `rpc.service` attribute is set by OpenTelemetry's gRPC
        # instrumentation; it contains the fully qualified name of the
        # gRPC service being called.
        service_name = span.attributes.get("rpc.service")
        if (
            service_name is not None and
            # Filter out calls to the Sidecar: they're not interesting
            # to customers, cause a lot of noise on the dashboard, and
            # since they're "leaf" spans they'll never have child spans
            # (see the TODO above).
            str(service_name).startswith("rbt.v1alpha1.Sidecar") and
            _trace_level.value < TraceLevel.REBOOT_INTERNAL.value
        ):
            return
        super().on_end(span)


def force_flush_and_shutdown(*args, **kwargs):
    global provider

    if provider is None:
        return

    # Before shutting down this process we must force-flush the provider
    # to make sure all spans are recorded. If there are unflushed traces
    # this may take a moment, but without it short-lived processes (e.g.
    # consensuses in unit tests) would never get to flush their traces.
    process_name = provider.resource.attributes.get("service.name")
    logger.debug(
        f"Force-flushing tracer for '{process_name}'; "
        "this may delay shutdown..."
    )
    provider.force_flush()
    provider.shutdown()


def _start(process_name: str):
    if OTEL_EXPORTER_OTLP_TRACES_ENDPOINT not in os.environ:
        # Tracing is not enabled; do nothing, tracers continue to be NOOPs.
        return

    global provider
    assert provider is None, "Tracer provider already initialized"

    try:
        global _trace_level
        _trace_level = TraceLevel[os.environ.get(
            ENVVAR_REBOOT_TRACE_LEVEL,
            "CUSTOMER",
        ).upper()]
        global _python_specific
        # Show Python-specific traces only if the user code is in
        # Python, or if the trace level is set to a high enough level
        # that we want to see Python implementation details.
        _python_specific = (
            ENVVAR_REBOOT_NODEJS not in os.environ or
            _trace_level == TraceLevel.REBOOT_INTERNAL
        )
    except KeyError as e:
        # The `ENVVAR_REBOOT_TRACE_LEVEL` environment variable is an
        # internal detail (not used by developers, only by maintainers),
        # so having it set to the wrong value is an error that warrants
        # a stack trace.
        raise ValueError(
            f"Invalid {ENVVAR_REBOOT_TRACE_LEVEL}: "
            f"'{os.environ.get(ENVVAR_REBOOT_TRACE_LEVEL)}'; pick from: "
            f"{', '.join([level.name for level in TraceLevel])}"
        ) from e

    resource = Resource(attributes={SERVICE_NAME: process_name})
    provider = TracerProvider(resource=resource)
    processor = FilteredBatchSpanProcessor(OTLPSpanExporter())
    provider.add_span_processor(processor)

    # Sets the global default tracer provider; any `ProxyTracer`s already
    # returned by `get_tracer()` (as well as any future tracers) will now direct
    # their spans to this provider.
    trace.set_tracer_provider(provider)

    # Consensuses while being shut down (e.g. at the end of tests) should flush
    # their traces.
    install_cleanup([signal.SIGTERM], force_flush_and_shutdown)


# We're using a global here because we only want to initialize the
# tracing threads once per process.
_start_once = Once(_start)


def start(
    process_name: Optional[str] = None, consensus_id: Optional[str] = None
):
    if process_name is None:
        # TODO(rjh): make sure all paths in the Cloud set this
        #            environment variable (not just customer containers
        #            using the `rbt serve` CLI, but also the bazel-built
        #            images), and make sure that it is obeyed (i.e. the
        #            CLI considers it an alternative to the `--name`
        #            argument). Then replace the fallback below with an
        #            `assert`.
        process_name = os.environ.get(ENVVAR_RBT_NAME, "Reboot Application")

    if consensus_id is not None:
        # Consensus IDs have an application ID prefix; that's redundant
        # with the (nicer) application name we already have, so strip
        # it.
        consensus_id = consensus_id.split("-", 1)[-1]
        process_name = f"{process_name} (consensus {consensus_id})"

    _start_once(process_name)


# A default tracer to use when a more specific tracer is not needed (it's not
# clear exactly what benefit it gives us to have differently-named tracers
# anyway; those names don't show up on Jaeger's UI).
#
# Creates a tracer from the global tracer provider. Since `start()` has not been
# called yet this will return a `ProxyTracer` that initially does nothing with
# its traces; after `start()` all `ProxyTracer`s will direct new spans to the
# globally set tracer provider that is then set.
_tracer = trace.get_tracer(__name__)


def get_tracer(name: Optional[str] = None):
    global tracer
    return trace.get_tracer(name) if name is not None else _tracer


@contextmanager
def span(
    name: str,
    level: TraceLevel = TraceLevel.REBOOT_INTERNAL,
    python_specific: bool = False,
    **span_kwargs,
):
    """
    Start a new tracing span.
    """
    if _trace_level.value >= level.value and (
        # Python-specific spans are only emitted if the customer is
        # using Python code, OR if the trace level is high enough that
        # we want to see Python implementation details.
        (not python_specific or _python_specific) or
        _trace_level == TraceLevel.REBOOT_INTERNAL
    ):
        with _tracer.start_as_current_span(name, **span_kwargs):
            yield
    else:
        yield


def function_span(
    name: Optional[str] = None,  # Default: use the function's name.
    level: TraceLevel = TraceLevel.REBOOT_INTERNAL,
    **span_kwargs,
) -> Callable:
    """
    Convenience decorator to create spans named after a function or method.

    A shorthand for something like:

      tracer = get_tracer()
      tracer.start_as_current_span("MyClassName.my_function()")
      async def my_function():
        ...

    Which can instead be written as:

      @function_span()
      async def my_function():
        ...

    Any argument that could be passed to `Tracer.start_as_current_span` is
    permitted as an argument to this decorator also; for example:

      @function_span(set_status_on_exception=False)
      async def my_function():
        ...
    """

    def decorator(func: Callable) -> Callable:

        async def wrapper(*args, **kwargs):
            with span(
                name=(name or func.__qualname__) + "()",
                level=level,
                # These spans are Python-specific, since they use Python
                # module/class/method names.
                python_specific=True,
                **span_kwargs,
            ):
                return await func(*args, **kwargs)

        return wrapper

    return decorator


def main_span(name: Optional[str] = None, **span_kwargs) -> Callable:
    """
    Convenience decorator to run synchronous 'main' functions in a span.

    A shorthand for something like:
      def main():
        rebootdev.aio.tracing.start("my-process")
        ...
        rebootdev.aio.tracing.force_flush_and_shutdown()

    Which can instead be written as:

      @main_span("my-process")
      def main():
        ...

    Any argument that could be passed to `Tracer.start_as_current_span` is
    permitted as an argument to this decorator also; for example:

      @main_span("my-process", set_status_on_exception=False)
      def my_function():
        ...
    """

    def decorator(func: Callable) -> Callable:

        def wrapper(*args, **kwargs):
            start(name)
            global _tracer
            with _tracer.start_as_current_span(
                func.__qualname__ + "()",
                **span_kwargs,
            ):
                func(*args, **kwargs)

            force_flush_and_shutdown()

        return wrapper

    return decorator


class TracedAsyncGeneratorContextManager(_AsyncGeneratorContextManager):
    """
    A context manager that essentially combines two context managers:
    1. An OpenTelemetry `start_as_current_span` context manager.
    2. An `@asynccontextmanager` backed by a generator.
    """

    def __init__(
        self, func, args, kwargs, span_level: TraceLevel, span_kwargs
    ):
        # The OpenTelemetry context manager will be created in `__aenter__`.
        self.tracing: Optional[AbstractContextManager] = None
        self._span_level = span_level
        # The `span_kwargs` are passed to the OpenTelemetry context manager when
        # it is created.
        self.span_kwargs = span_kwargs
        # The name of the function being traced is used as the name of the span.
        self.func_name = func.__qualname__ + "()"

        # Let the `@asynccontextmanager` decorator's mechanisms (which we
        # inherit from) do their thing.
        super().__init__(func=func, args=args, kwds=kwargs)

    async def __aenter__(self):
        global _trace_level
        if _trace_level.value >= self._span_level.value:
            self.tracing = _tracer.start_as_current_span(
                self.func_name,
                **self.span_kwargs,
            )
            assert self.tracing is not None
            self.tracing.__enter__()
        return await super().__aenter__()

    async def __aexit__(self, exc_type, exc_value, traceback):
        if _trace_level.value >= self._span_level.value:
            assert self.tracing is not None, "__aenter__ was not called"
            self.tracing.__exit__(exc_type, exc_value, traceback)
        return await super().__aexit__(exc_type, exc_value, traceback)


def asynccontextmanager_span(
    level: TraceLevel = TraceLevel.REBOOT_INTERNAL,
    **span_kwargs,
) -> Callable:
    """
    Same as `function_span`, but for async context managers.

    NOTE: this REPLACES an `@asynccontextmanager` decorator.
    """

    # We've implemented this as a single decorator, rather than a decorator that
    # can wrap an `@asynccontextmanager` decorator, because the latter approach
    # caused problems with generator delegation, particularly in the presence of
    # exceptions.

    def decorator(func):

        @wraps(func)
        def helper(*args, **kwargs):
            return TracedAsyncGeneratorContextManager(
                func=func,
                args=args,
                kwargs=kwargs,
                span_level=level,
                span_kwargs=span_kwargs,
            )

        return helper

    return decorator


def generator_span(**span_kwargs) -> Callable:
    """
    Same as `function_span`, but for generators.

    NOTE: do NOT use this with `@asynccontextmanager`-decorated functions; use
          `@asynccontextmanager_span` instead.
    """

    def decorator(func: Callable) -> Callable:

        async def wrapper(*args, **kwargs) -> AsyncIterator:
            global _tracer
            with _tracer.start_as_current_span(
                func.__qualname__ + "()",
                **span_kwargs,
            ):
                async for result in func(*args, **kwargs):
                    yield result

        return wrapper

    return decorator


def aio_server_interceptor(tracer_provider=None, filter_=None):
    return opentelemetry.instrumentation.grpc.aio_server_interceptor(
        tracer_provider=tracer_provider,
        # TODO(rjh): We'd have liked to use the `service_prefix` filter
        # to filter out Reboot-specific spans (i.e. any with the "rbt."
        # prefix), but OpenTelemetry's SDKs don't (always) obey those
        # filters!? We use a custom `FilteredBatchSpanProcessor`
        # instead; see above.
        filter_=filter_,
    )


def aio_client_interceptors():
    return opentelemetry.instrumentation.grpc.aio_client_interceptors(
        # TODO(rjh): We'd have liked to use the `service_prefix` filter
        # to filter out Reboot-specific spans (i.e. any with the "rbt."
        # prefix), but OpenTelemetry's SDKs don't (always) obey those
        # filters!? We use a custom `FilteredBatchSpanProcessor`
        # instead; see above.
    ) + [
        UnaryUnaryOpenTelemetryWorkaroundInterceptor(),
        StreamUnaryOpenTelemetryWorkaroundInterceptor(),
    ]


# TODO(tonyhong007): These interceptors are a workaround for https://github.com/open-telemetry/opentelemetry-python-contrib/issues/3271.
# These interceptors allow cancelled errors to successfully propagate through the aio client interceptors.
class UnaryUnaryOpenTelemetryWorkaroundInterceptor(
    UnaryUnaryClientInterceptor
):

    async def intercept_unary_unary(
        self,
        continuation: Callable[[ClientCallDetails, Any], UnaryUnaryCall],
        client_call_details: ClientCallDetails,
        request: Any,
    ) -> UnaryUnaryCall:
        try:
            call: UnaryUnaryCall = await continuation(
                client_call_details,
                request,
            )
            await call
            return call
        except asyncio.CancelledError:
            raise


class StreamUnaryOpenTelemetryWorkaroundInterceptor(
    StreamUnaryClientInterceptor
):

    async def intercept_stream_unary(
        self,
        continuation: Callable[[ClientCallDetails, AsyncIterator[Any]],
                               StreamUnaryCall],
        client_call_details: ClientCallDetails,
        request_iterator: AsyncIterator[Any],
    ) -> StreamUnaryCall:
        try:
            call: StreamUnaryCall = await continuation(
                client_call_details,
                request_iterator,
            )
            await call
            return call
        except asyncio.CancelledError:
            raise


def full_type_name(obj: Any) -> str:
    """
    Returns the fully qualified type name of an object, including its module.
    """
    assert hasattr(obj, "__class__"), "'obj' is not an object"
    return f"{obj.__class__.__module__}.{obj.__class__.__qualname__}"
