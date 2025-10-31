import pydantic  # type: ignore[import]
import re
import typing
from enum import Enum
from google.protobuf.message import Message
from typing import Any, Dict, List, Optional, Union, get_args, get_origin

PRIMITIVE_TYPE = Union[
    int,
    float,
    str,
    bool,
]

COLLECTION_TYPE = Union[
    List[Any],
    Dict[str, Any],
]


def pydantic_to_proto(
    input: pydantic.BaseModel | PRIMITIVE_TYPE | COLLECTION_TYPE | None,
    input_type: Optional[typing.Type],
    # We always will return lists, dicts and BaseModels as proto messages.
    output_type: typing.Type[Message] | PRIMITIVE_TYPE,
) -> Message | PRIMITIVE_TYPE:
    """Converts a Pydantic 'input' of type 'input_type' to the
    'output_type' Protobuf message or primitive type.

    We use that function to convert user defined Pydantic values to the
    generated Protobuf messages that Reboot uses internally.

    While generating Protobuf code we check that every type has fully
    defined annotations (i.e. 'list[str]' instead of just 'list'), so we
    can use 'get_args' and 'get_origin' to extract the actual types.

    According to the way we generate Protobuf messages, we currently
    do not support nested optional types inside collections, i.e.
    'list[Optional[T]]' or 'dict[str, Optional[T]]'.

    The only place where 'Optional[T]' is supported is for fields
    directly in Pydantic BaseModels.
    """

    input_type_or_origin = get_origin(input_type)
    if input_type_or_origin is None:
        # If the type has no origin, it is either a primitive type
        # or a pydantic BaseModel. Otherwise it will be a collection
        # type like 'list' or 'dict'.
        input_type_or_origin = input_type

    if input_type_or_origin is Union:
        # Currently only supports Optional[T] from the top-level
        # BaseModel. We will get there only if the Optional[T] field has
        # a value and to process it we have to extract the actual type T.
        non_none_args = [
            arg for arg in get_args(input_type) if arg is not type(None)
        ]
        assert len(non_none_args) == 1
        input_type = non_none_args[0]
        return pydantic_to_proto(
            input,
            input_type,
            output_type,
        )

    # Assert that we have a valid type after we check for 'Union',
    # since 'Union' is a special typing construct and not a "real" type.
    assert isinstance(input_type_or_origin, type)

    if input_type_or_origin is list:
        # Ensure 'output_type' is a class (not a Union of primitive
        # types), so we can safely call 'output_type' as a class inside
        # 'issubclass', so mypy can properly check types.
        assert isinstance(output_type, type) and issubclass(
            output_type,
            Message,
        )

        output = output_type()

        assert hasattr(output, 'elements')
        assert isinstance(input, list)
        list_args = get_args(input_type)
        # We should always have exactly one argument for lists.
        assert len(list_args) == 1
        list_element_type = list_args[0]

        for list_element in input:
            # For 'RepeatedScalarContainer' there is not 'add' method,
            # so we need to handle primitive type containers separately.
            if list_element_type not in (int, float, str, bool):
                output_element = output.elements.add()
                nested_output = pydantic_to_proto(
                    list_element,
                    list_element_type,
                    type(output_element),
                )
                assert isinstance(nested_output, Message)
                output_element.CopyFrom(nested_output)
            else:
                # Primitive type, we can append directly.
                output.elements.append(list_element)
        return output
    elif input_type_or_origin is dict:
        # Ensure 'output_type' is a class (not a Union of primitive
        # types), so we can safely call 'output_type' as a class inside
        # 'issubclass', so mypy can properly check types.
        assert isinstance(output_type, type) and issubclass(
            output_type,
            Message,
        )

        output = output_type()

        assert hasattr(output, 'record')
        assert isinstance(input, dict)
        dict_args = get_args(input_type)
        # We should always have exactly two arguments for dicts.
        assert len(dict_args) == 2
        dict_value_type = dict_args[1]

        for key, value in input.items():
            # For map fields, we use dictionary-style assignment instead
            # of 'add()' or 'append()'. Scalar map values use direct
            # assignment while message map values should use 'CopyFrom()'.
            if dict_value_type not in (int, float, str, bool):
                output_value = output.record[key]
                nested_output = pydantic_to_proto(
                    value,
                    dict_value_type,
                    type(output_value),
                )
                assert isinstance(nested_output, Message)
                output_value.CopyFrom(nested_output)
            else:
                # Primitive type, we can assign directly.
                output.record[key] = value
        return output
    elif issubclass(input_type_or_origin, pydantic.BaseModel):
        # Ensure 'output_type' is a class (not a Union of primitive
        # types), so we can safely call 'output_type' as a class inside
        # 'issubclass', so mypy can properly check types.
        assert isinstance(output_type,
                          type) and issubclass(output_type, Message)
        assert isinstance(input, pydantic.BaseModel)

        output = output_type()

        for field_name, field_info in input.model_fields.items():
            input_field = getattr(input, field_name)
            if input_field is None:
                # If the Pydantic field is 'None', we skip setting it
                # in the Protobuf message, so later we can check
                # 'HasField' on the Protobuf side.
                continue

            input_field_type = field_info.annotation

            output_field = getattr(output, field_name)
            nested_output = pydantic_to_proto(
                input_field,
                input_field_type,
                type(output_field),
            )

            # We can't call 'setattr' on the message types in Protobuf.
            if isinstance(nested_output, Message):
                assert output_type.DESCRIPTOR.fields_by_name.get(
                    field_name
                ).message_type is not None

                output_field.CopyFrom(nested_output)
            else:
                assert output_type.DESCRIPTOR.fields_by_name.get(
                    field_name
                ).message_type is None

                setattr(output, field_name, nested_output)

        return output
    elif issubclass(input_type_or_origin, (int, float, str, bool)):
        assert isinstance(input, (int, float, str, bool))
        return input
    else:
        raise ValueError(
            f"Unexpected input type in 'pydantic_to_proto'. "
            f"Expected BaseModel, list, dict or primitive type for output '{output_type}' "
            f"but got '{input}' of type '{input_type}'."
        )


