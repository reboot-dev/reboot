"""Variant of `pydantic_state_original_api.py` with `do_something` removed."""
from reboot.api import API, Field, Methods, Model, Type


class EchoPydanticState(Model):
    my_field: int = Field(tag=1)


api = API(
    EchoPydantic=Type(
        state=EchoPydanticState,
        methods=Methods(),
    ),
)
