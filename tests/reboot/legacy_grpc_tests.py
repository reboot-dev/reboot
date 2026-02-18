import aiohttp
import unittest
from google.protobuf import empty_pb2
from grpc import ChannelConnectivity, ssl_channel_credentials
from grpc.aio import secure_channel
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from reboot.ssl.localhost import LOCALHOST_CRT_DATA
from tests.reboot import greeter_pb2, greeter_pb2_grpc
from tests.reboot.greeter_rbt import Greeter, GreeterWriterStub
from tests.reboot.greeter_servicers import (
    MyClockServicer,
    MyColorMatcherServicer,
    MyGreeterServicer,
)


class LegacyGrpcTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_legacy_only(self) -> None:
        """Tests that legacy servicers can run without reboot servicers
        present."""
        await self.rbt.up(Application(legacy_grpc_servicers=[MyClockServicer]))
        context = self.rbt.create_external_context(name=self.id())

        # Demonstrate that the legacy servicer is up. In the process, we test
        # the `legacy_grpc_channel()` method's `LegacyGrpcChannel`.
        async with context.legacy_grpc_channel() as channel:
            # Basic state functionality.
            connectivity: ChannelConnectivity = channel.get_state_for_service(
                'tests.reboot.Clock'
            )
            self.assertEqual(connectivity, ChannelConnectivity.IDLE)

            # Unary-Unary calls.
            clock_stub = greeter_pb2_grpc.ClockStub(channel)
            response = await clock_stub.CurrentTime(empty_pb2.Empty())
            self.assertEqual(
                response.micros, MyClockServicer.START_TIME_MICROS
            )

            # The channel state change was noticed.
            await channel.wait_for_state_change_for_service(
                'tests.reboot.Clock',
                last_observed_state=ChannelConnectivity.IDLE
            )
            self.assertEqual(
                channel.get_state_for_service('tests.reboot.Clock'),
                ChannelConnectivity.READY
            )

            # Unary-Streaming calls.
            start_micros = response.micros
            micros_since_start = 0
            async for response in clock_stub.StreamCurrentTime(
                empty_pb2.Empty()
            ):
                self.assertEqual(
                    response.micros, start_micros + micros_since_start
                )
                micros_since_start += MyClockServicer.TIME_INCREMENT_MICROS
                if micros_since_start == 10 * MyClockServicer.MICROS_PER_SECOND:
                    break

            # Streaming-Unary calls.
            def streaming_requests():
                for _ in range(9):
                    yield greeter_pb2.StopwatchRequest()
                # The tenth request will be to stop the stopwatch.
                yield greeter_pb2.StopwatchRequest(stop=True)

            response = await clock_stub.Stopwatch(streaming_requests())
            self.assertEqual(
                [t.micros for t in response.times], [
                    start_micros + i * MyClockServicer.TIME_INCREMENT_MICROS
                    for i in range(10)
                ]
            )

            # Streaming-Streaming calls.
            num_responses = 0
            async for response in clock_stub.StreamStopwatch(
                streaming_requests()
            ):
                num_responses += 1
                self.assertEqual(
                    [t.micros for t in response.times], [
                        start_micros +
                        i * MyClockServicer.TIME_INCREMENT_MICROS
                        for i in range(num_responses)
                    ]
                )
            self.assertEqual(num_responses, 10)

    async def test_legacy_only_multiple_servicers(self) -> None:
        """Tests that multiple legacy servicers can run without reboot servicers
        present."""
        await self.rbt.up(
            Application(
                legacy_grpc_servicers=[
                    MyClockServicer,
                    MyColorMatcherServicer,
                ]
            )
        )
        context = self.rbt.create_external_context(name=self.id())

        # Demonstrate that the `legacy_grpc_channel()` method's
        # `LegacyGrpcChannel` can contact multiple different servicers.
        async with context.legacy_grpc_channel() as channel:
            # Call a first servicer.
            color_stub = greeter_pb2_grpc.ColorMatcherStub(channel)
            response = await color_stub.MatchColor(
                greeter_pb2.MatchColorRequest(color=greeter_pb2.Color.RED)
            )
            self.assertEqual(response.matching_color, greeter_pb2.Color.BLUE)

            # Call a second servicer on the same channel.
            clock_stub = greeter_pb2_grpc.ClockStub(channel)
            response = await clock_stub.CurrentTime(empty_pb2.Empty())
            self.assertEqual(
                response.micros, MyClockServicer.START_TIME_MICROS
            )

    async def test_legacy_and_reboot(self) -> None:
        """Tests that both legacy and reboot servicers can run at the same
        time."""
        await self.rbt.up(
            Application(
                servicers=[MyGreeterServicer], legacy_grpc_servicers=[
                    MyClockServicer,
                    MyColorMatcherServicer,
                ]
            )
        )
        context = self.rbt.create_external_context(name=self.id())

        # Demonstrate that the legacy servicers are up.
        async with context.legacy_grpc_channel() as channel:
            clock_stub = greeter_pb2_grpc.ClockStub(channel)
            response = await clock_stub.CurrentTime(empty_pb2.Empty())
            self.assertEqual(
                response.micros, MyClockServicer.START_TIME_MICROS
            )

            color_stub = greeter_pb2_grpc.ColorMatcherStub(channel)
            response = await color_stub.MatchColor(
                greeter_pb2.MatchColorRequest(color=greeter_pb2.Color.GREEN)
            )
            self.assertEqual(response.matching_color, greeter_pb2.Color.BLUE)

        # Demonstrate that the reboot servicer is working.
        greeter_stub = GreeterWriterStub(
            context,
            state_ref=StateRef.from_id(
                Greeter.__state_type_name__, 'test-1234'
            ),
        )
        await greeter_stub.Create(
            greeter_pb2.CreateRequest(
                title='Baby', name='Jonathan', adjective='tiny'
            )
        )

    async def test_http_through_local_envoy(self) -> None:
        """
        Tests that legacy gRPC servicers can be reached through Envoy
        
        This includes HTTP transcoding and SSL termination.
        """
        await self.rbt.up(
            Application(legacy_grpc_servicers=[MyClockServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # Enables TLS/SSL termination.
        )

        # Make a plain HTTPS call. All Reboot-hosted services (including
        # legacy gRPC ones) have such an endpoint available. The proxy
        # will transcode to/from gRPC.
        uri = self.rbt.url('/tests.reboot.Clock/CurrentTime')
        self.assertTrue(uri.startswith("https://"), uri)

        async with aiohttp.ClientSession() as session:
            async with session.request(
                "POST",
                uri,
                ssl=False,  # Disables SSL verification; self-signed cert.
            ) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(
                    response.headers['content-type'], 'application/json'
                )
                self.assertEqual(
                    await response.json(),
                    {'micros': f'{MyClockServicer.START_TIME_MICROS}'}
                )

        # We can also make the same call to a user-defined arbitrary HTTP path,
        # even using GET instead of POST.
        uri = self.rbt.url('/current_time')

        async with aiohttp.ClientSession() as session:
            async with session.request(
                'GET',
                uri,
                ssl=False,  # Disable SSL verification; self-signed cert.
            ) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(
                    response.headers['content-type'], 'application/json'
                )
                self.assertEqual(
                    await response.json(),
                    {'micros': f'{MyClockServicer.START_TIME_MICROS}'}
                )

    async def test_grpc_through_local_envoy(self) -> None:
        """Tests that plain gRPC traffic can be passed through the LocalEnvoy
        proxy without transcoding."""
        await self.rbt.up(
            Application(legacy_grpc_servicers=[MyClockServicer]),
            local_envoy=True,
            local_envoy_tls=True,
        )

        # Send a plain gRPC request to the legacy server via the LocalEnvoy
        # proxy.
        envoy_endpoint = self.rbt.localhost_direct_endpoint()

        async with secure_channel(
            envoy_endpoint,
            ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        ) as channel:
            clock_stub = greeter_pb2_grpc.ClockStub(channel)
            response = await clock_stub.CurrentTime(empty_pb2.Empty())
            self.assertEqual(
                response.micros, MyClockServicer.START_TIME_MICROS
            )

    async def test_error_if_not_a_servicer(self) -> None:
        with self.assertRaises(ValueError) as caught:
            # `ExternalContext` here stands in for any object passed to
            # `legacy_grpc_servicers` that is not a gRPC servicer.
            await self.rbt.up(
                Application(legacy_grpc_servicers=[ExternalContext])
            )
        self.assertIn(
            'is not a legacy gRPC servicer', caught.exception.args[0]
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
