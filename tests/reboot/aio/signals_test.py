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
from reboot.aio.signals import cancel_on_signal_and_raise_system_exit
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

    def test_add_signal_handler_fails_for_registered_signals_only(
        self,
    ) -> None:
        self._assert_run(
            '''
            signals.initialize()
            signals.install_cleanup([signal.SIGTERM])

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
                async with cancel_on_signal_and_raise_system_exit(
                    [signal.SIGTERM]
                ):
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
        for signum in signals.TERMINATING_SIGNALS_FOR_CLIS:
            name = signal.Signals(signum).name
            with self.subTest(name):
                self._assert_run(
                    f'''
                    signals.initialize()
                    signals.install_cleanup(
                        signals.TERMINATING_SIGNALS_FOR_CLIS,
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
        for signum in signals.TERMINATING_SIGNALS_FOR_CLIS:
            name = signal.Signals(signum).name
            with self.subTest(name):
                self._assert_run(
                    f'''
                    signals.initialize()
                    signals.install_cleanup(
                        signals.TERMINATING_SIGNALS_FOR_CLIS,
                        lambda: print("cleanup", flush=True),
                    )

                    async def main():
                        async with cancel_on_signal_and_raise_system_exit(
                            signals.TERMINATING_SIGNALS_FOR_CLIS
                        ):
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
                async with cancel_on_signal_and_raise_system_exit(
                    [signal.SIGTERM]
                ):
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
                    async with cancel_on_signal_and_raise_system_exit(
                        [signal.SIGTERM]
                    ):
                        pass
                except RuntimeError as error:
                    print(f"{type(error).__name__}: {error}")

                signals.initialize()

                try:
                    async with cancel_on_signal_and_raise_system_exit(
                        [signal.SIGTERM]
                    ):
                        async with cancel_on_signal_and_raise_system_exit(
                            [signal.SIGTERM]
                        ):
                            pass
                except RuntimeError as error:
                    print(f"{type(error).__name__}: {error}")

            asyncio.run(main())
            ''',
            stdout=(
                "RuntimeError: Signals are not initialized; call "
                "`reboot.aio.signals.initialize()` first\n"
                "RuntimeError: "
                "`reboot.aio.signals.cancel_on_signal_and_raise_system_exit()` "
                "is already entered, and can only be entered once at a time\n"
            ),
        )

    def test_only_first_signal_is_handled(self) -> None:
        self._assert_run(
            '''
            signals.initialize()

            def cleanup():
                print("cleanup", flush=True)
                # A further signal while cleaning up.
                os.kill(os.getpid(), signal.SIGINT)

            signals.install_cleanup([signal.SIGTERM, signal.SIGINT], cleanup)

            async def main():
                async with cancel_on_signal_and_raise_system_exit(
                    [signal.SIGTERM, signal.SIGINT]
                ):
                    os.kill(os.getpid(), signal.SIGTERM)
                    os.kill(os.getpid(), signal.SIGTERM)
                    try:
                        await asyncio.sleep(60)
                    finally:
                        # Further signals while unwinding must not
                        # interrupt this.
                        os.kill(os.getpid(), signal.SIGINT)
                        await asyncio.sleep(0.1)
                        print("unwound", flush=True)

            asyncio.run(main())
            ''',
            stdout="cleanup\nunwound\n",
            returncode=-signal.SIGTERM,
            stderr="",
        )

    def test_cancel_on_signal_exits_if_signal_does_not_terminate(
        self,
    ) -> None:
        # SIGWINCH is ignored by default, so raising it again at exit
        # does nothing, and the process exits with the status a shell
        # gives a process that the signal terminated, with the signal's
        # number, which differs between platforms.
        exit_code = 128 + signal.SIGWINCH
        self._assert_run(
            '''
            signals.initialize()

            async def main():
                async with cancel_on_signal_and_raise_system_exit(
                    [signal.SIGWINCH]
                ):
                    os.kill(os.getpid(), signal.SIGWINCH)
                    await asyncio.sleep(60)

            try:
                asyncio.run(main())
            except SystemExit as exit:
                print(f"SystemExit: {exit.code}", flush=True)
                raise
            ''',
            stdout=f"SystemExit: {exit_code}\n",
            returncode=exit_code,
            stderr="",
        )

    def test_cancellation_without_signal_propagates(self) -> None:
        self._assert_run(
            '''
            signals.initialize()

            async def main():
                async with cancel_on_signal_and_raise_system_exit(
                    [signal.SIGTERM]
                ):
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
