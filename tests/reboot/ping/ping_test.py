import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.ping.ping import PingServicer, PongServicer
from reboot.ping.ping_api_rbt import Ping, Pong


class PingTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_ping_periodically(self):
        await self.rbt.up(
            Application(servicers=[PingServicer, PongServicer]),
        )

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        ping = Ping.ref("my-ping")

        num_pings = 3

        response = await ping.do_ping_periodically(
            context,
            num_pings=num_pings,
            # Use a short period to make the test run fast.
            period_seconds=0.1,
        )
        self.assertEqual(response.num_pings, num_pings)

        # Verify that the pong was also called the same number of times.
        pong = Pong.ref("my-ping")
        pong_response = await pong.num_pongs(context)
        self.assertEqual(pong_response.num_pongs, num_pings)


if __name__ == '__main__':
    unittest.main()
