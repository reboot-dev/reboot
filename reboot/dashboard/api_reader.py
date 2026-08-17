"""Describes one of the developer's API files.

Run as a subprocess:

    python -m reboot.dashboard.api_reader <api-directory> \
        <file-relative-to-it>

and it writes a JSON list of `StateTypeInfo` to stdout, or a message
to stderr and a non-zero exit if the file cannot be read.

A subprocess for two reasons. Reading a Pydantic API means importing
it, so doing it in the dashboard would accumulate stale modules across
edits. And it derives a module path from a relative filename, so it
needs a working directory and `sys.path` that the dashboard should not
adopt.

The description comes from walking the imported `API` object itself,
so everything is spelled the way its author spelled it: method names
as `names_like_this`, field types as `int` or `Optional[str]`, and
errors by the names of the declared models.
"""
import asyncio
import importlib
import json
import os
import sys
import types
from google.protobuf.json_format import MessageToDict
from rbt.dashboard.v1.dashboard_pb2 import FieldInfo, MethodInfo, StateTypeInfo
from reboot.api import API, MethodModel, Model
from typing import Any, Literal, Optional, Union, get_args, get_origin


def _type_string(annotation) -> str:
    """The source spelling of `annotation`, e.g. `Optional[str]`."""
    if annotation is type(None):
        return 'None'
    if annotation is Any:
        return 'Any'

    origin = get_origin(annotation)

    if origin is Union or origin is types.UnionType:
        arguments = get_args(annotation)
        others = [a for a in arguments if a is not type(None)]
        spelled = ', '.join(_type_string(a) for a in others)
        if len(others) == len(arguments):
            return f'Union[{spelled}]'
        if len(others) == 1:
            return f'Optional[{spelled}]'
        return f'Optional[Union[{spelled}]]'
    if origin is Literal:
        return str(annotation).replace('typing.', '')
    if origin is list:
        (item,) = get_args(annotation)
        return f'list[{_type_string(item)}]'
    if origin is dict:
        key, value = get_args(annotation)
        return f'dict[{_type_string(key)}, {_type_string(value)}]'
    if origin is None and isinstance(annotation, type):
        return annotation.__name__
    return str(annotation).replace('typing.', '')


def _fields_of(model: type[Model]) -> list[FieldInfo]:
    return [
        FieldInfo(name=name, type=_type_string(field.annotation))
        for name, field in model.model_fields.items()
    ]


def _describe_method(method_name: str, spec: MethodModel) -> MethodInfo:
    info = MethodInfo(
        name=method_name,
        kind=spec.kind.value,
        factory=spec.factory,
        mcp=spec.mcp is not None,
        errors=[error.__name__ for error in spec.errors],
    )

    if spec.request is not None:
        info.arguments.extend(_fields_of(spec.request))
    if spec.response is not None:
        info.returns.extend(_fields_of(spec.response))
    if spec.description is not None:
        info.description = spec.description

    return info


def describe(api_directory: str, filename: str) -> list[dict]:
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
        # Not every file in the directory declares an API; one
        # holding shared code simply has nothing to describe.
        return []

    package = os.path.dirname(filename).replace(os.sep, '.')

    described = []
    for type_name, type_obj in api.get_types().items():
        info = StateTypeInfo(
            name=f'{package}.{type_name}',
            file=file,
            fields=_fields_of(type_obj.state),
        )
        if type_obj.description is not None:
            info.description = type_obj.description

        for method_name, spec in type_obj.methods.items():
            # A `UI` method has no RPC to call, so there is nothing
            # to put in a method row for it.
            if isinstance(spec, MethodModel):
                info.methods.append(_describe_method(method_name, spec))

        described.append(MessageToDict(info, preserving_proto_field_name=True))

    return described


async def read(
    api_directory: str,
    filename: str,
) -> tuple[list[dict], Optional[str]]:
    """Describes one API file in a subprocess.

    Returns the state types it declares, and a message when it could
    not be read. A half-written file is the normal case while someone
    is typing, and is worth showing rather than hiding.
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
        # Reading an API file imports it, and an import writes
        # `__pycache__` beside the source, inside the directory
        # being watched, so the write is itself a change, and every
        # edit costs a second pass over every file. It also leaves
        # bytecode in the developer's tree that nothing else put
        # there.
        env={
            **os.environ, 'PYTHONDONTWRITEBYTECODE': '1'
        },
    )
    out, errors = await process.communicate()

    if process.returncode != 0:
        return [], errors.decode().strip()

    try:
        return json.loads(out), None
    except json.JSONDecodeError as e:
        return [], f'Could not read the description: {e}'


def main() -> int:
    if len(sys.argv) != 3:
        print(f'usage: {sys.argv[0]} <api-directory> <file>', file=sys.stderr)
        return 2

    try:
        print(json.dumps(describe(sys.argv[1], sys.argv[2])))
    except SystemExit:
        # A malformed API can reach `fail()` inside `reboot.api`,
        # which raises this after printing why. Being a subprocess,
        # that is a message for the dashboard rather than the end of
        # it.
        return 1
    except Exception as e:
        print(f'{type(e).__name__}: {e}', file=sys.stderr)
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
