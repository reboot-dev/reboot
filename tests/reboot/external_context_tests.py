import asyncio
import socket
import tests.reboot.general_rbt
import threading
import unittest
from google.protobuf import empty_pb2
from log.log import get_logger
from rbt.v1alpha1.errors_pb2 import Unavailable
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from reboot.settings import GRPC_KEEPALIVE_TIME_MS, GRPC_KEEPALIVE_TIMEOUT_MS
from tests.reboot import greeter_rbt
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer
from tests.reboot.greeter_rbt import Greeter, GreeterWriterStub
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import Any, AsyncIterable, Callable, ClassVar, Coroutine

logger = get_logger(__name__)


class FreezingProxy:
    """
    A proxy that can freeze all network traffic it proxies.

    This proxy can simulates network traffic simply not arriving from
    client to server while still keeping the sockets on both ends intact
    ("freezing"). This matches the behavior observed in
    https://github.com/reboot-dev/mono/issues/4548.

    Note that this requires a separate proxy, because methods like e.g.
    killing an intermediary Envoy or `Reboot.down()`ing the servicer
    will break the socket, which isn't the same as the socket simply
    going unresponsive.
    """

    def __init__(self, target_host: str, target_port: int):
        self.target_host = target_host
        self.target_port = target_port
        self.running = False
        # Each connection is numbered sequentially.
        self.next_connection_number = 0
        # Any traffic on a connection with a number <= this threshold
        # will have its traffic dropped.
        self.frozen_connections_threshold = -1

    def start(self):
        self.running = True
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(
            socket.SOL_SOCKET, socket.SO_REUSEADDR, 1
        )
        self.server_socket.bind(
            # Let OS pick an available port.
            ('127.0.0.1', 0)
        )
        self._listen_port = self.server_socket.getsockname()[1]
        self.server_socket.listen(5)

        self.accept_thread = threading.Thread(target=self._accept_connections)
        self.accept_thread.daemon = True
        self.accept_thread.start()

    def port(self):
        """Return the dynamically assigned port number."""
        if self._listen_port is None:
            raise RuntimeError("Proxy hasn't been started yet")
        return self._listen_port

    def freeze_current_connections(self):
        """
        Freeze all connections that have been accepted so far.

        Allow new connections to work as normal.
        """
        self.frozen_connections_threshold = self.next_connection_number - 1

    def _accept_connections(self):
        while self.running:
            try:
                client_sock, _ = self.server_socket.accept()
                server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                server_sock.connect((self.target_host, self.target_port))

                connection_number = self.next_connection_number
                self.next_connection_number += 1

                client_thread = threading.Thread(
                    target=self._handle_connection, args=(
                        connection_number,
                        client_sock,
                        server_sock,
                        "client->server",
                    )
                )
                server_thread = threading.Thread(
                    target=self._handle_connection, args=(
                        connection_number,
                        server_sock,
                        client_sock,
                        "server->client",
                    )
                )

                client_thread.daemon = True
                server_thread.daemon = True
                client_thread.start()
                server_thread.start()
            except Exception as e:
                if self.running:
                    print(f"Accept error: {e}")

    def _handle_connection(
        self, number: int, src_sock, dst_sock, direction: str
    ):
        try:
            while self.running:
                data = src_sock.recv(4096)
                if not data:
                    break

                # Simulate network freeze if enabled.
                if number <= self.frozen_connections_threshold:
                    # Drop all traffic, in either direction.
                    logger.warning(
                        f"DROPPING {len(data)} bytes '{direction}' on "
                        f"connection {number}"
                    )
                    continue

                dst_sock.sendall(data)
        except Exception:
            # Connection errors happen, especially as clients decide to
            # go away after timeouts.
            pass
        finally:
            src_sock.close()
            dst_sock.close()

    def stop(self):
        self.running = False
        self.server_socket.close()


