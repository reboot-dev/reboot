"""The dashboard's changelog: what differs between the description of
the developer's API files before a save and the description after it.

Every change names what changed: a type added or removed whole, or,
for one that is still there, each of its methods, properties and
other parts that is not as it was, and how. A change with nothing
named is never made.
"""
import json
from dataclasses import dataclass
from rbt.dashboard.v1.dashboard_pb2 import (
    Change,
    DataTypeAdded,
    DataTypeChanged,
    DataTypeRemoved,
    DefaultChanged,
    DescriptionChanged,
    ErrorsChanged,
    FactoryChanged,
    KindChanged,
    McpChanged,
    Method,
    MethodAdded,
    MethodChange,
    MethodRemoved,
    PropertyAdded,
    PropertyChange,
    PropertyRemoved,
    Renamed,
    RequestChanged,
    RequiredChanged,
    ResponseChanged,
    StateModelRenamed,
    StateType,
    StateTypeAdded,
    StateTypeChanged,
    StateTypeRemoved,
    TypeChanged,
)
from typing import Iterator, Mapping, Optional

# The keys of a property's JSON Schema that mean something of their
# own to a person, each compared as itself. Everything else the
# schema says is about the values the property takes, which is its
# type.
_PROPERTY_KEYS = ('description', 'title', 'default', 'tag')


@dataclass(frozen=True, kw_only=True)
class _Property:
    """One property of a model, in the pieces a change can name."""

    # What identifies it: the tag it is shipped under.
    tag: int

    name: str

    # Its JSON Schema apart from `_PROPERTY_KEYS`, as JSON text with
    # sorted keys, so that two descriptions compare by content.
    type: str

    # Whether the enclosing model requires it.
    required: bool

    # Its default as JSON text, and `None` for none.
    default: Optional[str]

    description: Optional[str]


@dataclass(frozen=True, kw_only=True)
class _StateTypeDescription:
    """One state type as a description declares it, in the pieces a
    change can name."""

    filename: str

    # The state model's class name, which its schema records as its
    # title.
    model: str

    description: Optional[str]

    # Each property of the state model by tag.
    properties: Mapping[int, _Property]

    # Each method by name.
    methods: Mapping[str, Method]


@dataclass(frozen=True, kw_only=True)
class _DataTypeDescription:
    """One data type as a description declares it, in the pieces a
    change can name."""

    filename: str

    description: Optional[str]

    # Each property by tag.
    properties: Mapping[int, _Property]


def _properties_of(schema: dict) -> dict[int, _Property]:
    """Every property a model's JSON Schema declares, by tag."""
    required = set(schema.get('required', []))
    properties: dict[int, _Property] = {}
    for name, entry in schema.get('properties', {}).items():
        # Every field of a model is declared with `Field(tag=...)`,
        # which is what makes the tag its identity.
        tag = entry['tag']
        properties[tag] = _Property(
            tag=tag,
            name=name,
            type=json.dumps(
                {
                    key: value
                    for key, value in entry.items()
                    if key not in _PROPERTY_KEYS
                },
                sort_keys=True,
            ),
            required=name in required,
            default=(
                json.dumps(entry['default'], sort_keys=True)
                if 'default' in entry else None
            ),
            description=entry.get('description'),
        )
    return properties


def _described(
    state_types: list[StateType],
) -> tuple[dict[str, _StateTypeDescription], dict[str, _DataTypeDescription]]:
    """Returns every type a description declares, state types and
    data types apart, each by its fully qualified name."""
    described_state_types: dict[str, _StateTypeDescription] = {}
    described_data_types: dict[str, _DataTypeDescription] = {}

    for state_type in state_types:
        schema = json.loads(state_type.schema)
        described_state_types[state_type.name] = _StateTypeDescription(
            filename=state_type.filename,
            model=schema.get('title', ''),
            description=schema.get('description'),
            properties=_properties_of(schema),
            methods={method.name: method for method in state_type.methods},
        )

        # A data type's name is qualified the way the page derives
        # it: the state type's package, then the type's name.
        package = state_type.name.rsplit('.', 1)[0]

        for data_type in state_type.data_types:
            schema = json.loads(data_type.schema)
            described_data_types[f'{package}.{data_type.name}'] = (
                _DataTypeDescription(
                    filename=state_type.filename,
                    description=schema.get('description'),
                    properties=_properties_of(schema),
                )
            )

    return described_state_types, described_data_types


def _optional_string(message, field: str) -> Optional[str]:
    return getattr(message, field) if message.HasField(field) else None


def _property_changes(
    before: Mapping[int, _Property],
    after: Mapping[int, _Property],
) -> list[PropertyChange]:
    """Everything that happened to the properties, by tag, one entry
    per thing, in tag order."""
    changes: list[PropertyChange] = []
    for tag in sorted(set(before) | set(after)):
        old = before.get(tag)
        new = after.get(tag)
        if old is None:
            assert new is not None
            changes.append(
                PropertyChange(tag=tag, name=new.name, added=PropertyAdded())
            )
            continue
        if new is None:
            changes.append(
                PropertyChange(
                    tag=tag, name=old.name, removed=PropertyRemoved()
                )
            )
            continue
        if old.name != new.name:
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    renamed=Renamed(**{
                        'from': old.name,
                        'to': new.name,
                    }),
                )
            )
        if old.type != new.type:
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    type=TypeChanged(**{
                        'from': old.type,
                        'to': new.type,
                    }),
                )
            )
        if old.required != new.required:
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    required=RequiredChanged(required=new.required),
                )
            )
        if old.default != new.default:
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    default=DefaultChanged(
                        **{
                            'from': old.default,
                            'to': new.default,
                        }
                    ),
                )
            )
        if old.description != new.description:
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    description=DescriptionChanged(
                        **{
                            'from': old.description,
                            'to': new.description,
                        }
                    ),
                )
            )
    return changes


