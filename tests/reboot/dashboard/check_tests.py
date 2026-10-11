"""Timing one check a watcher makes of the developer's files."""
import asyncio
import unittest
from reboot.dashboard.backend.check import CheckError, timed


class TimedTest(unittest.IsolatedAsyncioTestCase):

    async def test_a_body_that_returns_is_a_check_that_finished(self) -> None:

        async def body() -> str:
            # Sleeps so that the body runs for long enough to measure,
            # and `took` can be asserted to be more than zero: one that
            # returns at once can finish within a single tick of a
            # coarse monotonic clock, such as Windows', which measures
            # zero.
            await asyncio.sleep(0.01)
            return 'result'

        result, check = await timed(body)

        self.assertEqual(result, 'result')
        self.assertTrue(check.HasField('at'))
        self.assertGreater(check.took.ToNanoseconds(), 0)
        self.assertFalse(check.HasField('failure'))

    async def test_a_body_that_raises_is_a_check_that_failed(self) -> None:
        error = RuntimeError('pyright exited')

        async def body() -> str:
            # Sleeps so that the body runs for long enough to measure,
            # and `took` can be asserted to be more than zero: one that
            # returns at once can finish within a single tick of a
            # coarse monotonic clock, such as Windows', which measures
            # zero.
            await asyncio.sleep(0.01)
            raise error

        with self.assertRaises(CheckError) as raised:
            await timed(body)

        # The check says when it failed, how long it ran and why, and
        # what the body raised is kept as the cause.
        check = raised.exception.check
        self.assertTrue(check.HasField('at'))
        self.assertGreater(check.took.ToNanoseconds(), 0)
        self.assertEqual(check.failure, 'pyright exited')
        self.assertIs(raised.exception.__cause__, error)

    async def test_a_failure_without_a_message_is_named(self) -> None:

        async def body() -> str:
            raise TimeoutError()

        with self.assertRaises(CheckError) as raised:
            await timed(body)

        self.assertEqual(raised.exception.check.failure, 'TimeoutError')


if __name__ == '__main__':
    unittest.main()
