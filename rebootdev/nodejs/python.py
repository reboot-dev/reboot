import asyncio
import base64
import google.protobuf.json_format
import gzip
import importlib
import json
import os
import sys
import tempfile
import threading
from abc import abstractmethod
from google.protobuf import any_pb2
from google.protobuf.message import Message
from rbt.v1alpha1 import errors_pb2, tasks_pb2
from rebootdev.aio.aborted import Aborted, SystemAborted
from rebootdev.aio.auth import Auth
from rebootdev.aio.auth.authorizers import Authorizer
from rebootdev.aio.auth.token_verifiers import TokenVerifier
from rebootdev.aio.contexts import Context, ReaderContext, WorkflowContext
from rebootdev.aio.directories import chdir
from rebootdev.aio.external import ExternalContext
from rebootdev.aio.internals.contextvars import use_application_id
from rebootdev.run_environments import in_nodejs
from rebootdev.settings import ENVVAR_BAZEL_TEST
from typing import Awaitable, Callable, Optional, Sequence, TypeVar

# Callable into nodejs for launching a subprocess that gets installed
# from C++, see `PythonNodeAdaptor::Initialize` in
# 'reboot_native.cc'.
launch_subprocess_consensus: Callable[[str], Awaitable[str]]


class EventLoopThread:
    """Helper class for creating and running an event loop on a thread and
    performing callbacks on said event loop from C++ via calling
    `run_callback_on_event_loop()`.
    """

    def __init__(self):
        self._loop = asyncio.new_event_loop()

        def exception_handler(loop, context):
            # There are some exceptions that get raised due to the
            # async interplay of the Python and Node.js event loop. In
            # particular, there are code paths that are more
            # likely. The following are exception messages that we
            # have seen in practice that we empirically believe to be
            # harmless. Once we sort out these bugs for real we hope
            # to be able to remove this exception handler completely.
            if context[
                'message'
            ] == 'aclose(): asynchronous generator is already running':
                return
            else:
                error_message = str(
                    "Task exception was never retrieved, "
                    f"please report this to the maintainers: \n{context}"
                )

                print(error_message, file=sys.stderr)

        self._loop.set_exception_handler(exception_handler)

        def run_forever():
            asyncio.set_event_loop(self._loop)
            self._loop.run_forever()

        self._thread = threading.Thread(target=run_forever)
        self._thread.start()

    def run_callback_on_event_loop(self, callback):
        self._loop.call_soon_threadsafe(callback)


def import_py(module: str, base64_gzip_py: str):
    """Helper for importing Python source files from encoded base64 strings."""
    # If we've already loaded this module, return. This may be
    # possible if nodejs tries to load a '.js' file more than once
    # itself, which we haven't seen but have read is possible, so we
    # are being defensive here.
    if module in sys.modules:
        return

    # Write the source file out to disk in order to load it back in.
    #
    # We tried using `importlib.util` to create our own spec and
    # loader, and while we could successfully load some code, we
    # couldn't properly reference that loaded code in other files.
    with tempfile.TemporaryDirectory() as directory:
        with chdir(directory):
            path = f"{module.replace('.', os.path.sep)}.py"
            os.makedirs(os.path.dirname(path))
            with open(path, "w") as file:
                file.write(
                    gzip.decompress(
                        base64.b64decode(base64_gzip_py.encode('utf-8'))
                    ).decode('utf-8')
                )
                file.close()

            # Without clearing caches, loading modules from existing packages
            # can fail.
            importlib.invalidate_caches()

            # This does the actual loading.
            importlib.import_module(module)


def create_task(coro, **kwargs):
    """Wrapper around `asyncio.create_task` that catches `SystemExit` (which would otherwise
    not be handled by `add_done_callback`) into a generic `Exception`.
    """

    async def coro_with_handler():
        try:
            return await coro
        except SystemExit:
            raise Exception("System exiting.")

    return asyncio.create_task(coro_with_handler(), **kwargs)


def create_task_with_context(coro, context: Context, **kwargs):
    """Wrapper around `create_task` that ensures `context` and
    `application_id` are properly set up as context variables.
    """
    if isinstance(context, ExternalContext):
        return create_task(coro, **kwargs)

    async def coro_with_context():
        with context.use(), use_application_id(context.application_id):
            return await coro

    return create_task(coro_with_context(), **kwargs)


