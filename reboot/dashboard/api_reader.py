"""Describes one of the developer's API files.

Run as a subprocess:

    python -m reboot.dashboard.api_reader <api-directory> \
        <file-relative-to-it>

and it writes a JSON list of state types to stdout, or a message to
stderr and a non-zero exit if the file cannot be read.

A subprocess for two reasons. Reading a Pydantic API means importing
it, so doing it in the dashboard would accumulate stale modules across
edits. And it derives a module path from a relative filename, so it
needs a working directory and `sys.path` that the dashboard should not
adopt.

Types are Pydantic's own JSON Schema rather than anything spelled
here, so a nested type is followed rather than named: a state type
carries a `$defs` of everything its methods mention, and its state,
requests, responses and errors are `$ref`s into it. Scoped per state
type, so two files declaring the same name do not collide.
"""
import asyncio
import importlib
import json
import os
import sys
from pydantic.json_schema import models_json_schema
from reboot.api import API, MethodModel, Model
from typing import Optional


def _schemas_of(models: list[type[Model]]) -> tuple[dict, dict]:
    """The `$defs` for `models`, and a `$ref` to each by model.

    One call for the whole state type, so a type two of its methods
    both mention is described once.
    """
    if len(models) == 0:
        return {}, {}

    # `models_json_schema` dedupes for us, but wants each model once.
    unique = list(dict.fromkeys(models))

    refs, schema = models_json_schema(
        [(model, 'validation') for model in unique],
        ref_template='#/$defs/{model}',
    )

    return schema.get('$defs', {}), {
        model: refs[(model, 'validation')] for model in unique
    }


def _models_of(type_obj) -> list[type[Model]]:
    """Every model one state type mentions, state first.

    A `UI` method draws no method row, but the model it takes is one
    the developer wrote and is described like any other.
    """
    models: list[type[Model]] = [type_obj.state]

    for spec in type_obj.methods.values():
        if spec.request is not None:
            models.append(spec.request)
        if not isinstance(spec, MethodModel):
            continue
        if spec.response is not None:
            models.append(spec.response)
        models.extend(spec.errors)

    return models


def _describe_method(method_name: str, spec: MethodModel, refs: dict) -> dict:
    method: dict = {
        'name': method_name,
        'kind': spec.kind.value,
        'factory': spec.factory,
        'mcp': spec.mcp is not None,
        'errors': [refs[error] for error in spec.errors],
    }

    if spec.request is not None:
        method['request'] = refs[spec.request]
    if spec.response is not None:
        method['response'] = refs[spec.response]
    if spec.description is not None:
        method['description'] = spec.description

    return method


def describe(api_directory: str, filename: str) -> list[dict]:
    """Describes the state types declared in one API file.

    State type names are qualified by the file's directory, the way
    the generated code qualifies them: `shop/v1/shop.py` declaring
    `Shop` yields `shop.v1.Shop`.
    """
    # The path as the developer spelled it, joined before anything
    # resolves it away: with `--api-directory=api` the file shows as
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
        definitions, refs = _schemas_of(_models_of(type_obj))

        state_type: dict = {
            'name': f'{package}.{type_name}',
            'file': file,
            'state': refs[type_obj.state],
            'methods':
                [
                    _describe_method(method_name, spec, refs)
                    for method_name, spec in type_obj.methods.items()
                    if isinstance(spec, MethodModel)
                ],
            '$defs': definitions,
        }

        if type_obj.description is not None:
            state_type['description'] = type_obj.description

        described.append(state_type)

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
