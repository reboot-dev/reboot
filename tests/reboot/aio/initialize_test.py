"""
Test to verify that reboot.aio.tests.Reboot properly calls the `initialize`
function when passed an Application with an initialize function.

This is a regression test for the issue reported in GitHub issue #4590.
"""

import unittest
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.std.collections.v1.sorted_map import sorted_map_library


class InitializeTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_initialize_function_is_called(self) -> None:
        """
        Test that when passing an Application with an initialize function
        to Reboot.up(), the initialize function is actually called.
        """
        initialize_called = False

        async def initialize(context: ExternalContext) -> None:
            nonlocal initialize_called
            initialize_called = True
            # We don't need to do anything else in initialize for this test.

        # This should call the initialize function
        await self.rbt.up(
            Application(
                libraries=[sorted_map_library()],
                initialize=initialize,
            )
        )

        # The initialize function should have been called
        self.assertTrue(
            initialize_called,
            "The initialize function was not called when using tests.Reboot.up() with an Application"
        )

    async def test_initialize_function_with_retry(self) -> None:
        """
        Test that when the initialize function fails initially but succeeds
        on retry, the retry logic works correctly.
        """
        attempt_count = 0

        async def failing_then_succeeding_initialize(
            context: ExternalContext
        ) -> None:
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count == 1:
                # Fail on first attempt.
                raise RuntimeError("First attempt fails")
            # Succeed on second attempt.

        # This should eventually succeed after the first retry.
        await self.rbt.up(
            Application(
                libraries=[sorted_map_library()],
                initialize=failing_then_succeeding_initialize,
            )
        )

        # Verify that the initialize function was called at least twice.
        self.assertGreaterEqual(
            attempt_count, 2,
            "The initialize function should have been retried at least once"
        )


if __name__ == "__main__":
    unittest.main()
