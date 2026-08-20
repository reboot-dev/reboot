"""What the dashboard noticed changing in the developer's API files.

One change per type that was added, changed or removed, and for a
type that changed, which of its parts changed and how.
"""
from reboot.dashboard.api_reader import DEFS
from typing import Iterator

# Are we referring to a state type or a data type?
STATE = 'state'
DATA = 'data'

ADDED = 'added'
CHANGED = 'changed'
REMOVED = 'removed'

# Which piece of the type changed: `method sign_up changed`.
METHOD = 'method'
PROPERTY = 'property'
STATE_MODEL = 'state'


def _typed(state_types: list[dict]) -> dict[str, dict]:
    """Every type a description declares, state and data alike, by id."""
    types: dict[str, dict] = {}

    for state_type in state_types:
        defs = state_type.get('$defs', {})

        state = state_type['state']['$ref'].replace(DEFS, '')

        # The pieces a change can name: the state model and each
        # method.
        parts: dict = {
            state: defs.get(state),
            **{
                method['name']: method for method in state_type['methods']
            },
        }

        types[state_type['name']] = {
            'kind': STATE,
            'name': state_type['name'].rsplit('.', 1)[-1],
            'file': state_type['file'],
            'shape': parts,
            'parts': parts,
            'nouns':
                {
                    state: STATE_MODEL,
                    **{
                        method['name']: METHOD for method in state_type['methods']
                    },
                },
        }

        for data_type in state_type['data_types']:
            schema = defs.get(data_type['name']) or {}

            types[data_type['id']] = {
                'kind': DATA,
                'name': data_type['name'],
                'file': state_type['file'],
                # The whole schema decides whether it changed: a
                # type's description can change with no field changing.
                'shape': schema,
                # The fields name what changed, and only the fields:
                # a field called `description` is a field, not the
                # type's description.
                'parts': schema.get('properties', {}),
                'nouns':
                    {
                        name: PROPERTY
                        for name in schema.get('properties', {})
                    },
            }

    return types


def _moved(before: dict, after: dict) -> list[dict]:
    """The parts that differ between `before` and `after`, and how."""
    parts_before = before['parts']
    parts_after = after['parts']

    moved = []
    for part in sorted(set(parts_before) | set(parts_after)):
        if parts_before.get(part) == parts_after.get(part):
            continue
        moved.append(
            {
                'name':
                    part,
                'change':
                    ADDED if part not in parts_before else
                    REMOVED if part not in parts_after else CHANGED,
                # From whichever side still has it: a part that went
                # away is only described by what it was.
                'part':
                    after['nouns'].get(part) or before['nouns'].get(part),
            }
        )

    return moved


def changes(before: list[dict], after: list[dict]) -> Iterator[dict]:
    """One change per type that is not as it was.

    Ordered by id so that a save touching several types records them
    the same way twice, which is what makes the write idempotent.
    """
    types_before = _typed(before)
    types_after = _typed(after)

    for id in sorted(set(types_before) | set(types_after)):
        old = types_before.get(id)
        new = types_after.get(id)

        if old is None:
            assert new is not None
            yield _change(id, new, ADDED, [])
        elif new is None:
            yield _change(id, old, REMOVED, [])
        elif old['shape'] != new['shape']:
            yield _change(id, new, CHANGED, _moved(old, new))


def _change(id: str, type: dict, change: str, moved: list[dict]) -> dict:
    recorded: dict = {
        'id': id,
        'kind': type['kind'],
        'name': type['name'],
        'namespace': id.rsplit('.', 1)[0],
        'file': type['file'],
        'change': change,
    }

    if moved:
        recorded['moved'] = moved

    return recorded
