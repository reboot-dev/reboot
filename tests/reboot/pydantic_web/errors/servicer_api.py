from reboot.api import API, Field, Methods, Model, Type, Writer
from typing import Literal


class State(Model):
    initialized: bool = Field(tag=1, default=False)


class MyError(Model):
    message: str = Field(tag=1)
    code: int = Field(tag=2)


class AnotherError(Model):
    reason: str = Field(tag=1)


class RaiseErrorRequest(Model):
    error_to_trigger: Literal[
        "my_error",
        "another_error",
        "failed_precondition",
        "none",
    ] = Field(tag=1)


TestMethods = Methods(
    initialize=Writer(
        request=None,
        response=None,
        factory=True,
    ),
    raise_error=Writer(
        request=RaiseErrorRequest,
        response=None,
        errors=[MyError, AnotherError],
    ),
)

api = API(
    Test=Type(
        state=State,
        methods=TestMethods,
    ),
)
