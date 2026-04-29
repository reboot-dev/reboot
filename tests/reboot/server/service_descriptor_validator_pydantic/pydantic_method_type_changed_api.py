from reboot.api import API, Field, Methods, Model, Reader, Type


class EchoPydanticState(Model):
    my_field: int = Field(tag=1)


EchoPydanticMethods = Methods(
    do_something=Reader(
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
