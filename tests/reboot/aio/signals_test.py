import signal
import subprocess
import sys
import textwrap
import unittest
from reboot.aio import signals

_PRELUDE = '''
import os, signal, time
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
    ) -> None:
        process = subprocess.run(
            [sys.executable, '-c', _PRELUDE + textwrap.dedent(code)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(process.stdout, stdout, process.stderr)
        self.assertEqual(process.returncode, returncode, process.stderr)

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
                "`reboot.aio.signals.initialize()` before installing a "
                "cleanup handler\n"
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

    def test_initialize_with_custom_signal_handler_fails(self) -> None:
        self._assert_run(
            '''
            signal.signal(signal.SIGTERM, lambda signum, frame: None)
            try:
                signals.initialize()
            except RuntimeError as error:
                print(f"{type(error).__name__}: {error}")
            ''',
            stdout=(
                "RuntimeError: Custom signal handlers are not (yet) "
                "supported; please remove your SIGTERM signal handler\n"
            ),
        )

    def test_install_cleanup_for_uninitialized_signal_fails(self) -> None:
        self._assert_run(
            '''
            signals.initialize()
            try:
                signals.install_cleanup([signal.SIGHUP], lambda: None)
            except ValueError as error:
                print(f"{type(error).__name__}: {error}")
            ''',
            stdout=(
                "ValueError: SIGHUP was not initialized; pass it to "
                "`reboot.aio.signals.initialize()`\n"
            ),
        )

    def test_initialize_again_with_other_signals_fails(self) -> None:
        self._assert_run(
            '''
            signals.initialize()
            signals.initialize([signal.SIGQUIT, signal.SIGTERM])
            try:
                signals.initialize(signals.TERMINATING_SIGNALS)
            except RuntimeError as error:
                print(f"{type(error).__name__}: {error}")
            ''',
            stdout=(
                "RuntimeError: Signals are already initialized with "
                "['SIGTERM', 'SIGQUIT'], and can not be initialized with "
                "['SIGINT', 'SIGQUIT', 'SIGHUP', 'SIGPIPE', 'SIGTERM']\n"
            ),
        )

    def test_cleanup_runs_for_every_terminating_signal(self) -> None:
        for signum in signals.TERMINATING_SIGNALS:
            name = signal.Signals(signum).name
            with self.subTest(name):
                self._assert_run(
                    f'''
                    signals.initialize(signals.TERMINATING_SIGNALS)
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

            with signals.cleanup_on_raise(
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
