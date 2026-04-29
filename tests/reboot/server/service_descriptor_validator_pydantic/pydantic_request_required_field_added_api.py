"""Variant of `pydantic_request_original_api.py` with a new required field."""
from reboot.api import API, Field, Methods, Model, Type, Writer


class EchoPydanticState(Model):
    pass


class DoSomethingRequest(Model):
    my_request_field: int = Field(tag=1)
    my_new_request_field: int = Field(tag=2)


EchoPydanticMethods = Methods(
    do_something=Writer(
        request=DoSomethingRequest,
        response=None,
        mcp=None,
    ),
)

api = API(
    EchoPydantic=Type(
        state=EchoPydanticState,
        methods=EchoPydanticMethods,
    ),
)
