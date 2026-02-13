import asyncio
import json
import os
from pathlib import Path
from reboot.cli import terminal
from reboot.cli.subprocesses import Subprocesses
from rebootdev.settings import ENVVAR_RBT_FROM_NODEJS
from typing import Optional

rbt_from_nodejs = os.environ.get(
    ENVVAR_RBT_FROM_NODEJS,
    "false",
).lower() == "true"


def ensure_can_auto_transpile():
    global rbt_from_nodejs

    if not rbt_from_nodejs:
        terminal.fail(
            "Expecting to be invoked from Node.js in order to do transpilation of your TypeScript code for you."
        )


async def auto_transpile(
    subprocesses: Subprocesses,
    application: str,
    name: str,
    ts_input_paths: list[str],
) -> Optional[Path]:
    # Pre-condition.
    ensure_can_auto_transpile()

    # TODO: ensure `rbt-esbuild` is on PATH (should be because we have
    # validated `ensure_can_auto_transpile()`).
    async with subprocesses.shell(
        f'rbt-esbuild {application} {name}',
        stdout=asyncio.subprocess.PIPE,
    ) as process:
        stdout, _ = await process.communicate()

        if process.returncode != 0:
            return None

        bundle_directory = Path(stdout.decode().strip())

        # Now add all the input files that we need to
        # watch, starting from an empty list.
        ts_input_paths.clear()
        metafile = bundle_directory / 'meta.json'
        with open(str(metafile), 'r') as file:
            meta = json.load(file)
            for input in meta['inputs']:
                ts_input_paths.append(os.path.abspath(input))

        # TODO: if we want to rebuild when external
        # modules change, such as `@reboot-dev/reboot`
        # we'd need to explicitly add them to watch
        # because they will be marked as 'external' when
        # calling `esbuild` and thus it is not in the
        # `metafile`.

        return bundle_directory / 'bundle.js'
