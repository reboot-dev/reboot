from __future__ import annotations

import asyncio
import os
import psutil
import signal
import subprocess
import weakref
from contextlib import asynccontextmanager
from reboot.cli.terminal import fail
from typing import Any, AsyncIterator, Optional

_subprocesses: Optional[weakref.ReferenceType[Subprocesses]] = None


class Subprocesses:
    """Abstracts creating subprocesses and managing their termination due
    to exceptional control flow. If you need a process to stick around
    longer than your current scope, wrap it in an `asyncio.Task` which
    will correctly get cancelled if necessary and that cancellation
    will correctly terminate your subprocesses.
    """

    # Processes that we've created via `exec()` or `shell()`.
    _processes: set[asyncio.subprocess.Process]

    # Process groups of the processes that we've created that we don't
    # want to unintendedly kill.
    _pgids: set[int]

    def __init__(self):
        self._processes = set()
        self._pgids = set()

        # Include our own pgid so that we don't go killing ourselves!
        self._pgids.add(os.getpgid(os.getpid()))

        # Ensure that there is only one `Subprocesses` instance alive.
        global _subprocesses
        if _subprocesses is not None and _subprocesses() is not None:
            raise AssertionError(
                "At most one `Subprocesses` instance may be active in a process."
            )
        _subprocesses = weakref.ref(self)

    @staticmethod
    def install_terminal_app_signal_handlers() -> None:
        # We know that this is the main task/thread, because `add_signal_handler` may only
        # be called from the main task.
        maybe_main_task = asyncio.current_task()
        if maybe_main_task is None:
            raise AssertionError("May only be called from within asyncio.")
        main_task: asyncio.Task[Any] = maybe_main_task

        # When our parent terminal goes away, we receive SIGHUP. It seems that by default,
        # Python will not raise an exception for SIGHUP and will instead immediately exit,
        # possibly because since the terminal will no longer be usable, any attempt to
        # render the error will fail. But we _do_ want an exception, as otherwise our cleanup
        # context managers cannot run.
        def cancel_main_task() -> None:
            main_task.cancel()

        loop = asyncio.get_running_loop()
        # TODO: Consider merging with
        # https://github.com/reboot-dev/mono/blob/f692f60f4c6dc1dd6dca9b9624835d718310a787/resemble/aio/signals.py#L69
        previous = loop.add_signal_handler(signal.SIGHUP, cancel_main_task)
        if previous not in (signal.SIG_IGN, signal.SIG_DFL, None):
            raise RuntimeError(
                f"Only one SIGHUP signal handler may be installed: replaced {previous}"
            )

        # Another way our terminal may go away is if the user uses e.g.
        # `head` to read the output of our command; it may close our
        # output pipe before our command has finished. That raises a
        # SIGPIPE.
        previous = loop.add_signal_handler(signal.SIGPIPE, cancel_main_task)
        if previous not in (signal.SIG_IGN, signal.SIG_DFL, None):
            raise RuntimeError(
                f"Only one SIGPIPE signal handler may be installed: replaced {previous}"
            )

    @asynccontextmanager
    async def shell(
        self,
        command,
        # By default, avoid any unnecessary reads from this (parent)
        # process stdin.
        stdin: int = subprocess.DEVNULL,
        stdout: Optional[int] = None,
        stderr: Optional[int] = None,
        **kwargs,
    ) -> AsyncIterator[asyncio.subprocess.Process]:
        """Asynchronous context manager that runs a subprocess using a shell ensuring that
        the process is terminated no matter the control flow out of
        the `async with`.
        """
        if 'start_new_session' in kwargs:
            raise TypeError("'start_new_session' is an invalid argument")

        process = await asyncio.create_subprocess_shell(
            command,
            stdin=stdin,
            stdout=stdout,
            stderr=stderr,
            # NOTE: we always start a new session so the process gets
            # into its own process group. Ensuring we have a separate
            # process group enables us to call `_terminate()` without
            # killing processes that we don't want to kill.
            #
            # TODO(benh): look into using `process_group=` instead
            # of `start_new_session` once we require Python 3.11
            # if we don't want sessions.
            start_new_session=True,
            **kwargs,
        )

        async with self._terminate_on_with_exit(process):
            yield process

    @asynccontextmanager
    async def exec(
        self,
        executable,
        *args,
        # By default, avoid any unnecessary reads from this (parent)
        # process stdin.
        stdin: int = subprocess.DEVNULL,
        stdout: Optional[int] = None,
        stderr: Optional[int] = None,
        env: Optional[dict[str, str]] = None,
        **kwargs,
    ) -> AsyncIterator[asyncio.subprocess.Process]:
        """Asynchronous context manager that runs a subprocess by calling `exec()` ensuring
        that the process is terminated no matter the control flow out
        of the `async with`.
        """
        if 'start_new_session' in kwargs:
            raise TypeError("'start_new_session' is an invalid argument")

        env = env or dict(os.environ) or {}
        for key, value in env.items():
            if not isinstance(key, str) or not isinstance(value, str):
                raise TypeError(
                    "Environment variables passed to `exec()` must be strings; "
                    f"got key='{key}' value={value} of type '{type(value)}'"
                )

        try:
            process = await asyncio.create_subprocess_exec(
                executable,
                *args,
                stdin=stdin,
                stdout=stdout,
                stderr=stderr,
                # NOTE: we always start a new session so the process gets
                # into its own process group. Ensuring we have a separate
                # process group enables us to call `_terminate()` without
                # killing processes that we don't want to kill.
                #
                # TODO(benh): look into using `process_group=` instead
                # of `start_new_session` once we require Python 3.11
                # if we don't want sessions.
                start_new_session=True,
                # Use the environment passed in if provided.
                env=env or os.environ,
                **kwargs,
            )
        except FileNotFoundError:
            # If the executable is not accessible 'create_subprocess_exec'
            # will raise an error before the process is created.
            fail(
                f"We require '{executable}' and we couldn't find it on your PATH. Is it installed?"
            )
        else:
            async with self._terminate_on_with_exit(process):
                yield process

    @asynccontextmanager
    async def _terminate_on_with_exit(
        self,
        process: asyncio.subprocess.Process,
    ):
        """Helper for updating state to track which processes we expect and
        shouldn't unintendedly terminate."""
        pgid: Optional[int] = None

        try:
            pgid = os.getpgid(process.pid)
            self._pgids.add(pgid)
        except ProcessLookupError:
            # Process has already exited/crashed so there isn't a
            # process to avoid unintendedly terminating, so we
            # don't add anything.
            pass

        self._processes.add(process)

        try:
            yield
        finally:
            if pgid is not None:
                self._pgids.remove(pgid)

            self._processes.remove(process)

            await self._terminate(process, pgid)

    async def _terminate(
        self,
        process: asyncio.subprocess.Process,
        pgid: Optional[int],
    ):
        """Helper for terminating a process and all of its descendants.

        This is non-trivial to do as processes may have double forked and
        are no longer part of the process tree, but there are a handful of
        different mechanisms that we document extensively within the
        implementation for how we try and kill all possible descendants of
        a process.
        """
        assert process not in self._processes
        assert pgid is None or pgid not in self._pgids

        while True:
            # Try and get all the processes descendants first, before we
            # try and terminate it and lose the process tree.
            descendants = set()

            # (1) Add processes with same PGID as 'process'.
            #
            # This gets all processes that 'process' created that did not
            # create a new process group, even if they double forked and
            # are no longer direct descendants of 'process'.
            if pgid is not None:
                for p in psutil.process_iter():
                    try:
                        if os.getpgid(p.pid) == pgid:
                            descendants.add(p)
                    except ProcessLookupError:
                        # Process might have already exited, e.g., because it
                        # crashed, or we already killed it.
                        pass

            # (2) Add descendants of 'process'.
            #
            # This gets processes that might have changed their process
            # group but are still descendants of 'process'.
            try:
                for p in psutil.Process(process.pid).children(recursive=True):
                    descendants.add(p)
            except psutil.NoSuchProcess:
                # Process 'process' might have already exited, e.g.,
                # because it crashed, or we already killed it.
                pass

            # Send SIGTERM to the process _but not_ the descendants to let
            # it try and clean up after itself first.
            #
            # Give it some time, but not too much time, before we try and
            # terminate everything.
            try:
                process.terminate()
                await asyncio.sleep(0.1)
            except ProcessLookupError:
                # Process might have already exited, e.g., because it
                # crashed, or we already killed it.
                pass

            # (3) Add _our_ descendants that are not expected, i.e.,
            # _not_ processes that we've created via `exec()` or
            # `shell()` and still want to be running.
            #
            # On Linux when we enable the subreaper any process that
            # has both changed its process group and tried to double
            # fork (so that they were no longer a descendant of
            # 'process') should now be a descendant of us, however,
            # they will be in a different process group than us which
            # we will now kill (if it is not expected).
            #
            # While we are doing this it's possible that we'll get new
            # children re-parented to us thanks to the Linux subreaper
            # and we need to try this all again if that occurs.
            might_have_new_children = False

            for p in psutil.Process(os.getpid()).children():
                # Skip if it's one of our processes.
                if any(p.pid == process.pid for process in self._processes):
                    continue
                try:
                    # Skip this process if it is in the process group
                    # of one of our processes (it must have
                    # double-forked and got reparented to us thanks to
                    # the Linux subreaper).
                    if os.getpgid(p.pid) in self._pgids:
                        continue
                except ProcessLookupError:
                    # Process 'p' must now have exited, e.g., because
                    # it crashed or we already killed it (but it
                    # actually exited after it was determined one of
                    # our children).
                    #
                    # On Linux with the subreaper this might mean we
                    # get new children re-parented to us.
                    might_have_new_children = True
                else:
                    # Ok, it's not one of our processes nor is it in
                    # the process group of one of our processes, let's
                    # kill this process.
                    descendants.add(p)

                    # And all of it's children!
                    descendants |= set(p.children(recursive=True))

            # We should never accidently try and terminate ourselves.
            assert not any(
                descendant.pid == os.getpid() for descendant in descendants
            )

            if len(descendants) == 0 and not might_have_new_children:
                break

            for descendant in descendants:
                try:
                    descendant.terminate()
                except psutil.NoSuchProcess:
                    # Process might have already exited, e.g., because it
                    # crashed, or we already killed it.
                    pass

            _, alive = psutil.wait_procs(descendants, timeout=1)

            for descendant in alive:
                try:
                    descendant.kill()
                except psutil.NoSuchProcess:
                    # Process might have already exited, e.g., because
                    # it crashed, or we already killed it.
                    pass

            # Can't wait forever here because a process can't ignore kill.
            psutil.wait_procs(alive)
