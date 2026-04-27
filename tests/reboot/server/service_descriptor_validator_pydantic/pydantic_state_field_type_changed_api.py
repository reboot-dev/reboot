from reboot.api import API, Field, Methods, Model, Type, Writer


class EchoPydanticState(Model):
    my_field: str = Field(tag=1)


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
