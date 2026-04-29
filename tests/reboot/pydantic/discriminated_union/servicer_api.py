"""API definition with discriminated unions for testing."""
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer
from typing import Literal, Optional, Union


class OptionA(Model):
    """Variant A of the discriminated union."""
    kind: Literal['A'] = Field(tag=1)
    value_a: str = Field(tag=2)


class OptionB(Model):
    """Variant B of the discriminated union."""
    kind: Literal['B'] = Field(tag=1)
    value_b: float = Field(tag=2)


# Inner discriminated union types for nested testing.
class InnerX(Model):
    """Inner variant X."""
    inner_kind: Literal['X'] = Field(tag=1)
    x_value: str = Field(tag=2)


class InnerY(Model):
    """Inner variant Y."""
    inner_kind: Literal['Y'] = Field(tag=1)
    y_value: int = Field(tag=2)


InnerUnion = InnerX | InnerY


class OptionC(Model):
    """Variant C with a nested discriminated union."""
    kind: Literal['C'] = Field(tag=1)
    nested: InnerUnion = Field(
        tag=2,
        discriminator='inner_kind',
    )


DiscriminatedUnion = Union[OptionA, OptionB]

# Extended union that includes nested discriminated union.
NestedDiscriminatedUnion = OptionA | OptionB | OptionC


class TestRequest(Model):
    """Request with a discriminated union field."""
    discriminated_union: Optional[DiscriminatedUnion] = Field(
        tag=1,
        discriminator='kind',
    )


class TestResponse(Model):
    """Response with a discriminated union field."""
    result: DiscriminatedUnion | None = Field(
        tag=1,
        discriminator='kind',
    )


class NestedTestRequest(Model):
    """Request with a nested discriminated union field."""
    discriminated_union: NestedDiscriminatedUnion = Field(
        tag=1,
        discriminator='kind',
    )


class NestedTestResponse(Model):
    """Response with a nested discriminated union field."""
    result: NestedDiscriminatedUnion = Field(
        tag=1,
        discriminator='kind',
    )


class State(Model):
    """State for the discriminated union test."""
    current_variant: Optional[DiscriminatedUnion] = Field(
        tag=1,
        discriminator='kind',
        default=None,
    )


class NestedState(Model):
    """State for the nested discriminated union test."""
    current_variant: Optional[NestedDiscriminatedUnion] = Field(
        tag=1,
        discriminator='kind',
        default=None,
    )


TestMethods = Methods(
    initialize=Writer(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    process_variant=Writer(
        request=TestRequest,
        response=TestResponse,
        description="\"Testing escape quotes during \"rbt generate\"\"",
        mcp=None,
    ),
    get_current_variant=Reader(
        request=None,
        response=TestResponse,
        mcp=None,
    ),
)

NestedTestMethods = Methods(
    initialize=Writer(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    process_nested_variant=Writer(
        request=NestedTestRequest,
        response=NestedTestResponse,
        mcp=None,
    ),
    get_current_nested_variant=Reader(
        request=None,
        response=NestedTestResponse,
        mcp=None,
    ),
)

api = API(
    DiscriminatedUnionTest=Type(
        state=State,
        methods=TestMethods,
    ),
    NestedDiscriminatedUnionTest=Type(
        state=NestedState,
        methods=NestedTestMethods,
    ),
)
