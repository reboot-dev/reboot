import signal
import subprocess
import sys
import textwrap
import unittest
from reboot.aio import signals
from typing import Optional


def _custom_signal_handler_error(name: str, error: str) -> str:
    return (
        f"{error}: Reboot handles {name} itself, so custom signal "
        "handlers for it are not supported; install a cleanup handler "
        "with `reboot.aio.signals.install_cleanup()` or "
        "`reboot.aio.signals.cleanup_on_signal()` instead\n"
    )


_PRELUDE = '''
import asyncio, os, signal, threading, time
from reboot.aio import signals
'''


class SignalsTest(unittest.TestCase):
    """Each test runs its scenario in a fresh process, since signals
    are initialized once per process."""

    def _assert_run(
        self,
        code: str,
        *,
        stdout: str,
        returncode: int = 0,
        stderr: Optional[str] = None,
    ) -> None:
        process = subprocess.run(
            [sys.executable, '-c', _PRELUDE + textwrap.dedent(code)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(process.stdout, stdout, process.stderr)
        self.assertEqual(process.returncode, returncode, process.stderr)
        if stderr is not None:
            self.assertEqual(process.stderr, stderr)

    def test_install_cleanup_before_initialize_fails(self) -> None:
        self._assert_run(
            '''
            try:
                signals.install_cleanup([signal.SIGTERM], lambda: None)
            except RuntimeError as error:
                print(f"{type(error).__name__}: {error}")
            ''',
            stdout=(
                "RuntimeError: Signals are not initialized; call "
                "`reboot.aio.signals.initialize()` first\n"
            ),
        )

    def test_initialize_again_does_nothing(self) -> None:
        self._assert_run(
            '''
            signals.initialize()
            signals.install_cleanup(
                [signal.SIGTERM],
                lambda: print("cleanup", flush=True),
            )
            signals.initialize()
            os.kill(os.getpid(), signal.SIGTERM)
            time.sleep(60)
            ''',
            stdout="cleanup\n",
            returncode=-signal.SIGTERM,
        )

    def test_install_cleanup_with_custom_signal_handler_fails(self) -> None:
        self._assert_run(
            '''
            signal.signal(signal.SIGTERM, lambda signum, frame: None)
            signals.initialize()
            try:
                signals.install_cleanup([signal.SIGTERM], lambda: None)
            except RuntimeError as error:
                print(f"{type(error).__name__}: {error}")
            ''',
            stdout=_custom_signal_handler_error("SIGTERM", "RuntimeError"),
        )

    def test_install_cleanup_within_asyncio_run(self) -> None:
        # From Python 3.11 `asyncio.run()` installs a SIGINT handler of
        # its own, which is not a custom signal handler.
        self._assert_run(
            '''
            signals.initialize()

            async def main():
                signals.install_cleanup(
                    [signal.SIGINT],
                    lambda: print("cleanup", flush=True),
                )
                os.kill(os.getpid(), signal.SIGINT)
                await asyncio.sleep(60)

            asyncio.run(main())
            ''',
            stdout="cleanup\n",
            returncode=-signal.SIGINT,
        )

    def test_signal_fails_for_registered_signals_only(self) -> None:
        self._assert_run(
            '''
            signals.initialize()
            signals.install_cleanup([signal.SIGTERM])
            try:
                signal.signal(signal.SIGTERM, lambda signum, frame: None)
            except OSError as error:
                print(f"{type(error).__name__}: {error}")

            signal.signal(
                signal.SIGUSR1,
                lambda signum, frame: print("SIGUSR1", flush=True),
            )
            os.kill(os.getpid(), signal.SIGUSR1)

            signals.install_cleanup(
                [signal.SIGTERM],
                lambda: print("cleanup", flush=True),
            )
            os.kill(os.getpid(), signal.SIGTERM)
            time.sleep(60)
            ''',
            stdout=(
                _custom_signal_handler_error("SIGTERM", "OSError") +
                "SIGUSR1\n"
                "cleanup\n"
            ),
            returncode=-signal.SIGTERM,
        )

    def test_install_cleanup_registers_its_signals(self) -> None:
        self._assert_run(
            '''
            signals.initialize()
            signal.signal(signal.SIGHUP, signal.SIG_DFL)
            print("SIGHUP is not ours yet", flush=True)

            signals.install_cleanup(
                [signal.SIGHUP],
                lambda: print("cleanup", flush=True),
            )
            try:
                signal.signal(signal.SIGHUP, signal.SIG_DFL)
            except OSError as error:
                print(f"{type(error).__name__}: {error}")

            os.kill(os.getpid(), signal.SIGHUP)
            time.sleep(60)
            ''',
            stdout=(
                "SIGHUP is not ours yet\n" +
                _custom_signal_handler_error("SIGHUP", "OSError") + "cleanup\n"
            ),
            returncode=-signal.SIGHUP,
        )

    def test_install_cleanup_must_first_be_on_main_thread(self) -> None:
        self._assert_run(
            '''
            signals.initialize()

            def install():
                try:
                    signals.install_cleanup(
                        [signal.SIGTERM],
                        lambda: print("cleanup", flush=True),
                    )
                except RuntimeError as error:
                    print(f"{type(error).__name__}: {error}")
                else:
                    print("installed", flush=True)

            thread = threading.Thread(target=install)
            thread.start()
            thread.join()

            signals.install_cleanup([signal.SIGTERM])

            thread = threading.Thread(target=install)
            thread.start()
            thread.join()

            os.kill(os.getpid(), signal.SIGTERM)
            time.sleep(60)
            ''',
            stdout=(
                "RuntimeError: Reboot can only start handling SIGTERM "
                "from the main thread; call "
                "`reboot.aio.signals.install_cleanup()` with it from the "
                "main thread first\n"
                "installed\n"
                "cleanup\n"
            ),
            returncode=-signal.SIGTERM,
        )

    def test_cleanup_runs_for_every_terminating_signal(self) -> None:
        for signum in signals.TERMINATING_SIGNALS:
            name = signal.Signals(signum).name
            with self.subTest(name):
                self._assert_run(
                    f'''
                    signals.initialize()
                    signals.install_cleanup(
                        signals.TERMINATING_SIGNALS,
                        lambda: print("cleanup", flush=True),
                    )
                    os.kill(os.getpid(), signal.{name})
                    time.sleep(60)
                    ''',
                    stdout="cleanup\n",
                    returncode=-signum,
                )

    def test_cleanup_runs_before_signal_terminates_process(self) -> None:
        self._assert_run(
            '''
            signals.initialize()

            def uninstalled():
                print("uninstalled", flush=True)

            with signals.cleanup_on_signal(
                [signal.SIGTERM],
                handler=uninstalled,
            ):
                pass

            signals.install_cleanup(
                [signal.SIGTERM],
                lambda: print("cleanup", flush=True),
            )
            os.kill(os.getpid(), signal.SIGTERM)
            time.sleep(60)
            ''',
            stdout="cleanup\n",
            returncode=-signal.SIGTERM,
        )


if __name__ == '__main__':
    unittest.main()
