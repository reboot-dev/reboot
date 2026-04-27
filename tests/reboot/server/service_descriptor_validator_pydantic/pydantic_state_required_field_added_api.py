"""Variant of `pydantic_original_api.py` with a new required field added."""
from reboot.api import API, Field, Methods, Model, Type, Writer


class EchoPydanticState(Model):
    my_field: int = Field(tag=1)
    my_new_field: int = Field(tag=2)


EchoPydanticMethods = Methods(
    do_something=Writer(
        request=None,
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
