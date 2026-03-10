"""Variant of `pydantic_original_api.py` with the state renamed.

When compared against `pydantic_original_api.py` as the updated version,
the `EchoPydantic` state appears deleted.
"""
from reboot.api import API, Field, Methods, Model, Type, Writer


class EchoPydanticV2State(Model):
    my_field: int = Field(tag=1)


EchoPydanticV2Methods = Methods(
    do_something=Writer(request=None, response=None),
)

api = API(
    EchoPydanticV2=Type(
        state=EchoPydanticV2State,
        methods=EchoPydanticV2Methods,
    ),
)
