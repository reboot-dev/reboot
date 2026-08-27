"""Describes one of the developer's API files.

Run as a subprocess:

    python -m reboot.dashboard.api_reader <api-directory> \\
        <file-relative-to-it>

and it writes the state types the file declares to stdout, as a JSON
list of `rbt.dashboard.v1.StateType` in proto JSON, or a message to
stderr and a non-zero exit if the file cannot be read.

A subprocess for two reasons. Reading a Pydantic API means importing
it, so doing it in the dashboard would accumulate stale modules across
edits. And it derives a module path from a relative filename, so it
needs a working directory and `sys.path` that the dashboard should not
adopt.

Every model a state type mentions is read into its schema, however
deeply nested, and named the way a `Reference` names it; the state
model's schema is set apart from the rest.
"""
import asyncio
import importlib
import json
import os
import sys
from google.protobuf.json_format import MessageToDict, ParseDict
from rbt.dashboard.v1.dashboard_pb2 import DataType, Method, StateType
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
        errors=[reference_name(error) for error in spec.errors],
    )

    if spec.request is not None:
        method.request = reference_name(spec.request)
    if spec.response is not None:
        method.response = reference_name(spec.response)
    if spec.description is not None:
        method.description = spec.description

    return method


def _state_type_from_type(
    name: str,
    file: str,
    type_name: str,
    type_obj,
) -> StateType:
    schemas = _schemas_of_type(type_name, type_obj)

    state = reference_name(type_obj.state)

    state_type = StateType(
        name=name,
        filename=file,
        schema=schemas[state],
        methods=[
            _method_from_spec(method_name, spec)
            for method_name, spec in type_obj.methods.items()
            if isinstance(spec, MethodModel)
        ],
        data_types=[
            DataType(name=model_name, schema=schema)
            for model_name, schema in schemas.items()
            if model_name != state
        ],
    )

    if type_obj.description is not None:
        state_type.description = type_obj.description

    return state_type


def state_types_in_file(api_directory: str, filename: str) -> list[StateType]:
    """Describes the state types declared in one API file.

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
        return []

    package = os.path.dirname(filename).replace(os.sep, '.')

    return [
        _state_type_from_type(
            f'{package}.{type_name}', file, type_name, type_obj
        ) for type_name, type_obj in api.get_types().items()
    ]


async def read_api_file(
    api_directory: str,
    filename: str,
) -> tuple[list[StateType], Optional[str]]:
    """Describes one API file in a subprocess.

    Returns the state types it declares, and a message when it could
    not be read. A half-written file is the normal case while someone
    is typing.
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
        return [], errors.decode().strip()

    try:
        described = json.loads(out)
    except json.JSONDecodeError as e:
        return [], f'Could not read the description: {e}'

    return [
        ParseDict(state_type, StateType()) for state_type in described
    ], None


def main() -> int:
    if len(sys.argv) != 3:
        print(f'usage: {sys.argv[0]} <api-directory> <file>', file=sys.stderr)
        return 2

    try:
        state_types = state_types_in_file(sys.argv[1], sys.argv[2])
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
            [
                # Empty repeated fields print as `[]`, matching the
                # generated TypeScript types, whose repeated fields
                # are always arrays.
                MessageToDict(
                    state_type,
                    always_print_fields_with_no_presence=True,
                ) for state_type in state_types
            ]
        )
    )

    return 0


if __name__ == '__main__':
    sys.exit(main())
