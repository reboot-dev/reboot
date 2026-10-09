# This is a separate function (rather than just being in `__main__`) so that we
# can refer to it as a `script` in our `pyproject.rbt.toml` file.
def main():
    try:
        # We are doing lazy imports because we want to quit
        # quietly in case of `KeyboardInterrupt` and not print the stack trace,
        # otherwise users can bump into the stack trace when they do `Ctrl+C`
        # during the import of the `reboot` packages.
        # If it becomes a problem later, we could tweak the `SCRIPT_TEMPLATE` at
        # https://github.com/pypa/pip/blob/762faa776d47ed0415424623bc63aade57facd9b/src/pip/_vendor/distlib/scripts.py#L43
        import asyncio
        import os
        import platform
        import reboot.aio.tracing
        import sys
        from reboot.aio import signals
        from reboot.cli.common.cli import cli

        # Every signal that would terminate us instead cancels `cli()`
        # (see below), so that its cleanup context managers terminate
        # the subprocesses that it started, and only once it has
        # finished do we let the signal terminate us.
        #
        # NOTE: we initialize before anything installs a cleanup
        # handler, tracing included.
        signals.initialize()

        reboot.aio.tracing.start("reboot cli")

        # We ignore _known_ warnings from
        # `multiprocessing.resource_tracker` that we know are harmless so
        # that we don't spam stdout. See #2793.
        #
        # We do this via an environment variable instead of using
        # `warnings.filterwarnings()` because we fork/exec multiple
        # processes and need to make sure all of those processes ignore
        # these warnings.
        warnings = os.environ.get('PYTHONWARNINGS')
        if warnings is not None:
            warnings += ','
        else:
            warnings = ''

        warnings += (
            'ignore:resource_tracker:UserWarning:multiprocessing.resource_tracker'
        )

        os.environ['PYTHONWARNINGS'] = warnings

        if sys.platform == "darwin" and platform.machine() == "x86_64":
            print(
                "Reboot no longer supports MacOS x86_64. "
                "Please reach out and let us know your use case if this "
                "is important for you!"
            )
            sys.exit(1)

        async def cancellable_cli() -> int:
            # A signal cancels `cli()`, and once it has finished, and
            # we have exited, terminates us.
            async with signals.cancel_on_signal_and_raise_system_exit(
                signals.TERMINATING_SIGNALS_FOR_CLIS
            ):
                return await cli()

        sys.exit(asyncio.run(cancellable_cli()))
    except KeyboardInterrupt:
        # Don't print an exception and stack trace if the user does a
        # Ctrl-C before we have initialized signals, i.e., during the
        # imports above.
        import sys
        sys.exit(2)


if __name__ == '__main__':
    main()
