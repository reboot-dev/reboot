import asyncio
import grpc.aio
import reboot.aio.health_check
import unittest
from grpc_health.v1 import health_pb2, health_pb2_grpc
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.ssl.localhost import LOCALHOST_CRT_DATA
from tests.reboot.echo_servicers import MyEchoServicer
from unittest.mock import patch


class HealthServicerTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_health_check_direct(self) -> None:
        """
        Test the health check endpoint directly using the gRPC stub.

        Brings up a Reboot application and verifies that the health check
        endpoint returns SERVING status.
        """
        # Bring up a service.
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
        )

        # Create a secure channel to the server.
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            credentials=grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            ),
        )

        # Create a health check stub and perform a health check.
        stub = health_pb2_grpc.HealthStub(channel)
        request = health_pb2.HealthCheckRequest()
        response = await stub.Check(request)

        # Verify that the service is healthy.
        self.assertEqual(
            response.status,
            health_pb2.HealthCheckResponse.SERVING,
        )

        await channel.close()

    async def test_health_check_helper(self) -> None:
        """
        Test using the reboot.aio.health_check.do_health_check helper.

        Verifies that the helper function correctly waits for the
        application to become healthy.
        """
        # Bring up a service.
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,
        )

        # Use the health check helper function. This should succeed
        # without raising an exception.
        await reboot.aio.health_check.do_health_check(
            application_url=self.rbt.https_localhost_direct_url(),
            log_function=lambda _: None,  # Suppress log output.
            max_backoff_seconds=1,
            timeout_seconds=30,
        )

        # If we get here, the health check succeeded.

    async def test_health_check_timeout_when_websocket_blocked(self) -> None:
        """
        Test that the health check fails when the websocket is blocked.

        Verifies that the health check properly fails and times out when
        the websocket server is not responding. This demonstrates that
        the health check is actually performing a real websocket
        connection check rather than just returning SERVING
        unconditionally.
        """
        # Bring up a service.
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
        )

        # Create a mock websocket that blocks indefinitely.
        async def blocking_websocket_connect(*args, **kwargs):
            # Block forever by waiting on an event that never gets set.
            await asyncio.Event().wait()

        # Patch the websocket connect to block.
        with patch(
            'reboot.aio.internals.health_servicer.websockets.connect',
            side_effect=blocking_websocket_connect,
        ):
            # Try to perform a health check with a short timeout. This should
            # fail with a TimeoutError because the websocket is blocked.
            with self.assertRaises(TimeoutError) as context:
                await reboot.aio.health_check.do_health_check(
                    application_url=self.rbt.http_localhost_url(),
                    log_function=lambda _: None,  # Suppress log output.
                    max_backoff_seconds=1,
                    timeout_seconds=3,
                )

            # Verify the error message mentions the timeout.
            self.assertIn('Timed out', str(context.exception))


if __name__ == '__main__':
    unittest.main()
