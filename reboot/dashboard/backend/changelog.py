"""The dashboard's changelog: what differs between what the
developer's API files declared before a save and what they declare
after it.

Every change names what changed: a type added or removed whole, or,
for one that is still there, each of its methods, properties and
other parts that is not as it was, and how. A change with nothing
named is never made.
"""
from rbt.dashboard.v1.dashboard_pb2 import (
    BodyChanged,
    CallsChanged,
    Change,
    CodeAdded,
    CodeChanged,
    CodeRemoved,
    ConstraintsChanged,
    DataTypeAdded,
    DataTypeChanged,
    DataTypeRemoved,
    DefaultChanged,
    DeprecatedChanged,
    DescriptionChanged,
    ErrorsChanged,
    FactoryChanged,
    KindChanged,
    MCPChanged,
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
    Servicer,
    StateModelRenamed,
    StateTypeAdded,
    StateTypeChanged,
    StateTypeRemoved,
    TypeChanged,
)
from rbt.v1alpha1.pydantic.api_pb2 import API, MCP, Method, StateType
from rbt.v1alpha1.pydantic.schema_pb2 import (
    Constraints,
    Property,
    Reference,
    Schema,
)
from typing import Iterator, Mapping, Optional, Sequence

# What the API files declare, keyed by file relative to the API
# directory: what `API.apis` records.
APIs = Mapping[str, API]


def state_type_name(api: API, state_type: StateType) -> str:
    """The name the dashboard gives a state type, which is the name
    the runtime gives it: its package, then its name, e.g.
    `shop.v1.Shop`."""
    return f'{api.package}.{state_type.name}'


def _state_types(apis: APIs) -> dict[str, tuple[API, StateType]]:
    """Every state type by the name the dashboard gives it, beside
    the API of the file declaring it."""
    return {
        state_type_name(api, state_type): (api, state_type)
        for api in apis.values() for state_type in api.state_types
    }


def _data_types(apis: APIs) -> dict[str, tuple[API, Schema]]:
    """Every data type by the name the dashboard gives it, which is
    the name a `Reference` carries, beside the API of the file
    declaring it and its schema."""
    return {
        reference.name: (api, api.schemas[reference.name])
        for api in apis.values() for reference in api.data_types
    }


def _properties_of(schema: Schema) -> dict[int, Property]:
    """Every property a model's schema declares, by tag: every field
    of a model is declared with `Field(tag=...)`, which is what makes
    the tag its identity."""
    return {property.tag: property for property in schema.properties}


def _optional_string(message, field: str) -> Optional[str]:
    return getattr(message, field) if message.HasField(field) else None


def _optional_reference(message, field: str) -> Optional[Reference]:
    return getattr(message, field) if message.HasField(field) else None


def _optional_constraints(property: Property) -> Optional[Constraints]:
    return (property.constraints if property.HasField('constraints') else None)


def _optional_mcp(method: Method) -> Optional[MCP]:
    return method.mcp if method.HasField('mcp') else None


