import asyncio
import os
import signal
import subprocess
import sys
import unittest
from reboot.aio.signals import (
    cancel_main_task_on,
    install_cleanup,
    raised_signal,
)


class SignalsTest(unittest.TestCase):

    def test_cancel_main_task_on(self) -> None:
        cleanups: list[int] = []

        # Claims `SIGTERM` for the cleanup-then-exit handler, which
        # `cancel_main_task_on()` must be able to supersede.
        install_cleanup([signal.SIGTERM], lambda: cleanups.append(1))

        async def main() -> None:
            cancel_main_task_on([signal.SIGTERM])
            os.kill(os.getpid(), signal.SIGTERM)
            await asyncio.sleep(60)

        with self.assertRaises(asyncio.CancelledError):
            asyncio.run(main())

        self.assertEqual(raised_signal(), signal.SIGTERM)

        # Cleanup handlers wait for `exit_by_raised_signal()`.
        self.assertEqual(cleanups, [])

    def test_exit_by_raised_signal(self) -> None:
        process = subprocess.run(
            [
                sys.executable,
                '-c',
                '''
import asyncio, os, signal
from reboot.aio.signals import (
    cancel_main_task_on, exit_by_raised_signal, install_cleanup,
)

install_cleanup([signal.SIGTERM], lambda: print("cleanup", flush=True))

async def main():
    cancel_main_task_on([signal.SIGTERM, signal.SIGINT])
    try:
        os.kill(os.getpid(), signal.SIGTERM)
        await asyncio.sleep(60)
    finally:
        # Further signals while unwinding must not abandon this cleanup.
        os.kill(os.getpid(), signal.SIGTERM)
        os.kill(os.getpid(), signal.SIGINT)
        await asyncio.sleep(0.1)
        print("cleanup finished", flush=True)

try:
    asyncio.run(main())
except asyncio.CancelledError:
    print("unwound", flush=True)
    exit_by_raised_signal()
print("unreachable", flush=True)
''',
            ],
            stdout=subprocess.PIPE,
            text=True,
        )
        # The main task unwound first, undisturbed by the further
        # signals, then the cleanup handler ran, then the process died
        # by the first signal's default action.
        self.assertEqual(
            process.stdout, "cleanup finished\nunwound\ncleanup\n"
        )
        self.assertEqual(process.returncode, -signal.SIGTERM)

    def test_refuses_foreign_handler(self) -> None:
        previous = signal.signal(signal.SIGHUP, lambda signum, frame: None)
        try:

            async def main() -> None:
                cancel_main_task_on([signal.SIGHUP])

            with self.assertRaises(RuntimeError):
                asyncio.run(main())
        finally:
            signal.signal(signal.SIGHUP, previous)


if __name__ == '__main__':
    unittest.main()
