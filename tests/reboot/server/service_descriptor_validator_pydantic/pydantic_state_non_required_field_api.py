"""Variant of `pydantic_state_original_api.py` with `my_field` having a default."""
from reboot.api import API, Field, Methods, Model, Type, Writer


class EchoPydanticState(Model):
    my_field: int = Field(tag=1, default=0)


EchoPydanticMethods = Methods(
    do_something=Writer(request=None, response=None),
)

api = API(
    EchoPydantic=Type(
        state=EchoPydanticState,
        methods=EchoPydanticMethods,
    ),
)