async def task_await(
    context: WorkflowContext | ExternalContext,
    state: type,
    method: str,
    json_task_id: str,
) -> str:
    """Helper for awaiting a scheduled/spawned task given a state and
    method name and task ID."""
    task = getattr(state, method + 'Task')(
        context,
        task_id=google.protobuf.json_format.Parse(
            json_task_id,
            tasks_pb2.TaskId(),
        ),
    )

    try:
        response = await task
    except BaseException as exception:
        if isinstance(exception, Aborted):
            return json.dumps(
                {
                    'status':
                        google.protobuf.json_format.MessageToDict(
                            exception.to_status()
                        )
                }
            )
        raise
    else:
        return json.dumps(
            {'response': google.protobuf.json_format.MessageToDict(response)}
        )


def _message_to_serialized_any(message: Message) -> bytes:
    any_pb = any_pb2.Any()
    any_pb.Pack(message)
    return any_pb.SerializeToString()


MessageT = TypeVar("MessageT", bound=Message)


def _serialized_any_to_expected_message(
    any_bytes: bytes, message_types: Sequence[type[MessageT]]
) -> MessageT:
    any_pb = any_pb2.Any()
    any_pb.ParseFromString(any_bytes)

    for message_type in message_types:
        if any_pb.Is(message_type.DESCRIPTOR):
            message = message_type()
            any_pb.Unpack(message)
            return message
    type_name = any_pb.type_url.split('/')[-1]
    raise RuntimeError(f"Unknown message type: {type_name}")


def should_print_stacktrace():
    NODEJS: bool = in_nodejs()

    REBOOT_BAZEL_TEST: bool = os.environ.get(
        ENVVAR_BAZEL_TEST,
        "false",
    ).lower() == "true"

    if NODEJS:
        if REBOOT_BAZEL_TEST:
            # Always print stack traces when running tests in Bazel.
            return True
        else:
            # When we are running this code within `node` we might want to log
            # things differently. For example, if we already have some logging
            # in our TypeScript code these logs may be redundant. Or we want to
            # avoid printing stack traces as those are Python specific.
            return False
    else:
        # Always print stack traces when running in Python.
        return True


class NodeAdaptorAuthorizer(Authorizer[Message, Message]):

    @abstractmethod
    async def _authorize(
        self,
        method_name: str,
        context: ReaderContext,
        cancelled: asyncio.Future[None],
        bytes_state: Optional[bytes],
        bytes_request: Optional[bytes],
    ) -> bytes:
        raise NotImplementedError

    async def authorize(
        self,
        *,
        method_name: str,
        context: ReaderContext,
        state: Optional[Message],
        request: Optional[Message],
        **kwargs,
    ) -> Authorizer.Decision:
        # Convert the Request type to Any, since it could be any of a
        # number of types.
        bytes_request = None if request is None else _message_to_serialized_any(
            request
        )

        bytes_state = None if state is None else state.SerializeToString()

        cancelled: asyncio.Future[None] = asyncio.Future()

        try:
            # TODO: `pybind` does not properly convert from keyword arguments on
            # methods which are marked `kw_only`, so this adaptor also converts
            # from `kwargs` to positional. See
            # https://github.com/pybind/pybind11/pull/5406
            bytes_decision = await self._authorize(
                method_name,
                context,
                cancelled,
                bytes_state,
                bytes_request,
            )
        except asyncio.CancelledError:
            cancelled.set_result(None)
            raise
        except BaseException as exception:
            # Turn this into a system aborted so that downstream
            # machinery handles it without printing Python stack
            # traces.
            raise SystemAborted(
                errors_pb2.Unknown(),
                message=f"unhandled while authorizing: {exception}"
            ) from None

        # Make sure we cancel the `cancelled` future so that we don't
        # keep around resources related to it that might cause us to
        # run out of memory or worse, keep Node from exiting because
        # it is waiting for Python.
        cancelled.cancel()

        return _serialized_any_to_expected_message(
            bytes_decision, [
                errors_pb2.Unauthenticated,
                errors_pb2.PermissionDenied,
                errors_pb2.Ok,
            ]
        )


class NodeAdaptorTokenVerifier(TokenVerifier):

    @abstractmethod
    async def _verify_token(
        self,
        context: ReaderContext,
        cancelled: asyncio.Future[None],
        token: Optional[str],
    ) -> Optional[bytes]:
        raise NotImplementedError()

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> Optional[Auth]:
        cancelled: asyncio.Future[None] = asyncio.Future()
        try:
            # TODO: See the note before the call in `NodeAdaptorAuthorizer`.
            auth_bytes = await self._verify_token(context, cancelled, token)
        except asyncio.CancelledError:
            cancelled.set_result(None)
            raise
        # Make sure we cancel the `cancelled` future so that we don't
        # keep around resources related to it that might cause us to
        # run out of memory or worse, keep Node from exiting because
        # it is waiting for Python.
        cancelled.cancel()
        if auth_bytes is None:
            return None
        return Auth.from_proto_bytes(auth_bytes)
