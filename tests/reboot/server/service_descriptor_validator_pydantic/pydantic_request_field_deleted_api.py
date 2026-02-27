"""Variant of `pydantic_request_original_api.py` with `my_request_field` removed."""
from reboot.api import API, Methods, Model, Type, Writer


class EchoPydanticState(Model):
    pass


class DoSomethingRequest(Model):
    pass


EchoPydanticMethods = Methods(
    do_something=Writer(request=DoSomethingRequest, response=None),
)

api = API(
    EchoPydantic=Type(
        state=EchoPydanticState,
        methods=EchoPydanticMethods,
    ),
)
