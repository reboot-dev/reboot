"""The dashboard's changelog: what differs between the description of
the developer's API files before a save and the description after it.
"""
import json
from rbt.dashboard.v1.dashboard_pb2 import Change, ChangedPart, StateType
from typing import Iterator

# A type's kind: a state type or a data type.
STATE = 'state'
DATA = 'data'

ADDED = 'added'
CHANGED = 'changed'
REMOVED = 'removed'

# Which piece of the type changed: `method sign_up changed`.
METHOD = 'method'
PROPERTY = 'property'
STATE_MODEL = 'state'


def _types_by_id(state_types: list[StateType]) -> dict[str, dict]:
    """Every type a description declares, state and data alike, by id."""
    types: dict[str, dict] = {}

    for state_type in state_types:
        short = state_type.name.rsplit('.', 1)[-1]
        methods = list(state_type.methods)

        # The pieces a change can name: the state, under the state
        # type's own short name, and each method.
        parts: dict = {
            short: state_type.state_schema,
            **{
                method.name: method for method in methods
            },
        }

        types[state_type.name] = {
            'kind': STATE,
            'name': short,
            'file': state_type.file,
            'shape': parts,
            'parts': parts,
            'nouns':
                {
                    short: STATE_MODEL,
                    **{
                        method.name: METHOD for method in methods
                    },
                },
        }

        # A data type's id is qualified the way the page derives it:
        # the state type's package, then the type's name.
        package = state_type.name.rsplit('.', 1)[0]

        for data_type in state_type.data_types:
            properties = json.loads(data_type.schema).get('properties', {})

            types[f'{package}.{data_type.name}'] = {
                'kind': DATA,
                'name': data_type.name,
                'file': state_type.file,
                # The whole schema decides whether the type changed:
                # its description can change with no field changing.
                'shape': data_type.schema,
                # The fields name what changed, and only the fields.
                'parts': properties,
                'nouns': {
                    name: PROPERTY for name in properties
                },
            }

    return types


def _changed_parts(before: dict, after: dict) -> list[ChangedPart]:
    """The parts that differ between `before` and `after`, and how."""
    parts_before = before['parts']
    parts_after = after['parts']

    changed_parts = []
    for part in sorted(set(parts_before) | set(parts_after)):
        if parts_before.get(part) == parts_after.get(part):
            continue
        changed_parts.append(
            ChangedPart(
                name=part,
                change=ADDED if part not in parts_before else
                REMOVED if part not in parts_after else CHANGED,
                # A removed part has no entry in `after`, so its
                # description comes from `before`.
                part=after['nouns'].get(part) or before['nouns'].get(part),
            )
        )

    return changed_parts


def changes_between(
    before: list[StateType],
    after: list[StateType],
) -> Iterator[Change]:
    """Ordered by id so that a retry of the `Update` call the
    watcher makes sends the same list, which is what makes the write
    idempotent.
    """
    types_before = _types_by_id(before)
    types_after = _types_by_id(after)

    for id in sorted(set(types_before) | set(types_after)):
        old = types_before.get(id)
        new = types_after.get(id)

        if old is None:
            assert new is not None
            yield _change_for_type(id, new, ADDED, [])
        elif new is None:
            yield _change_for_type(id, old, REMOVED, [])
        elif old['shape'] != new['shape']:
            yield _change_for_type(id, new, CHANGED, _changed_parts(old, new))


def _change_for_type(
    id: str, type: dict, change: str, changed_parts: list[ChangedPart]
) -> Change:
    return Change(
        id=id,
        kind=type['kind'],
        name=type['name'],
        namespace=id.rsplit('.', 1)[0],
        file=type['file'],
        change=change,
        changed_parts=changed_parts,
    )
