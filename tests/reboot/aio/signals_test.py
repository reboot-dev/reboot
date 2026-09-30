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
            stdout=_custom_signal_handler_error("SIGTERM", "RuntimeError"),
        )

    def test_signal_fails_for_initialized_signals_only(self) -> None:
        self._assert_run(
            '''
            signals.initialize()
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

    def test_add_signal_handler_fails_for_initialized_signals_only(
        self,
    ) -> None:
        self._assert_run(
            '''
            signals.initialize()

            async def main():
                loop = asyncio.get_running_loop()
                try:
                    loop.add_signal_handler(
                        signal.SIGTERM,
                        lambda: print("SIGTERM handler ran", flush=True),
                    )
                except OSError as error:
                    print(f"{type(error).__name__}: {error}")

                received = asyncio.Event()
                loop.add_signal_handler(signal.SIGUSR1, received.set)
                os.kill(os.getpid(), signal.SIGUSR1)
                await received.wait()
                print("SIGUSR1", flush=True)

                # The loop must not have kept the handler it was
                # refused, so nothing but ours runs.
                async with signals.cancel_on_signal():
                    os.kill(os.getpid(), signal.SIGTERM)
                    await asyncio.sleep(60)

            # Closing the loop removes the handlers it installed, which
            # must not include the one it was refused, or it would
            # fail, and print a stack trace.
            asyncio.run(main())
            ''',
            stdout=(
                _custom_signal_handler_error("SIGTERM", "OSError") +
                "SIGUSR1\n"
            ),
            returncode=-signal.SIGTERM,
            stderr="",
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

    def test_signal_cancels_task_within_cancel_on_signal(self) -> None:
        # What `rbt` does.
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

                    async def main():
                        async with signals.cancel_on_signal():
                            # While the event loop has nothing to do.
                            threading.Timer(
                                0.2,
                                os.kill,
                                (os.getpid(), signal.{name}),
                            ).start()
                            try:
                                await asyncio.sleep(60)
                            finally:
                                await asyncio.sleep(0.1)
                                print("unwound", flush=True)

                    asyncio.run(main())
                    print("not reached", flush=True)
                    ''',
                    stdout="cleanup\nunwound\n",
                    returncode=-signum,
                    # Quietly: no `CancelledError` stack trace.
                    stderr="",
                )

    def test_signal_outside_cancel_on_signal_terminates(self) -> None:
        self._assert_run(
            '''
            signals.initialize()
            signals.install_cleanup(
                [signal.SIGTERM],
                lambda: print("cleanup", flush=True),
            )

            async def main():
                async with signals.cancel_on_signal():
                    pass
                os.kill(os.getpid(), signal.SIGTERM)
                await asyncio.sleep(60)
                print("not reached", flush=True)

            asyncio.run(main())
            ''',
            stdout="cleanup\n",
            returncode=-signal.SIGTERM,
        )

    def test_cancel_on_signal_fails_when_misused(self) -> None:
        self._assert_run(
            '''
            async def main():
                try:
                    async with signals.cancel_on_signal():
                        pass
                except RuntimeError as error:
                    print(f"{type(error).__name__}: {error}")

                signals.initialize()

                try:
                    async with signals.cancel_on_signal():
                        async with signals.cancel_on_signal():
                            pass
                except RuntimeError as error:
                    print(f"{type(error).__name__}: {error}")

            asyncio.run(main())
            ''',
            stdout=(
                "RuntimeError: Signals are not initialized; call "
                "`reboot.aio.signals.initialize()` before "
                "`reboot.aio.signals.cancel_on_signal()`\n"
                "RuntimeError: `reboot.aio.signals.cancel_on_signal()` is "
                "already entered, and can only be entered once at a time\n"
            ),
        )

    def test_cancel_on_signal_exits_but_only_terminates_if_terminating(
        self,
    ) -> None:
        self._assert_run(
            '''
            signals.initialize([signal.SIGTERM, signal.SIGUSR1])

            async def main():
                async with signals.cancel_on_signal():
                    os.kill(os.getpid(), signal.SIGUSR1)
                    await asyncio.sleep(60)

            try:
                asyncio.run(main())
            except SystemExit as exit:
                print(f"SystemExit: {exit.code}", flush=True)
                raise
            ''',
            stdout="SystemExit: 138\n",
            returncode=138,
            stderr="",
        )

    def test_cancellation_without_signal_propagates(self) -> None:
        self._assert_run(
            '''
            signals.initialize()

            async def main():
                async with signals.cancel_on_signal():
                    asyncio.current_task().cancel()
                    await asyncio.sleep(60)

            try:
                asyncio.run(main())
            except asyncio.CancelledError:
                print("CancelledError", flush=True)
            ''',
            stdout="CancelledError\n",
        )


if __name__ == '__main__':
    unittest.main()