def proto_to_pydantic(
    input: Message | PRIMITIVE_TYPE,
    output_type: typing.Type[pydantic.BaseModel] | PRIMITIVE_TYPE |
    COLLECTION_TYPE | None,
    validate: bool = True,
) -> pydantic.BaseModel | PRIMITIVE_TYPE | COLLECTION_TYPE | None:
    """Converts a Protobuf 'input' message or primitive type to the
    'output_type' Pydantic BaseModel, list, dict or primitive type.

    We use that function to convert Reboot generated Protobuf messages
    to user defined Pydantic values.

    While generating Protobuf code we check that every type has fully
    defined annotations (i.e. 'list[str]' instead of just 'list'), so we
    can use 'get_args' and 'get_origin' to extract the actual types.

    According to the way we generate Protobuf messages, we currently
    do not support nested optional types inside collections, i.e.
    'list[Optional[T]]' or 'dict[str, Optional[T]]'.
    The only place where 'Optional[T]' is supported is for fields
    directly in Pydantic BaseModels.

    When 'validate' is 'True', we use Pydantic's validation
    capabilities when creating BaseModel instances. Otherwise we will
    create default values for missing fields. That is a case when
    we are converting Protobuf state, which is under construction.
    """

    if output_type is None:
        # If a user specifies 'response=None' in the method definition,
        # we don't want to create an arbitrary data structure, but return
        # 'None' directly.
        return None

    output_type_or_origin = get_origin(output_type)

    if output_type_or_origin is None:
        # If the type has no origin, it is either a primitive type
        # or a pydantic BaseModel. Otherwise it will be a collection
        # type like 'list' or 'dict'.
        output_type_or_origin = output_type

    if output_type_or_origin is Union:
        # Currently only supports Optional[T] from the top-level
        # BaseModel. We will get there only if the Optional[T] field has
        # a value and to process it we have to extract the actual type T.
        non_none_args = [
            arg for arg in get_args(output_type) if arg is not type(None)
        ]
        assert len(non_none_args) == 1
        output_type = non_none_args[0]
        return proto_to_pydantic(
            input,
            output_type,
        )

    # Assert that we have a valid type after we check for 'Union',
    # since 'Union' is a special typing construct and not a "real" type.
    assert isinstance(output_type_or_origin, type)

    # Declare a type here to help with mypy type checking.
    output: Union[list[Any], dict[str, Any]]

    if output_type_or_origin is list:
        assert isinstance(input, Message)
        assert hasattr(input, 'elements')
        list_args = get_args(output_type)
        # We should always have exactly one argument for lists.
        assert len(list_args) == 1
        list_element_type = list_args[0]
        output = []
        for list_element in input.elements:
            output.append(proto_to_pydantic(list_element, list_element_type))
        return output
    elif output_type_or_origin is dict:
        assert isinstance(input, Message)
        assert hasattr(input, 'record')
        dict_args = get_args(output_type)
        # We should always have exactly two arguments for dicts.
        assert len(dict_args) == 2
        dict_value_type = dict_args[1]
        output = {}
        for key, value in input.record.items():
            output[key] = proto_to_pydantic(value, dict_value_type)
        return output
    elif issubclass(output_type_or_origin, pydantic.BaseModel):
        # Ensure 'output_type' is a class (not a Union of primitive
        # types), so we can safely call 'output_type' as a class inside
        # 'issubclass', so mypy can properly check types.
        assert isinstance(output_type, type
                         ) and issubclass(output_type, pydantic.BaseModel)
        assert isinstance(input, Message)

        output = {}

        for field_name, field_info in output_type.model_fields.items():
            input_field = getattr(input, field_name)
            output_field_type = field_info.annotation

            # To properly set 'None' for 'Optional[T]' fields in Pydantic
            # we need to check if the field is set in the Protobuf message.
            if input.HasField(field_name):
                output[field_name] = proto_to_pydantic(
                    input_field, output_field_type
                )
            elif not validate:
                # If 'validate' is 'False', we are converting state
                # that is under construction, so we create default
                # values for missing fields.
                output_field_origin = get_origin(output_field_type)
                if output_field_origin is Union:
                    # We can't create a default value for 'Optional[T]'
                    # by 'output_field_type()', since it is not a "real"
                    # type, so just set it to 'None' explicitly.
                    output[field_name] = None
                else:
                    output[field_name] = output_field_type()
            else:
                # We have 'validate' enabled and the field is not set
                # in the Protobuf message, so we set it to 'None' and
                # let Pydantic handle the validation (i.e. raise error
                # for non-optional fields).
                output[field_name] = None

        return output_type(**output)
    elif issubclass(output_type_or_origin, (int, float, str, bool)):
        return input
    else:
        raise ValueError(
            f"Unexpected output type in 'proto_to_pydantic'. "
            f"Expected BaseModel, list, dict or primitive type for input '{input}' "
            f"but got '{output_type}'."
        )


