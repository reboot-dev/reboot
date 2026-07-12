import asyncio
import subprocess
import sys
import unittest
# This file is not generated yet, so turn off the check.
from bazel_init_test.v1.hello_world_rbt import HelloWorld  # noqa: F403
from cli import EXAMPLE_STATE_MACHINE_ID
from hello_world_servicer import HelloWorldServicer
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot


class TestHello(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_hello(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[HelloWorldServicer],
            ),
            local_envoy_port=9991,
            local_envoy=True,
            local_envoy_tls=False,
        )

        result = None
        try:
            # Run in a separate thread to avoid blocking
            # the event loop and allow gRPC servers to run.
            result = await asyncio.to_thread(
                subprocess.run,
                [sys.executable, 'backend/src/cli.py'],
                capture_output=True,
                text=True,
                check=True,
            )
        except subprocess.CalledProcessError as e:
            print("### cli.py failed ###")
            print(e.stdout)
            print(e.stderr)
            raise
        assert result is not None

        self.assertEqual(result.stdout, "Server now has 1 greeting!\n")
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        # HelloWorld will be imported from bazel_test.v1.hello_world_rbt as *.
        helloWorld = HelloWorld.ref(EXAMPLE_STATE_MACHINE_ID)  # noqa: F405

        response = await helloWorld.Greet(context)
        self.assertEqual(response.number_of_greetings, 2)


if __name__ == '__main__':
    unittest.main()
