from reboot.api import API, Field, Methods, Model, Reader, Type, Writer
from typing import Optional


class State(Model):
    message: Optional[str] = Field(tag=1, default=None)
    counter: Optional[int] = Field(tag=2, default=None)


class SetMessageAndCounterRequest(Model):
    message: Optional[str] = Field(tag=1)
    counter: Optional[int] = Field(tag=2)


class GetStateResponse(Model):
    message: Optional[str] = Field(tag=1)
    counter: Optional[int] = Field(tag=2)


TestMethods = Methods(
    set_message_and_counter=Writer(
        request=SetMessageAndCounterRequest,
        response=None,
        mcp=None,
    ),
    get_state=Reader(
        request=None,
        response=GetStateResponse,
        mcp=None,
    ),
)

api = API(
    Test=Type(
        state=State,
        methods=TestMethods,
    ),
)
