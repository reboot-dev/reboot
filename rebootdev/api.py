import pydantic
import pydantic_core
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


class Model(pydantic.BaseModel):
    """
    Base class for Pydantic request/response/error in Reboot API definitions.
    """
    # We want to ensure that 'validate_assignment=True' for all
    # Model subclasses, so that field types are always validated
    # when they are assigned new values, it is important since we use
    # the Pydantic model type annotation to generate Protobuf messages and
    # if the field value is not of the correct type, the conversion
    # will fail.
    model_config = pydantic.ConfigDict(validate_assignment=True)
    pass


def _pydantic_to_proto(
    input: Model | PRIMITIVE_TYPE | COLLECTION_TYPE | None,
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

    # NOTE: Do not call that function directly, use 'pydantic_to_proto'
    # instead. If you have to call it directly, make sure that the 'input'
    # Model has the same structure as expected by the 'output_type' and
    # if 'input' is 'Model' it should be validated.
    """

    input_type_or_origin = get_origin(input_type)
    if input_type_or_origin is None:
        # If the type has no origin, it is either a primitive type
        # or a 'Model'. Otherwise it will be a collection
        # type like 'list' or 'dict'.
        input_type_or_origin = input_type

    if input_type_or_origin is Union:
        # Currently only supports 'Optional[T]' from the top-level
        # 'Model'. We will get there only if the 'Optional[T]' field has
        # a value and to process it we have to extract the actual type 'T'.
        non_none_args = [
            arg for arg in get_args(input_type) if arg is not type(None)
        ]
        assert len(non_none_args) == 1
        input_type = non_none_args[0]
        return _pydantic_to_proto(
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

        assert hasattr(output, 'items')
        assert isinstance(input, list)
        list_args = get_args(input_type)
        # We should always have exactly one argument for lists.
        assert len(list_args) == 1
        list_item_type = list_args[0]

        for list_item in input:
            # For 'RepeatedScalarContainer' there is not 'add' method,
            # so we need to handle primitive type containers separately.
            if list_item_type not in (int, float, str, bool):
                output_item = output.items.add()
                nested_output = _pydantic_to_proto(
                    list_item,
                    list_item_type,
                    type(output_item),
                )
                assert isinstance(nested_output, Message)
                output_item.CopyFrom(nested_output)
            else:
                # Primitive type, we can append directly.
                output.items.append(list_item)
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
                nested_output = _pydantic_to_proto(
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
    elif issubclass(input_type_or_origin, Model):
        # Ensure 'output_type' is a class (not a Union of primitive
        # types), so we can safely call 'output_type' as a class inside
        # 'issubclass', so mypy can properly check types.
        assert isinstance(output_type,
                          type) and issubclass(output_type, Message)
        assert isinstance(input, Model)

        output = output_type()

        for field_name, field_info in type(input).model_fields.items():
            try:
                # If we were constructing the Pydantic model for initial
                # state, that model will not have any fields, since we
                # create it with 'model_construct' and then user should
                # set the required fields manually. If a required field is
                # missing, we will get an AttributeError here and we can
                # raise a proper ValidationError.
                input_field = getattr(input, field_name)
            except AttributeError:
                raise pydantic_core.ValidationError.from_exception_data(
                    title=
                    f"Missing required field {field_name} in {type(input).__name__}",
                    line_errors=[
                        {
                            'type': 'missing',
                            'loc': (field_name,),
                            # The 'input' field is required by the
                            # ValidationError but we don't have
                            # the actual input value here, so we will
                            # show an empty value, e.g.:
                            #
                            # 'field_name'
                            # Field required [type=missing, input_value='input_type()', input_type='input_type']
                            #    For further information visit https://errors.pydantic.dev/2.12/v/missing
                            'input': input,
                        }
                    ]
                )
            if input_field is None:
                # If the Pydantic field is 'None', we skip setting it
                # in the Protobuf message, because Protobuf fields are
                # 'optional' by default.
                continue

            input_field_type = field_info.annotation

            output_field = getattr(output, field_name)
            nested_output = _pydantic_to_proto(
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
            f"Unexpected input type in '_pydantic_to_proto'. "
            f"Expected 'Model', 'list', 'dict' or primitive type for output '{output_type}' "
            f"but got '{input}' of type '{input_type}'."
        )


def pydantic_to_proto(
    input: Model,
    input_type: typing.Type[Model],
    output_type: typing.Type[Message],
):
    """Converts a Pydantic 'input' of type 'input_type' to the
    'output_type' Protobuf message. The function expects 'input' to be
    a value of type 'Model', which ensures 'validate_assignment=True',
    so the input is already validated except the case when the input is created
    using 'model_construct' (e.g. for initial state creation), for that case
    we check that required fields are set and if not we raise a proper
    ValidationError in '_pydantic_to_proto'. The field type will still
    be checked by Pydantic, since we ensure 'validate_assignment=True'.
    """
    return _pydantic_to_proto(
        input,
        input_type,
        output_type,
    )


def _proto_to_pydantic(
    input: Message | PRIMITIVE_TYPE,
    output_type: typing.Type[Model] | PRIMITIVE_TYPE | COLLECTION_TYPE | None,
) -> Model | PRIMITIVE_TYPE | COLLECTION_TYPE | None:
    """Converts a Protobuf 'input' message or primitive type to the
    'output_type' Model, list, dict or primitive type.

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

    NOTE: Do not call that function directly, use 'proto_to_pydantic'
    instead. If you have to call it directly, make sure that the 'input'
    Message has the same structure as expected by the 'output_type' and
    has all required fields set.
    """

    if output_type is None:
        # If a user specifies 'response=None' in the method definition,
        # we don't want to create an arbitrary data structure, but return
        # 'None' directly.
        return None

    output_type_or_origin = get_origin(output_type)

    if output_type_or_origin is None:
        # If the type has no origin, it is either a primitive type
        # or a 'Model'. Otherwise it will be a collection
        # type like 'list' or 'dict'.
        output_type_or_origin = output_type

    if output_type_or_origin is Union:
        # Currently only supports 'Optional[T]' from the top-level
        # 'Model'. We will get there only if the 'Optional[T]' field has
        # a value and to process it we have to extract the actual type 'T'.
        non_none_args = [
            arg for arg in get_args(output_type) if arg is not type(None)
        ]
        assert len(non_none_args) == 1
        output_type = non_none_args[0]
        return _proto_to_pydantic(
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
        assert hasattr(input, 'items')
        list_args = get_args(output_type)
        # We should always have exactly one argument for lists.
        assert len(list_args) == 1
        list_item_type = list_args[0]
        output = []
        for list_item in input.items:
            output.append(_proto_to_pydantic(
                list_item,
                list_item_type,
            ))
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
            output[key] = _proto_to_pydantic(
                value,
                dict_value_type,
            )
        return output
    elif issubclass(output_type_or_origin, Model):
        # Ensure 'output_type' is a class (not a Union of primitive
        # types), so we can safely call 'output_type' as a class inside
        # 'issubclass', so mypy can properly check types.
        assert isinstance(output_type, type) and issubclass(output_type, Model)
        assert isinstance(input, Message)

        output = {}

        for field_name, field_info in output_type.model_fields.items():
            input_field = getattr(input, field_name)
            output_field_type = field_info.annotation

            if input.HasField(field_name):
                # Always set the field if it is present in the
                # Protobuf message.
                output[field_name] = _proto_to_pydantic(
                    input_field,
                    output_field_type,
                )
            else:
                # We should be converting a Protobuf message which was
                # created from a Pydantic model so if a field is not set
                # in the Protobuf message, it means that the field was
                # 'Optional' and set to 'None' in Pydantic.
                output[field_name] = None

        return output_type(**output)

    elif issubclass(output_type_or_origin, (float, str, bool)):
        assert isinstance(input, (float, str, bool))
        return input
    elif issubclass(output_type_or_origin, int):
        # We map Python 'int' to Protobuf 'double', so we need to
        # truncate the float value back to int here.
        assert isinstance(input, (int, float))
        return int(input)
    else:
        raise ValueError(
            f"Unexpected output type in '_proto_to_pydantic'. "
            f"Expected 'Model', 'list', 'dict' or primitive type for input '{input}' "
            f"but got '{output_type}'."
        )


def proto_to_pydantic(
    input: Message,
    output_type: typing.Type[Model],
):
    """Converts a Protobuf 'input' message to the
    'output_type' Model. Since the 'output_type' is a Pydantic
    model, we are sure that Pydantic validation will be done during
    the 'output_type' object creation.
    """

    return _proto_to_pydantic(
        input,
        output_type,
    )


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
    request: Optional[typing.Type[Model]]
    response: Optional[typing.Type[Model]]
    errors: list[typing.Type[Model]] = []
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


def is_snake_case(input: str) -> bool:
    return re.match(r'^[a-z0-9]+(_[a-z0-9]+)*$', input) is not None


def to_snake_case(input: str) -> str:
    snake_case_words = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', input)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', snake_case_words).lower()


def to_pascal_case(input: str) -> str:
    """Convert snake_case to PascalCase."""
    return ''.join(word.capitalize() for word in input.split('_'))


def snake_to_camel(snake_str: str) -> str:
    """Convert snake_case to camelCase."""
    components = snake_str.split('_')
    return components[0] + ''.join(
        word.capitalize() for word in components[1:]
    )


def get_field_tag(field_info) -> Optional[int]:
    """Get the tag from a Pydantic field's json_schema_extra."""
    json_schema_extra = getattr(field_info, 'json_schema_extra', {})
    if isinstance(json_schema_extra, dict) and 'tag' in json_schema_extra:
        return json_schema_extra['tag']
    return None


# We need to define 'Methods' as a class, so Python typing can
# properly identify it as a type for 'Type.methods' field.
# Otherwise we will see error like:
# Argument "methods" to "Type" has incompatible type
# "dict[str, MethodModel]"; expected "dict[str, Writer | Reader
# | Transaction | Workflow]".
class Methods(dict[str, MethodType]):

    def __init__(self, **methods: MethodType):
        super().__init__(**methods)


class Type(pydantic.BaseModel):
    """Represents a Reboot data type with state and methods."""

    # 'Methods' is a dict, so we need to allow arbitrary types
    # to avoid Pydantic validation errors.
    model_config = pydantic.ConfigDict(
        arbitrary_types_allowed=True,
    )

    state: typing.Type[Model]
    methods: Methods

    def __init__(
        self,
        *,
        state: typing.Type[Model],
        methods: Methods,
    ):

        def validate_all_fields_are_reboot_base_classes(
            field_type,
            method_name,
        ):
            field_type_origin = get_origin(field_type)
            if field_type_origin is Union:
                # Get the inner type from 'Optional[T]'.
                non_none_args = [
                    arg for arg in get_args(field_type)
                    if arg is not type(None)
                ]
                assert len(non_none_args) == 1
                return validate_all_fields_are_reboot_base_classes(
                    non_none_args[0],
                    method_name,
                )
            elif field_type_origin is list:
                list_args = get_args(field_type)
                # We should always have exactly one argument for lists.
                assert len(list_args) == 1
                return validate_all_fields_are_reboot_base_classes(
                    list_args[0],
                    method_name,
                )
            elif field_type_origin is dict:
                dict_args = get_args(field_type)
                # We should always have exactly two arguments for dicts.
                assert len(dict_args) == 2
                return validate_all_fields_are_reboot_base_classes(
                    dict_args[1],
                    method_name,
                )
            elif issubclass(field_type, pydantic.BaseModel):
                if not issubclass(field_type, Model):
                    state_or_method = ""
                    if method_name is None:
                        state_or_method = "'state'"
                    else:
                        state_or_method = f"method '{method_name}'"
                    raise ValueError(
                        f"{state_or_method} has field type "
                        f"'{field_type}' which is not a subclass of "
                        "Reboot 'Model'. All 'state', "
                        "'request', 'response', and 'error' "
                        "types must inherit from 'Model'."
                    )
                for field_info in field_type.model_fields.values():
                    validate_all_fields_are_reboot_base_classes(
                        field_info.annotation,
                        method_name,
                    )
            else:
                assert field_type in (int, float, str, bool)

        if not issubclass(state, Model):
            raise ValueError("'state' must be a subclass of 'Model'.")

        # Validate all fields there rather then in the constructor of
        # 'Model', so that we won't have that validation
        # overhead in the runtime on the server, but only during
        # API definition time.
        validate_all_fields_are_reboot_base_classes(
            state,
            None,
        )

        for method_name, method in methods.items():
            if not isinstance(method, MethodModel):
                raise ValueError(
                    f"Method '{method_name}' must be an instance of "
                    f"'Writer', 'Reader', 'Transaction', 'Workflow'."
                )

            if method.request is not None:
                validate_all_fields_are_reboot_base_classes(
                    method.request,
                    method_name,
                )
            if method.response is not None:
                validate_all_fields_are_reboot_base_classes(
                    method.response,
                    method_name,
                )
            for error in method.errors:
                validate_all_fields_are_reboot_base_classes(
                    error,
                    method_name,
                )

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
        for type_name, data_type in types.items():
            if not isinstance(data_type, Type):
                raise ValueError(
                    f"Data type '{type_name}' must be a 'Type' instance, "
                    f"got '{__builtins__.type(data_type)}'"
                )
            for name, method in data_type.methods.items():
                if len(method.errors) != 0:
                    raise ValueError(
                        f"Method '{name}' of data type '{type_name}' "
                        f"cannot define 'errors' yet. "
                        f"The feature is coming soon."
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