def _method_changes(
    before: Mapping[str, Method],
    after: Mapping[str, Method],
) -> list[MethodChange]:
    """Everything that happened to the methods, by name, one entry
    per thing, in name order."""
    changes: list[MethodChange] = []
    for name in sorted(set(before) | set(after)):
        old = before.get(name)
        new = after.get(name)
        if old is None:
            changes.append(MethodChange(name=name, added=MethodAdded()))
            continue
        if new is None:
            changes.append(MethodChange(name=name, removed=MethodRemoved()))
            continue
        if old.kind != new.kind:
            changes.append(
                MethodChange(
                    name=name,
                    kind=KindChanged(**{
                        'from': old.kind,
                        'to': new.kind,
                    }),
                )
            )
        if old.factory != new.factory:
            changes.append(
                MethodChange(
                    name=name, factory=FactoryChanged(factory=new.factory)
                )
            )
        if old.mcp != new.mcp:
            changes.append(
                MethodChange(name=name, mcp=McpChanged(mcp=new.mcp))
            )
        for field, changed in (
            ('request', RequestChanged),
            ('response', ResponseChanged),
        ):
            if _optional_string(old, field) != _optional_string(new, field):
                changes.append(
                    MethodChange(
                        name=name,
                        **{
                            field:
                                changed(
                                    **{
                                        'from': _optional_string(old, field),
                                        'to': _optional_string(new, field),
                                    }
                                )
                        },
                    )
                )
        if list(old.errors) != list(new.errors):
            changes.append(
                MethodChange(
                    name=name,
                    errors=ErrorsChanged(
                        **{
                            'from': old.errors,
                            'to': new.errors,
                        }
                    ),
                )
            )
        if (
            _optional_string(old, 'description')
            != _optional_string(new, 'description')
        ):
            changes.append(
                MethodChange(
                    name=name,
                    description=DescriptionChanged(
                        **{
                            'from': _optional_string(old, 'description'),
                            'to': _optional_string(new, 'description'),
                        }
                    ),
                )
            )
    return changes


def _description_changed(
    old: Optional[str],
    new: Optional[str],
) -> Optional[DescriptionChanged]:
    if old == new:
        return None
    return DescriptionChanged(**{'from': old, 'to': new})


def changes_between(
    before: list[StateType],
    after: list[StateType],
) -> Iterator[Change]:
    """Ordered by name, state types before data types, so that a
    retry of the `Update` call the watcher makes sends the same
    list, which is what makes the write idempotent.
    """
    state_types_before, data_types_before = _described(before)
    state_types_after, data_types_after = _described(after)

    for name in sorted(set(state_types_before) | set(state_types_after)):
        old = state_types_before.get(name)
        new = state_types_after.get(name)

        if old is None:
            assert new is not None
            yield Change(
                state_type_added=StateTypeAdded(
                    name=name, filename=new.filename
                )
            )
            continue
        if new is None:
            yield Change(
                state_type_removed=StateTypeRemoved(
                    name=name, filename=old.filename
                )
            )
            continue

        changed = StateTypeChanged(
            name=name,
            filename=new.filename,
            methods=_method_changes(old.methods, new.methods),
            properties=_property_changes(old.properties, new.properties),
            description=_description_changed(old.description, new.description),
            state_model_renamed=(
                StateModelRenamed(**{
                    'from': old.model,
                    'to': new.model,
                }) if old.model != new.model else None
            ),
        )
        if (
            len(changed.methods) > 0 or len(changed.properties) > 0 or
            changed.HasField('description') or
            changed.HasField('state_model_renamed')
        ):
            yield Change(state_type_changed=changed)

    for name in sorted(set(data_types_before) | set(data_types_after)):
        old_data_type = data_types_before.get(name)
        new_data_type = data_types_after.get(name)

        if old_data_type is None:
            assert new_data_type is not None
            yield Change(
                data_type_added=DataTypeAdded(
                    name=name, filename=new_data_type.filename
                )
            )
            continue
        if new_data_type is None:
            yield Change(
                data_type_removed=DataTypeRemoved(
                    name=name, filename=old_data_type.filename
                )
            )
            continue

        changed_data_type = DataTypeChanged(
            name=name,
            filename=new_data_type.filename,
            properties=_property_changes(
                old_data_type.properties,
                new_data_type.properties,
            ),
            description=_description_changed(
                old_data_type.description,
                new_data_type.description,
            ),
        )
        if (
            len(changed_data_type.properties) > 0 or
            changed_data_type.HasField('description')
        ):
            yield Change(data_type_changed=changed_data_type)
