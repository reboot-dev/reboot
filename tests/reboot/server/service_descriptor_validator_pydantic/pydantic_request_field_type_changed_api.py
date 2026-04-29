"""Variant of `pydantic_request_original_api.py` with `my_request_field` type changed from int to str."""
from reboot.api import API, Field, Methods, Model, Type, Writer


class EchoPydanticState(Model):
    pass


class DoSomethingRequest(Model):
    my_request_field: str = Field(tag=1)


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
