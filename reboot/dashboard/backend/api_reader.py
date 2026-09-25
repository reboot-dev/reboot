"""Describes one of the developer's API files.

Run as a subprocess:

    python -m reboot.dashboard.backend.api_reader <api-directory> \\
        <file-relative-to-it>

and it writes what reading the file found to stdout, as the JSON of
an `rbt.dashboard.v1.Reading`. Or it writes a message to stderr and
exits non-zero if the file cannot be read.

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
import ast
import asyncio
import hashlib
import importlib
import os
import sys
import tempfile
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from google.protobuf.json_format import MessageToJson, Parse, ParseError
from rbt.dashboard.v1.dashboard_pb2 import File, Reading
from rbt.v1alpha1.api import api_pb2
from reboot import proto_api
from reboot.api import API
from reboot.cli.common.proto_paths import google_proto_path, reboot_proto_paths
from reboot.pydantic_api import api_of
from typing import Optional

# What tells a protobuf API file from a Pydantic one.
_PROTO_SUFFIX = '.proto'


def _read_pydantic(directory: str, filename: str) -> Reading:
    os.chdir(directory)
    sys.path.insert(0, directory)

    module = importlib.import_module(
        filename.rsplit('.py', 1)[0].replace(os.sep, '.')
    )

    # The modules the file imports from outside the directory, such
    # as `reboot.api`, a shared package on the `PYTHONPATH` or an
    # installed one, each with the digest of its file: the walk of
    # the directory never finds these, so a change to one, which
    # upgrading Reboot is, reads the file again. What the file names
    # in an `import`, resolved to the module that was loaded, and
    # not what those import in turn. Not the standard library, which
    # changes with Python and not with the application.
    names: set[str] = set()
    with open(filename) as source:
        for node in ast.walk(ast.parse(source.read())):
            if isinstance(node, ast.Import):
                names.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                assert node.module is not None
                names.add(node.module)
                names.update(
                    f'{node.module}.{alias.name}' for alias in node.names
                )
    external: dict[str, File.Dependency] = {}
    for name in sorted(names):
        if name.partition('.')[0] in sys.stdlib_module_names:
            continue
        path = getattr(sys.modules.get(name), '__file__', None)
        if path is None:
            continue
        path = os.path.realpath(path)
        if path.startswith(os.path.realpath(directory) + os.sep):
            continue
        with open(path, 'rb') as external_file:
            external[path] = File.Dependency(
                filename=path,
                digest=hashlib.sha256(external_file.read()).digest(),
            )

    api = getattr(module, 'api', None)
    if not isinstance(api, API):
        # A file containing shared code declares no `api`.
        return Reading(external=list(external.values()))

    return Reading(
        api=api_of(api, filename=filename),
        external=list(external.values()),
    )


def _read_proto(directory: str, filename: str) -> Reading:
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

    # Every file but those of the API directory, which the walk finds
    # itself, found the way `protoc` found it: under the first path
    # that has it.
    external: list[File.Dependency] = []
    for file in files:
        for proto_path in proto_paths:
            path = os.path.join(proto_path, file.name)
            if os.path.isfile(path):
                if proto_path != directory:
                    with open(path, 'rb') as external_file:
                        external.append(
                            File.Dependency(
                                filename=os.path.realpath(path),
                                digest=hashlib.sha256(
                                    external_file.read(),
                                ).digest(),
                            ),
                        )
                break

    file = next(file for file in files if file.name == filename)
    api = proto_api.api_of(file, filename=filename)

    # Of the files outside the directory, those the file refers to,
    # however many references away: each described as an `API` of its
    # own, `external`, so that a reference into it can be followed,
    # and never one nothing refers to, such as `descriptor.proto`,
    # which every option imports and no field names.
    outside = {
        file.name: file
        for file in files
        if not os.path.isfile(os.path.join(directory, file.name))
    }
    imported: dict[str, api_pb2.API] = {}
    unresolved = set(proto_api.referenced_names(api))
    while len(unresolved) > 0:
        name = unresolved.pop()
        declaring = next(
            (
                outside_file for outside_file in outside.values()
                if outside_file.name not in imported and
                name in proto_api.declared_names(outside_file)
            ),
            None,
        )
        if declaring is None:
            continue
        imported[declaring.name] = proto_api.api_of(
            declaring,
            filename=declaring.name,
            external=True,
        )
        unresolved |= set(proto_api.referenced_names(imported[declaring.name]))

    return Reading(api=api, imported=imported, external=external)


def read(api_directory: str, filename: str) -> Reading:
    """Returns what reading one API file found."""
    directory = os.path.abspath(api_directory)

    if filename.endswith(_PROTO_SUFFIX):
        return _read_proto(directory, filename)

    return _read_pydantic(directory, filename)


async def read_api_file(
    api_directory: str,
    filename: str,
) -> tuple[Optional[Reading], Optional[str]]:
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
        return Parse(out, Reading()), None
    except ParseError as e:
        return None, f"'{filename}' failed to load as JSON: {e}"


def main() -> int:
    if len(sys.argv) != 3:
        print(f'usage: {sys.argv[0]} <api-directory> <file>', file=sys.stderr)
        return 2

    try:
        found = read(sys.argv[1], sys.argv[2])
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

    # Empty repeated fields print as `[]`, matching the generated
    # TypeScript types, whose repeated fields are always arrays.
    print(MessageToJson(found, always_print_fields_with_no_presence=True))

    return 0


if __name__ == '__main__':
    sys.exit(main())
