from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class CounterState(Model):
    value: int = Field(tag=1)


class ValueResponse(Model):
    value: int = Field(tag=1)


CounterMethods = Methods(
    # Factory method to create a Counter instance.
    create=Writer(
        request=None,
        response=None,
        factory=True,
    ),
    get=Reader(
        request=None,
        response=ValueResponse,
    ),
    increment=Writer(
        request=None,
        response=None,
    ),
    decrement=Writer(
        request=None,
        response=None,
    ),
)

api = API(
    Counter=Type(
        state=CounterState,
        methods=CounterMethods,
    ),
)
