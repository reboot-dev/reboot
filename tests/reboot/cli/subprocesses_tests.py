import asyncio
import gc
import psutil
import unittest
from reboot.cli.common import subprocesses
from unittest.mock import patch


class TerminateTest(unittest.IsolatedAsyncioTestCase):
    """Leaving `async with subprocesses.exec(...)` terminates the
    process: asked to stop first, and given time to, since a process
    that is stopping may be cleaning up, with processes of its own;
    killed only if it does not."""

    async def asyncSetUp(self) -> None:
        self.subprocesses = subprocesses.Subprocesses()

    async def asyncTearDown(self) -> None:
        # Only one instance may be alive, and it is kept by a weak
        # reference, so let go of it before the next test.
        del self.subprocesses
        gc.collect()

    @staticmethod
    async def _ready(process: asyncio.subprocess.Process) -> None:
        """Waits for the process to say it has set up its handling of
        SIGTERM, so that it is in place when the signal comes."""
        assert process.stdout is not None
        line = await asyncio.wait_for(process.stdout.readline(), timeout=10.0)
        assert line == b'ready\n', line

    @staticmethod
    def _script(on_term: str) -> str:
        """A shell script that handles SIGTERM with `on_term`, says it
        is ready, and then loops. Its stdout is closed before the loop
        so that nothing it starts holds our end of the pipe open."""
        return (
            f'trap "{on_term}" TERM; echo ready; exec >/dev/null; '
            'while :; do sleep 0.05; done'
        )

    async def test_a_process_gets_to_stop_on_its_own(self) -> None:
        """A process whose stopping takes longer than the tenth of a
        second it used to get, and the second before it was killed,
        exits the way it meant to."""
        async with self.subprocesses.exec(
            'sh',
            '-c',
            self._script('sleep 1.5; exit 0'),
            stdout=asyncio.subprocess.PIPE,
        ) as process:
            await self._ready(process)
        self.assertEqual(process.returncode, 0)

    async def test_a_process_that_ignores_the_signal_is_killed(self) -> None:
        """Once the grace is up, by a signal it can not ignore. (The
        return code is not the signal's: `psutil.wait_procs` reaps the
        process before asyncio gets to, which then reports 255.)"""
        with patch.object(subprocesses, 'TERMINATE_GRACE_SECONDS', 0.2):
            async with self.subprocesses.exec(
                'sh',
                '-c',
                self._script(''),
                stdout=asyncio.subprocess.PIPE,
            ) as process:
                await self._ready(process)
        self.assertNotEqual(process.returncode, 0)

    async def test_a_cancellation_does_not_cut_terminating_short(
        self,
    ) -> None:
        """A cancellation that lands while the process is being
        terminated, e.g., a signal to `rbt dev run` during the grace it
        gives an application it is restarting, propagates once the
        process is gone, not before, so that a process that ignores
        the signal still gets killed."""
        process_future = asyncio.get_running_loop().create_future()

        async def run() -> None:
            async with self.subprocesses.exec(
                'sh',
                '-c',
                # Says on stderr that it was asked to stop, and then
                # ignores that; stdout is closed by then.
                self._script('echo terminated >&2'),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            ) as process:
                process_future.set_result(process)
                await self._ready(process)

        with patch.object(subprocesses, 'TERMINATE_GRACE_SECONDS', 0.5):
            task = asyncio.create_task(run())
            process = await process_future
            # Once the process has been asked to stop, terminating it
            # is in its grace wait: nothing is awaited in between.
            assert process.stderr is not None
            line = await asyncio.wait_for(
                process.stderr.readline(),
                timeout=10.0,
            )
            self.assertEqual(line, b'terminated\n')
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

        self.assertFalse(psutil.pid_exists(process.pid))


if __name__ == '__main__':
    unittest.main()
