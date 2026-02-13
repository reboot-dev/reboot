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
        import rebootdev.aio.tracing
        import signal
        import sys
        from reboot.cli.cli import cli

        rebootdev.aio.tracing.start("reboot cli")

        handling_keyboard_interrupt = False

        def signal_handler(sig, frame):
            nonlocal handling_keyboard_interrupt
            if handling_keyboard_interrupt:
                try:
                    # Don't print an exception and stack trace if the user does
                    # another Ctrl-C.
                    sys.exit(sig)
                except SystemExit:
                    pass
            else:
                handling_keyboard_interrupt = True
                asyncio.get_event_loop().stop()

                raise KeyboardInterrupt

        signal.signal(signal.SIGINT, signal_handler)
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
        returncode = asyncio.run(cli())
        sys.exit(returncode)
    except KeyboardInterrupt:
        # Don't print an exception and stack trace if the user does a
        # Ctrl-C.
        import sys
        sys.exit(2)


if __name__ == '__main__':
    main()