class StateModel(pydantic.BaseModel):
    """
    Base class for state models in Reboot API definitions.
    All state models should inherit from this class.
    """
    pass


def Field(*, tag: int, **kwargs) -> Any:
    """
    Helper function to create a Pydantic Field with protobuf tag number.
    """
    json_schema_extra = kwargs.get('json_schema_extra', {})
    json_schema_extra['tag'] = tag
    kwargs['json_schema_extra'] = json_schema_extra
    return pydantic.Field(**kwargs)


class MethodKind(str, Enum):
    WRITER = "writer"
    READER = "reader"
    TRANSACTION = "transaction"
    WORKFLOW = "workflow"


class MethodModel(pydantic.BaseModel):
    """
    Base class for method type definitions in Reboot API.
    Contains common fields for all method types (Reader, Writer, Transaction, Workflow).
    """
    request: typing.Type[pydantic.BaseModel]
    response: Optional[typing.Type[pydantic.BaseModel]]
    errors: list[typing.Type[pydantic.BaseModel]] = []
    factory: bool = False
    kind: MethodKind


class Writer(MethodModel):
    kind: MethodKind = MethodKind.WRITER


class Reader(MethodModel):
    kind: MethodKind = MethodKind.READER


class Transaction(MethodModel):
    kind: MethodKind = MethodKind.TRANSACTION


class Workflow(MethodModel):
    kind: MethodKind = MethodKind.WORKFLOW


MethodType = Union[Writer, Reader, Transaction, Workflow]


def is_snake_case(s):
    return re.match(r'^[a-z0-9]+(_[a-z0-9]+)*$', s) is not None


Methods = dict[str, MethodType]


class Type(pydantic.BaseModel):
    """Represents a Reboot data type with state and methods."""

    state: typing.Type[pydantic.BaseModel]
    methods: Methods

    def __init__(
        self,
        *,
        state: typing.Type[StateModel],
        methods: Methods,
    ):
        if not issubclass(state, StateModel):
            raise ValueError("'state' must be a subclass of 'StateModel'.")

        super().__init__(
            state=state,
            methods=methods,
        )


class API(pydantic.BaseModel):
    """Main API definition containing multiple Reboot data types.
    We set extra='allow' to permit dynamic data type fields, i.e.
    'api.ServiceName.state' or
    'api.ServiceName.methods['MethodName'].request'."""

    # Allow dynamic data type fields (e.g., API(StateOne=Type(...),
    # StateTwo=Type(...))). Without this, Pydantic would reject unknown
    # fields in '__init__(**types)'.
    model_config = pydantic.ConfigDict(extra='allow')

    def __init__(self, **types: Type):
        for name, data_type in types.items():
            if not isinstance(data_type, Type):
                raise ValueError(
                    f"Data type '{name}' must be a 'Type' instance, "
                    f"got '{__builtins__.type(data_type)}'"
                )

        super().__init__(**types)

    def get_types(self) -> Dict[str, Type]:
        """Get all Reboot data types defined in this API."""
        types = {}
        for field_name in self.model_fields_set:
            field_value = getattr(self, field_name, None)
            if isinstance(field_value, Type):
                types[field_name] = field_value

        return types