class BlockingServicer(GeneralServicer):

    have_call: ClassVar[asyncio.Event] = asyncio.Event()
    unblocked: ClassVar[asyncio.Event] = asyncio.Event()

    def __init__(self):
        # Reset the events. This has to recreate the `Event` objects,
        # since each test is run in a different event loop, and Python
        # doesn't like it when you try to use the same `Event` in
        # multiple event loops.
        BlockingServicer.have_call = asyncio.Event()
        BlockingServicer.unblocked = asyncio.Event()

    def authorizer(self):
        return allow()

    async def ConstructorWriter(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        self.have_call.clear()
        self.unblocked.clear()  # Start blocked.
        return GeneralResponse()

    async def Reader(
        self,
        context: ReaderContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        self.have_call.set()
        await self.unblocked.wait()
        return GeneralResponse(content=state.content)

    async def ServerStreamingReader(
        self,
        context: ReaderContext,
        states: AsyncIterable[General.State],
        request: GeneralRequest,
    ) -> AsyncIterable[GeneralResponse]:
        self.have_call.set()
        await self.unblocked.wait()
        yield GeneralResponse()

    async def ClientStreamingReader(
        self,
        context: ReaderContext,
        states: AsyncIterable[General.State],
        requests: AsyncIterable[GeneralRequest],
    ) -> GeneralResponse:
        self.have_call.set()
        await self.unblocked.wait()
        return GeneralResponse()

    async def Writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        # Increment the counter in the state by one every time
        # this writer completes. That lets us count how often
        # this writer executed.
        current_count = int(state.content.get("counter") or "0")
        state.content["counter"] = str(current_count + 1)

        self.have_call.set()
        await self.unblocked.wait()
        return GeneralResponse()


class ExternalContextTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_external_context_not_constructible_in_servicer(
        self
    ) -> None:
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = GreeterWriterStub(
            context,
            state_ref=StateRef.from_id(
                Greeter.__state_type_name__, 'test-1234'
            ),
        )

        await stub.Create(
            greeter_rbt.CreateRequest(
                title='Dr', name='Jonathan', adjective='best'
            )
        )

        with self.assertRaises(
            Greeter.TryToConstructExternalContextAborted
        ) as aborted:
            await stub.TryToConstructExternalContext(empty_pb2.Empty())

        self.assertIn(
            "Can not construct an ExternalContext from within a servicer",
            str(aborted.exception)
        )

    async def _test_keepalive_and_retry(
        self, make_call: Callable[[ExternalContext, General.WeakReference],
                                  Coroutine[Any, Any, None]]
    ) -> None:

        await self.rbt.up(
            Application(servicers=[BlockingServicer]),
            # Use a LocalEnvoy to get an easy-to-obtain public port for
            # the application.
            #
            # TODO(rjh): if we had a way to obtain a server port for
            #            the application without starting Envoy, we
            #            could stop using Envoy here.
            local_envoy=True,
            local_envoy_tls=True,  # For test coverage of TLS system.
        )

        real_port = int(
            self.rbt.url().removeprefix("https://").removeprefix("http://").
            rsplit(":", 1)[1]
        )

        # Start our custom "freezing" proxy server; it will blindly
        # forward traffic to Envoy - until it doesn't.
        proxy = FreezingProxy(
            target_host='localhost',
            target_port=real_port  # Forward to real server
        )
        proxy.start()
        self.addCleanup(proxy.stop)

        proxied_url = self.rbt.url().rsplit(":", 1)[0] + f":{proxy.port()}"
        context = ExternalContext(
            # Must use the URL to ensure the call goes via the local
            # envoy, not direct to the server.
            url=proxied_url,
            name="test_keepalive_and_retry_unary_reader",
        )
        general, _ = await General.ConstructorWriter(context)

        call_task: asyncio.Task[None] = asyncio.create_task(
            make_call(context, general)
        )

        # Wait until we know the call is blocked.
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(BlockingServicer.have_call.wait()),
                call_task
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        self.assertIn(call_task, pending)
        for done_task in done:
            await done_task  # Ensure no exceptions are raised.

        # Block traffic to and from the server, but don't break the
        # socket.
        logger.warning("!!! Freezing all current connections !!!")
        proxy.freeze_current_connections()

        # Unblock all calls in the servicer. The original call will
        # complete, but its response will be lost. A retry will succeed.
        BlockingServicer.unblocked.set()

        # The keepalive mechanism should detect the connection error
        # well within the following time period, and either...
        # A) a retry should provide us with a healthy response, or...
        # B) for calls that can't be retried, an `Unavailable` error
        #    should be raised.
        #
        # NOTE: if the following times out, see the `BUILD` file entry
        #       for this test for helpful gRPC debugging environment
        #       variable configuration.
        await asyncio.wait_for(
            call_task,
            timeout=(
                (
                    GRPC_KEEPALIVE_TIME_MS / 1000 +
                    GRPC_KEEPALIVE_TIMEOUT_MS / 1000
                ) * 3
            ),
        )

    async def test_keepalive_and_retry_unary_reader(self) -> None:
        """
        Tests that unary reader calls ARE transparently retried.
        """

        async def call(
            context: ExternalContext, general: General.WeakReference
        ) -> None:
            await general.Reader(context)

        await self._test_keepalive_and_retry(call)

    async def test_keepalive_and_retry_reactive_reader(self) -> None:
        """
        Tests that reactive reader calls ARE transparently retried.
        """

        async def call(
            context: ExternalContext, general: General.WeakReference
        ) -> None:
            async for _ in general.reactively().Reader(context):
                # As soon as we receive a response, we consider the call
                # done.
                break

        await self._test_keepalive_and_retry(call)

    async def test_keepalive_and_no_retry_server_streaming_reader(
        self
    ) -> None:
        """
        Tests that server-streaming calls are NOT retried.

        This also shows that these calls DO detect a frozen connection
        and raise an `Unavailable` error if this happens.
        """

        async def call(
            context: ExternalContext, general: General.WeakReference
        ) -> None:
            async for response in general.ServerStreamingReader(context):
                pass

        # Server-streaming calls are NOT retried. We expect to see an
        # `Unavailable` error as soon as the connection is frozen.
        with self.assertRaises(General.ServerStreamingReaderAborted) as raised:
            await self._test_keepalive_and_retry(call)
        self.assertEqual(Unavailable, type(raised.exception.error))
        self.assertEqual("ping timeout", str(raised.exception.message))

    async def test_keepalive_and_no_retry_client_streaming_reader(
        self
    ) -> None:
        """
        Tests that client-streaming calls are NOT retried.

        This also shows that these calls DO detect a frozen connection
        and raise an `Unavailable` error if this happens.
        """

        async def requests() -> AsyncIterable[GeneralRequest]:
            for _ in range(10):
                yield GeneralRequest()

        async def call(
            context: ExternalContext, general: General.WeakReference
        ) -> None:
            await general.ClientStreamingReader(
                context,
                # TODO(rjh): we should probably not need to use a
                # keyword argument here.
                __requests__=requests(),
            )

        # Client-streaming calls are NOT retried. We expect to see an
        # `Unavailable` error as soon as the connection is frozen.
        with self.assertRaises(General.ClientStreamingReaderAborted) as raised:
            await self._test_keepalive_and_retry(call)
        self.assertEqual(Unavailable, type(raised.exception.error))
        self.assertEqual("ping timeout", str(raised.exception.message))

    async def test_keepalive_and_retry_writer(self) -> None:
        """
        Tests that writer calls ARE transparently retried.

        Furthermore, it tests that they are _idempotently_ retried.
        """

        async def call(
            context: ExternalContext, general: General.WeakReference
        ) -> None:
            await general.Writer(context)

            # The writer was retried in order to succeed. Nevertheless
            # we only expect its state effect to be applied once,
            # because the retry mechanism is idempotent.
            response = await general.Reader(context)
            self.assertEqual(response.content.get("counter"), "1")

        await self._test_keepalive_and_retry(call)

    async def test_keepalive_and_retry_spawn_task(self) -> None:
        """
        Tests that spawn() calls ARE transparently retried.

        Furthermore, it tests that they are _idempotently_ retried.
        """

        # NOTE: this test is a little more complicated than the others
        #       in this file, since we want to force a retry inside
        #       `spawn()`, which (unlike all other test cases) means
        #       that the `FreezingProxy` will have to activate _before_
        #       any calls are made to the user-written servicer. We
        #       instead hook into a test hook in the generated
        #       server-side code.
        original_servicer_tasks = tests.reboot.general_rbt.GeneralServicerTasks

        class GeneralServicerTasksOverride(
            tests.reboot.general_rbt.GeneralServicerTasks
        ):
            """
            Override the `Writer` method to block until the test
            unblocks it.
            """

            async def Writer(self, request, *, schedule=None):
                """
                This is called as a task is scheduled. Have it signal to
                the test that a call has been made, then block until told to
                unblock.
                """
                BlockingServicer.have_call.set()
                await BlockingServicer.unblocked.wait()
                return await super().Writer(request, schedule=schedule)

        tests.reboot.general_rbt.GeneralServicerTasks = GeneralServicerTasksOverride  # type: ignore[misc]

        def cleanup_testhook():
            tests.reboot.general_rbt.GeneralServicerTasks = original_servicer_tasks  # type: ignore[misc]

        self.addCleanup(cleanup_testhook)

        async def call(
            context: ExternalContext, general: General.WeakReference
        ) -> None:
            task = await general.spawn().Writer(context)
            # The test must have caused us to have blocked on the call
            # to spawn(). We made it here only because the call was
            # retried.
            assert BlockingServicer.have_call.is_set()
            # The call to spawn() eventually completed, so the task must
            # complete also.
            await task

            # The call to `spawn()` must have been retried in order to
            # succeed. Nevertheless we only expect its writer's state
            # effect to be applied once, because the retry mechanism is
            # idempotent.
            response = await general.Reader(context)
            self.assertEqual(response.content.get("counter"), "1")

        await self._test_keepalive_and_retry(call)

    async def test_keepalive_and_retry_await_task(self) -> None:
        """
        Tests that awaiting a task is transparently retried.
        """

        async def call(
            context: ExternalContext, general: General.WeakReference
        ) -> None:
            task = await general.spawn().Writer(context)
            # This test did NOT cause `spawn()` to retry, but we _will_
            # have to retry the call that's made for `await task`, since
            # the freezing proxy will kick in as soon as the
            # `BlockingServicer.Writer()` is run, before it can return a
            # result to any `await` call.
            await task

        await self._test_keepalive_and_retry(call)


if __name__ == '__main__':
    unittest.main(verbosity=2)