def _property_changes(
    before: Mapping[int, Property],
    after: Mapping[int, Property],
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
        if _optional_string(old,
                            'default') != _optional_string(new, 'default'):
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    default=DefaultChanged(
                        **{
                            'from': _optional_string(old, 'default'),
                            'to': _optional_string(new, 'default'),
                        }
                    ),
                )
            )
        if _optional_string(old, 'description'
                           ) != _optional_string(new, 'description'):
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    description=DescriptionChanged(
                        **{
                            'from': _optional_string(old, 'description'),
                            'to': _optional_string(new, 'description'),
                        }
                    ),
                )
            )
        if _optional_constraints(old) != _optional_constraints(new):
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    constraints=ConstraintsChanged(
                        **{
                            'from': _optional_constraints(old),
                            'to': _optional_constraints(new),
                        }
                    ),
                )
            )
        if old.deprecated != new.deprecated:
            changes.append(
                PropertyChange(
                    tag=tag,
                    name=new.name,
                    deprecated=DeprecatedChanged(deprecated=new.deprecated),
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
        old_kind = old.WhichOneof('kind')
        new_kind = new.WhichOneof('kind')
        # `api_of` always sets a kind.
        assert old_kind is not None and new_kind is not None
        if old_kind != new_kind:
            changes.append(
                MethodChange(
                    name=name,
                    kind=KindChanged(
                        **{
                            'from': KindChanged.Kind.Value(old_kind.upper()),
                            'to': KindChanged.Kind.Value(new_kind.upper()),
                        }
                    ),
                )
            )
        if old.factory != new.factory:
            changes.append(
                MethodChange(
                    name=name, factory=FactoryChanged(factory=new.factory)
                )
            )
        if _optional_mcp(old) != _optional_mcp(new):
            changes.append(
                MethodChange(
                    name=name,
                    mcp=MCPChanged(
                        **{
                            'from': _optional_mcp(old),
                            'to': _optional_mcp(new),
                        }
                    ),
                )
            )
        for field, changed in (
            ('request', RequestChanged),
            ('response', ResponseChanged),
        ):
            if _optional_reference(old,
                                   field) != _optional_reference(new, field):
                changes.append(
                    MethodChange(
                        name=name,
                        **{
                            field:
                                changed(
                                    **{
                                        'from':
                                            _optional_reference(old, field),
                                        'to':
                                            _optional_reference(new, field),
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


def changes_between(before: APIs, after: APIs) -> Iterator[Change]:
    """Ordered by name, state types before data types, so that a
    retry of the `Update` call the watcher makes sends the same
    list, which is what makes the write idempotent. A change names
    its file the way `API.apis` is keyed: relative to the API
    directory.
    """
    state_types_before = _state_types(before)
    state_types_after = _state_types(after)

    for name in sorted(set(state_types_before) | set(state_types_after)):
        old = state_types_before.get(name)
        new = state_types_after.get(name)

        if old is None:
            assert new is not None
            added_api, _ = new
            yield Change(
                state_type_added=StateTypeAdded(
                    name=name, filename=added_api.filename
                )
            )
            continue
        if new is None:
            removed_api, _ = old
            yield Change(
                state_type_removed=StateTypeRemoved(
                    name=name, filename=removed_api.filename
                )
            )
            continue

        old_api, old_state_type = old
        new_api, new_state_type = new
        old_schema = old_api.schemas[old_state_type.reference.name]
        new_schema = new_api.schemas[new_state_type.reference.name]

        changed = StateTypeChanged(
            name=name,
            filename=new_api.filename,
            methods=_method_changes(
                {method.name: method for method in old_state_type.methods},
                {method.name: method for method in new_state_type.methods},
            ),
            properties=_property_changes(
                _properties_of(old_schema),
                _properties_of(new_schema),
            ),
            # The state model's docstring, which is what a reader of
            # the state page sees as its description.
            description=_description_changed(
                _optional_string(old_schema, 'description'),
                _optional_string(new_schema, 'description'),
            ),
            state_model_renamed=(
                StateModelRenamed(
                    **{
                        'from': old_schema.name,
                        'to': new_schema.name,
                    }
                ) if old_schema.name != new_schema.name else None
            ),
        )
        if (
            len(changed.methods) > 0 or len(changed.properties) > 0 or
            changed.HasField('description') or
            changed.HasField('state_model_renamed')
        ):
            yield Change(state_type_changed=changed)

    data_types_before = _data_types(before)
    data_types_after = _data_types(after)

    for name in sorted(set(data_types_before) | set(data_types_after)):
        old_data_type = data_types_before.get(name)
        new_data_type = data_types_after.get(name)

        if old_data_type is None:
            assert new_data_type is not None
            added_api, _ = new_data_type
            yield Change(
                data_type_added=DataTypeAdded(
                    name=name, filename=added_api.filename
                )
            )
            continue
        if new_data_type is None:
            removed_api, _ = old_data_type
            yield Change(
                data_type_removed=DataTypeRemoved(
                    name=name, filename=removed_api.filename
                )
            )
            continue

        old_api, old_schema = old_data_type
        new_api, new_schema = new_data_type

        changed_data_type = DataTypeChanged(
            name=name,
            filename=new_api.filename,
            properties=_property_changes(
                _properties_of(old_schema),
                _properties_of(new_schema),
            ),
            description=_description_changed(
                _optional_string(old_schema, 'description'),
                _optional_string(new_schema, 'description'),
            ),
        )
        if (
            len(changed_data_type.properties) > 0 or
            changed_data_type.HasField('description')
        ):
            yield Change(data_type_changed=changed_data_type)


def code_changes_between(
    before: Sequence[Servicer],
    after: Sequence[Servicer],
) -> Iterator[Change]:
    """What differs between two analyses of the developer's
    application: a servicer added or removed whole, and for one that
    is still there, each method whose implementation does something
    different. The API changelog is what records a method appearing
    or disappearing; the code's methods are read off the state.

    Ordered by state type, then filename, then method, so that a
    retry of the `Update` call the watcher makes sends the same
    list, which is what makes the write idempotent.
    """
    servicers_before = {
        (servicer.state_type, servicer.filename): servicer
        for servicer in before
    }
    servicers_after = {
        (servicer.state_type, servicer.filename): servicer
        for servicer in after
    }

    for key in sorted(set(servicers_before) | set(servicers_after)):
        state_type, filename = key
        old = servicers_before.get(key)
        new = servicers_after.get(key)

        if old is None:
            assert new is not None
            yield Change(
                code_added=CodeAdded(state_type=state_type, filename=filename)
            )
            continue
        if new is None:
            yield Change(
                code_removed=CodeRemoved(
                    state_type=state_type, filename=filename
                )
            )
            continue

        methods_before = {method.name: method for method in old.methods}
        methods_after = {method.name: method for method in new.methods}

        for name in sorted(set(methods_before) & set(methods_after)):
            old_method = methods_before[name]
            new_method = methods_after[name]
            if old_method.digest != new_method.digest:
                yield Change(
                    code_changed=CodeChanged(
                        state_type=state_type,
                        filename=filename,
                        method=name,
                        body=BodyChanged(),
                    )
                )
            elif old_method != new_method:
                # The method reads the same; what it reaches does
                # not, e.g. a helper it calls into changed.
                yield Change(
                    code_changed=CodeChanged(
                        state_type=state_type,
                        filename=filename,
                        method=name,
                        calls=CallsChanged(),
                    )
                )
