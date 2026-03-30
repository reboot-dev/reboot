"""Variant of `pydantic_state_original_api.py` with `my_field` removed."""
from reboot.api import API, Methods, Model, Type, Writer


class EchoPydanticState(Model):
    pass


EchoPydanticMethods = Methods(
    do_something=Writer(request=None, response=None),
)

api = API(
    EchoPydantic=Type(
        state=EchoPydanticState,
        methods=EchoPydanticMethods,
    ),
)
