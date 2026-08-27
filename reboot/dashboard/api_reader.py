"""Describes one of the developer's API files.

Run as a subprocess:

    python -m reboot.dashboard.api_reader <api-directory> \\
        <file-relative-to-it>

and it writes what the file declares to stdout, as proto JSON of an
`rbt.dashboard.v1.Declarations`: the state types, the data types and
every model's schema, or a message to stderr and a non-zero exit if
the file cannot be read.

A subprocess for two reasons. Reading a Pydantic API means importing
it, so doing it in the dashboard would accumulate stale modules across
edits. And it derives a module path from a relative filename, so it
needs a working directory and `sys.path` that the dashboard should not
adopt.

Every model a state type mentions is read into its schema, however
deeply nested, and filed by the name a `Reference` carries; a state
type refers to its state model that way, and every other model is
listed as a data type.
"""
import asyncio
import importlib
import json
import os
import sys
from google.protobuf.json_format import MessageToDict, ParseDict
from rbt.dashboard.v1.dashboard_pb2 import (
    DataType,
    Declarations,
    Method,
    StateType,
)
from rbt.v1alpha1.schema_pb2 import Reference
from reboot.api import API, MethodModel
from reboot.schema import Schemas, reference_name, schema_of
from typing import Optional


def _schemas_of_type(type_name: str, type_obj) -> Schemas:
    """The schema of every model the state type or its methods name,
    and of every model those contain, by reference name.

    A `UI` method draws no method row, but the model it takes is one
    the developer wrote and is described like any other.
    """
    path = f'api.{type_name}'
    _, schemas = schema_of(type_obj.state, path=f'{path}.state')

    for method_name, spec in type_obj.methods.items():
        if spec.request is not None:
            _, schemas = schema_of(
                spec.request,
                path=f'{path}.methods.{method_name}.request',
                schemas=schemas,
            )
        if not isinstance(spec, MethodModel):
            continue
        if spec.response is not None:
            _, schemas = schema_of(
                spec.response,
                path=f'{path}.methods.{method_name}.response',
                schemas=schemas,
            )
        for error in spec.errors:
            _, schemas = schema_of(
                error,
                path=f'{path}.methods.{method_name}.errors.{error.__name__}',
                schemas=schemas,
            )

    return schemas


def _method_from_spec(method_name: str, spec: MethodModel) -> Method:
    method = Method(
        name=method_name,
        kind=Method.Kind.Value(spec.kind.value.upper()),
        factory=spec.factory,
        mcp=spec.mcp is not None,
        errors=[
            Reference(name=reference_name(error)) for error in spec.errors
        ],
    )

    if spec.request is not None:
        method.request.name = reference_name(spec.request)
    if spec.response is not None:
        method.response.name = reference_name(spec.response)
    if spec.description is not None:
        method.description = spec.description

    return method


def _state_type_from_type(
    name: str,
    file: str,
    type_name: str,
    type_obj,
) -> tuple[StateType, Schemas]:
    """The state type as described, and the schema of every model it
    mentions, by reference name."""
    schemas = _schemas_of_type(type_name, type_obj)

    state_type = StateType(
        name=name,
        filename=file,
        reference=Reference(name=reference_name(type_obj.state)),
        methods=[
            _method_from_spec(method_name, spec)
            for method_name, spec in type_obj.methods.items()
            if isinstance(spec, MethodModel)
        ],
    )

    if type_obj.description is not None:
        state_type.description = type_obj.description

    return state_type, schemas


def read(api_directory: str, filename: str) -> Declarations:
    """Describes one API file: the state types it declares, and every
    model those mention, by reference name.

    State type names are qualified by the file's directory, the way
    the generated code qualifies them: `shop/v1/shop.py` declaring
    `Shop` yields `shop.v1.Shop`.
    """
    # The path as the developer spelled it, joined before anything
    # resolves it away: with `generate api/` the file shows as
    # `api/bank/v1/account.py`, the path they would open.
    file = os.path.join(api_directory, filename)

    directory = os.path.abspath(api_directory)
    os.chdir(directory)
    sys.path.insert(0, directory)

    module = importlib.import_module(
        filename.rsplit('.py', 1)[0].replace(os.sep, '.')
    )

    api = getattr(module, 'api', None)
    if not isinstance(api, API):
        # A file containing shared code declares no `api`.
        return Declarations()

    package = os.path.dirname(filename).replace(os.sep, '.')

    declarations = Declarations()
    for type_name, type_obj in api.get_types().items():
        state_type, schemas = _state_type_from_type(
            f'{package}.{type_name}', file, type_name, type_obj
        )
        declarations.state_types.append(state_type)
        for name, schema in schemas.items():
            declarations.schemas[name].CopyFrom(schema)

    # Every model that is not a state model is a data type.
    state_models = {
        state_type.reference.name for state_type in declarations.state_types
    }
    declarations.data_types.extend(
        DataType(filename=file, reference=Reference(name=name))
        for name in declarations.schemas
        if name not in state_models
    )

    return declarations


async def read_api_file(
    api_directory: str,
    filename: str,
) -> tuple[Declarations, Optional[str]]:
    """Describes one API file in a subprocess.

    Returns the state types it declares and the models those mention,
    and a message when it could not be read. A half-written file is
    the normal case while someone is typing.
    """
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        '-m',
        # Not `__name__`, which is `__main__` when this module is the
        # one being run.
        'reboot.dashboard.api_reader',
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
        return Declarations(), errors.decode().strip()

    try:
        declarations = json.loads(out)
    except json.JSONDecodeError as e:
        return Declarations(), f"'{filename}' failed to load as JSON: {e}"

    return ParseDict(declarations, Declarations()), None


def main() -> int:
    if len(sys.argv) != 3:
        print(f'usage: {sys.argv[0]} <api-directory> <file>', file=sys.stderr)
        return 2

    try:
        declarations = read(sys.argv[1], sys.argv[2])
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
                declarations,
                always_print_fields_with_no_presence=True,
            )
        )
    )

    return 0


if __name__ == '__main__':
    sys.exit(main())
