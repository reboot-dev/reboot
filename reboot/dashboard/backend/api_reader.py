"""Describes one of the developer's API files.

Run as a subprocess:

    python -m reboot.dashboard.backend.api_reader <api-directory> \\
        <file-relative-to-it>

and it writes what the file declares to stdout, as proto JSON of an
`rbt.v1alpha1.api.API`, or `null` for a file declaring no API; or a
message to stderr and a non-zero exit if the file cannot be read.

A subprocess for two reasons. Reading a Pydantic API means importing
it, so doing it in the dashboard would accumulate stale modules across
edits. And it derives a module path from a relative filename, so it
needs a working directory and `sys.path` that the dashboard should not
adopt.

A Pydantic file is read with `reboot.pydantic_api.api_of`, the way
`rbt generate` reads it. A `.proto` is compiled by `protoc`, with the
import paths `rbt generate` gives it, and what it declares is read
off its descriptor with `reboot.proto_api.api_of`.
"""
import asyncio
import importlib
import json
import os
import sys
import tempfile
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from google.protobuf.json_format import MessageToDict, ParseDict
from rbt.v1alpha1.api import api_pb2
from reboot import proto_api
from reboot.api import API
from reboot.cli.common.proto_paths import google_proto_path, reboot_proto_paths
from reboot.pydantic_api import api_of
from typing import Optional

# What tells a protobuf API file from a Pydantic one.
_PROTO_SUFFIX = '.proto'


def _read_pydantic(directory: str, filename: str) -> Optional[api_pb2.API]:
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


def _read_proto(directory: str, filename: str) -> api_pb2.API:
    # Imported here since only a `.proto` needs `protoc`.
    from grpc_tools import protoc

    # The API directory first, so that a file of the developer's is
    # found there whatever else is on the path, then what `rbt
    # generate` adds for the protos developers import without
    # writing.
    proto_paths = [directory] + reboot_proto_paths() + [google_proto_path()]

    with tempfile.TemporaryDirectory() as temporary_directory:
        descriptor_set_filename = os.path.join(
            temporary_directory, 'descriptor_set'
        )
        # Whatever `protoc` has to say about a file it refuses, it
        # says on stderr, which is what the dashboard shows.
        returncode = protoc.main(
            ['grpc_tools.protoc'] +
            [f'--proto_path={proto_path}' for proto_path in proto_paths] + [
                f'--descriptor_set_out={descriptor_set_filename}',
                # The files imported, for the models they declare, and
                # the comments, for what each declaration means.
                '--include_imports',
                '--include_source_info',
                filename,
            ]
        )
        if returncode != 0:
            raise SystemExit(returncode)

        with open(descriptor_set_filename, 'rb') as descriptor_set_file:
            files = FileDescriptorSet.FromString(
                descriptor_set_file.read()
            ).file

    file = next(file for file in files if file.name == filename)
    return proto_api.api_of(file, filename=filename)


def read(api_directory: str, filename: str) -> Optional[api_pb2.API]:
    """Returns what one API file declares, and `None` for a file
    declaring no API."""
    directory = os.path.abspath(api_directory)

    if filename.endswith(_PROTO_SUFFIX):
        return _read_proto(directory, filename)

    return _read_pydantic(directory, filename)


async def read_api_file(
    api_directory: str,
    filename: str,
) -> tuple[Optional[api_pb2.API], Optional[str]]:
    """Describes one API file in a subprocess.

    Returns what reading the file found, or `None` and a message when
    it could not be read. A half-written file is the normal case
    while someone is typing.
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
        # malformed, then raises this, as we do for a `.proto` that
        # `protoc` refused, having printed why. The dashboard shows
        # that message; the subprocess exit is not an error of its
        # own.
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
