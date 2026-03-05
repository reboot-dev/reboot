from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Transaction,
    Type,
    Workflow,
    Writer,
)
from typing import Literal, Optional

LiteralType = Literal["option1", "option2", "option3"]


class ArbitraryData(Model):
    str_list_value: list[str] = Field(tag=1)
    optional_str_list_value: Optional[list[str]] = Field(tag=2)
    empty_default_str_list_value: list[str] = Field(
        tag=3,
        default_factory=list,
    )
    optional_with_empty_default_str_list_value: Optional[list[str]] = Field(
        tag=4,
        default=None,
    )


class UpdateRequest(Model):
    int_increment: int = Field(tag=1)
    str_append: str = Field(tag=2)
    bool_toggle: bool = Field(tag=3)
    literal_value: Optional[LiteralType] = Field(tag=4, default=None)


class UpdateResponse(Model):
    previous_int: int = Field(tag=1)
    previous_str: str = Field(tag=2)
    new_int: int = Field(tag=3)
    new_str: str = Field(tag=4)
    previous_literal_value: LiteralType = Field(tag=5)
    new_literal_value: LiteralType = Field(tag=6)


class TransactionUpdateRequest(Model):
    update_request: UpdateRequest = Field(tag=1)
    state_id: str = Field(tag=2)
    make_unauthorized_call: bool = Field(tag=3, default=False)


# Since we generate methods on the client which may be invoked with
# the field names of the request model, we need to test the complex
# types of that fields in the method definition.
# We will allow `mypy` to check the types for the generated methods.
class ComplexTypesRequest(Model):
    data_list: list[ArbitraryData] = Field(tag=1)
    optional_data_list: Optional[list[ArbitraryData]] = Field(tag=2)
    data_dict: dict[str, ArbitraryData] = Field(tag=3)
    optional_data_dict: Optional[dict[str, ArbitraryData]] = Field(tag=4)
    data_literal: LiteralType = Field(tag=5)
    optional_data_literal: Optional[LiteralType] = Field(tag=6)
    data_list_primitive: list[int] = Field(tag=7)
    optional_data_list_primitive: Optional[list[int]] = Field(tag=8)
    data_dict_primitive: dict[str, float] = Field(tag=9)
    optional_data_dict_primitive: Optional[dict[str, float]] = Field(tag=10)


class State(Model):

    class StateSnapshot(Model):
        current_int: int = Field(tag=1)
        current_str: str = Field(tag=2)
        current_float: float = Field(tag=3)
        current_bool: bool = Field(tag=4)
        current_data: ArbitraryData = Field(tag=5)

    ### Required fields. ###

    # Python primitive types.
    int_value: int = Field(tag=1)
    str_value: str = Field(tag=2)
    float_value: float = Field(tag=3)
    bool_value: bool = Field(tag=4)
    literal_value: LiteralType = Field(tag=5)

    # Pydantic model type.
    data_value: ArbitraryData = Field(tag=6)

    # Complex collection types.
    data_list_value: list[ArbitraryData] = Field(tag=7)
    optional_data_list_value: Optional[list[ArbitraryData]] = Field(tag=8)
    data_dict_value: dict[str, ArbitraryData] = Field(tag=9)
    optional_data_dict_value: Optional[dict[str,
                                            ArbitraryData]] = Field(tag=10)

    ### Empty default values. ###
    str_default_value: str = Field(
        tag=11,
        default="",
    )
    bool_default_value: bool = Field(
        tag=12,
        default=False,
    )
    int_default_value: int = Field(
        tag=13,
        default=0,
    )
    float_default_value: float = Field(
        tag=14,
        default=0.0,
    )
    list_default_value: list[int] = Field(
        tag=15,
        default_factory=list,
    )
    dict_default_value: dict[str, int] = Field(
        tag=16,
        default_factory=dict,
    )
    # NOTE: We force to use `Optional` for model types with empty default,
    #       because otherwise there is no way to represent "empty" value.
    another_model_default_value: Optional[ArbitraryData] = Field(
        tag=17,
        default=None,
    )

    literal_default_value: LiteralType = Field(
        tag=18,
        default="option1",
    )


# Have a separate class which uses nested model class as a field to test
# nested message generation.
class GetSnapshotResponse(Model):
    snapshot: State.StateSnapshot = Field(tag=1)


class TransactionWriterRequest(Model):
    should_fail: bool = Field(tag=1)


class RaiseDeclaredErrorRequest(Model):
    error_to_trigger: Literal[
        "my_error",
        "another_error",
        "protobuf_error",
    ] = Field(tag=1)


class MyError(Model):
    data: str = Field(tag=1)


class AnotherError(Model):
    data: str = Field(tag=1)


TestMethods = Methods(
    initialize=Writer(
        request=None,
        response=None,
        factory=True,
    ),
    reader_with_nones=Reader(
        request=None,
        response=None,
    ),
    raise_value_error=Writer(
        request=None,
        response=None,
    ),
    raise_declared_error=Writer(
        request=RaiseDeclaredErrorRequest,
        response=None,
        errors=[MyError, AnotherError],
    ),
    get_snapshot=Reader(
        request=None,
        response=GetSnapshotResponse,
    ),
    update_state=Writer(
        request=UpdateRequest,
        response=UpdateResponse,
    ),
    transaction_state_update=Transaction(
        request=TransactionUpdateRequest,
        response=None,
    ),
    workflow=Workflow(
        request=UpdateRequest,
        response=UpdateResponse,
    ),
    transaction=Transaction(
        request=None,
        response=None,
    ),
    transaction_reader=Reader(
        request=None,
        response=None,
    ),
    transaction_writer=Writer(
        request=TransactionWriterRequest,
        response=None,
    ),
    complex_types_method_mypy=Writer(
        request=ComplexTypesRequest,
        response=None,
    ),
)

api = API(
    Test=Type(
        state=State,
        methods=TestMethods,
    ),
)
