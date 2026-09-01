"""Describes one of the developer's API files.

Run as a subprocess:

    python -m reboot.dashboard.backend.api_reader <api-directory> \\
        <file-relative-to-it>

and it writes what the file declares to stdout, as proto JSON of an
`rbt.v1alpha1.api.API`, or `null` for a file declaring no `api`;
or a message to stderr and a non-zero exit if the file cannot be
read.

A subprocess for two reasons. Reading a Pydantic API means importing
it, so doing it in the dashboard would accumulate stale modules across
edits. And it derives a module path from a relative filename, so it
needs a working directory and `sys.path` that the dashboard should not
adopt.

The file is read with `api_of`, the way `rbt generate` reads it.
"""
import asyncio
import importlib
import json
import os
import sys
from google.protobuf.json_format import MessageToDict, ParseDict
from rbt.v1alpha1.api import api_pb2
from reboot.api import API
from reboot.pydantic_api import api_of
from typing import Optional


def read(api_directory: str, filename: str) -> Optional[api_pb2.API]:
    """Returns what one API file declares, and `None` for a file
    declaring no `api`."""
    directory = os.path.abspath(api_directory)
    os.chdir(directory)
    sys.path.insert(0, directory)

    module = importlib.import_module(
        filename.rsplit('.py', 1)[0].replace(os.sep, '.')
    )

    api = getattr(module, 'api', None)
    if not isinstance(api, API):
        # A file containing shared code declares no `api`.
        return None

    return api_of(api, filename=filename)


async def read_api_file(
    api_directory: str,
    filename: str,
) -> tuple[Optional[api_pb2.API], Optional[str]]:
    """Describes one API file in a subprocess.

    Returns what the file declares, `None` for a file declaring no
    `api`, and a message when it could not be read. A half-written
    file is the normal case while someone is typing.
    """
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        '-m',
        # Not `__name__`, which is `__main__` when this module is the
        # one being run.
        'reboot.dashboard.backend.api_reader',
        api_directory,
        filename,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        # Importing an API file would write `__pycache__` beside it,
        # inside the watched directory, and the watcher would read
        # every file again for that write.
        env={
            **os.environ, 'PYTHONDONTWRITEBYTECODE': '1'
        },
    )
    out, errors = await process.communicate()

    if process.returncode != 0:
        return None, errors.decode().strip()

    try:
        api_json = json.loads(out)
    except json.JSONDecodeError as e:
        return None, f"'{filename}' failed to load as JSON: {e}"

    if api_json is None:
        return None, None

    return ParseDict(api_json, api_pb2.API()), None


def main() -> int:
    if len(sys.argv) != 3:
        print(f'usage: {sys.argv[0]} <api-directory> <file>', file=sys.stderr)
        return 2

    try:
        api = read(sys.argv[1], sys.argv[2])
    except SystemExit:
        # `fail()` inside `reboot.api` prints why a malformed API is
        # malformed, then raises this. The dashboard shows that
        # message; the subprocess exit is not an error of its own.
        return 1
    except Exception as e:
        print(f'{type(e).__name__}: {e}', file=sys.stderr)
        return 1

    print(
        json.dumps(
            # Empty repeated fields print as `[]`, matching the
            # generated TypeScript types, whose repeated fields are
            # always arrays.
            MessageToDict(
                api,
                always_print_fields_with_no_presence=True,
            ) if api is not None else None
        )
    )

    return 0


if __name__ == '__main__':
    sys.exit(main())
