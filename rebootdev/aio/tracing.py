import asyncio
import opentelemetry.instrumentation.grpc
import os
import signal
from contextlib import AbstractContextManager, _AsyncGeneratorContextManager
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
from typing import Any, AsyncIterator, Callable, Optional

logger = get_logger(__name__)

provider: Optional[TracerProvider] = None


def force_flush_and_shutdown(*args, **kwargs):
    global provider

    if provider is None:
        return

    # Before shutting down this process we must force-flush the provider to
    # make sure all spans are recorded. If there are unflushed traces this
    # may take a second or two, but without it short-lived processes (e.g.
    # consensuses in unit tests) would never get to flush their traces.
    process_name = provider.resource.attributes.get("service.name")
    logger.warning(
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

    resource = Resource(attributes={SERVICE_NAME: process_name})
    provider = TracerProvider(resource=resource)
    processor = BatchSpanProcessor(OTLPSpanExporter())
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


def start(process_name: str):
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


def function_span(**span_kwargs) -> Callable:
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
            global _tracer
            with _tracer.start_as_current_span(
                func.__qualname__ + "()",
                **span_kwargs,
            ):
                return await func(*args, **kwargs)

        return wrapper

    return decorator


def main_span(name, **span_kwargs) -> Callable:
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

    def __init__(self, func, args, kwargs, span_kwargs):
        # The OpenTelemetry context manager will be created in `__aenter__`.
        self.tracing: Optional[AbstractContextManager] = None
        # The `span_kwargs` are passed to the OpenTelemetry context manager when
        # it is created.
        self.span_kwargs = span_kwargs
        # The name of the function being traced is used as the name of the span.
        self.func_name = func.__qualname__ + "()"

        # Let the `@asynccontextmanager` decorator's mechanisms (which we
        # inherit from) do their thing.
        super().__init__(func=func, args=args, kwds=kwargs)

    async def __aenter__(self):
        self.tracing = _tracer.start_as_current_span(
            self.func_name,
            **self.span_kwargs,
        )
        assert self.tracing is not None
        self.tracing.__enter__()
        return await super().__aenter__()

    async def __aexit__(self, exc_type, exc_value, traceback):
        assert self.tracing is not None, "__aenter__ was not called"
        self.tracing.__exit__(exc_type, exc_value, traceback)
        return await super().__aexit__(exc_type, exc_value, traceback)


def asynccontextmanager_span(**span_kwargs) -> Callable:
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
        filter_=filter_,
    )


def aio_client_interceptors():
    return opentelemetry.instrumentation.grpc.aio_client_interceptors() + [
        UnaryUnaryOpenTelemetryWorkaroundInterceptor(),
        StreamUnaryOpenTelemetryWorkaroundInterceptor()
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
