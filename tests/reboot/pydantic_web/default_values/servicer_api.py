from reboot.api import API, Field, Methods, Model, Reader, Type, Writer
from typing import Dict, List, Literal, Union


class VariantA(Model):
    kind: Literal["A"] = Field(tag=1)
    value_a: str = Field(tag=2)


class VariantB(Model):
    kind: Literal["B"] = Field(tag=1)
    value_b: int = Field(tag=2)


DiscriminatedUnion = Union[VariantA, VariantB]


class State(Model):
    """State with default values for all supported types."""
    text: str = Field(tag=1, default="")
    number: int = Field(tag=2, default=0)
    flag: bool = Field(tag=3, default=False)
    status: Literal["first", "second"] = Field(tag=4, default="first")
    items: List[str] = Field(tag=5, default_factory=list)
    mapping: Dict[str, str] = Field(tag=6, default_factory=dict)
    optional_text: str | None = Field(tag=7, default=None)
    variant: DiscriminatedUnion | None = Field(
        tag=8,
        discriminator="kind",
        default=None,
    )


class UpdateStateRequest(Model):
    """Request to update state with specified values."""
    text: str = Field(tag=1, default="")
    number: int = Field(tag=2, default=0)
    flag: bool = Field(tag=3, default=False)
    status: Literal["first", "second"] = Field(tag=4, default="first")
    items: List[str] = Field(tag=5, default_factory=list)
    mapping: Dict[str, str] = Field(tag=6, default_factory=dict)
    optional_text: str | None = Field(tag=7, default=None)
    variant: DiscriminatedUnion | None = Field(
        tag=8,
        discriminator="kind",
        default=None,
    )


class GetStateResponse(Model):
    """Response containing current state values."""
    text: str = Field(tag=1, default="")
    number: int = Field(tag=2, default=0)
    flag: bool = Field(tag=3, default=False)
    status: Literal["first", "second"] = Field(tag=4, default="first")
    items: List[str] = Field(tag=5, default_factory=list)
    mapping: Dict[str, str] = Field(tag=6, default_factory=dict)
    optional_text: str | None = Field(tag=7, default=None)
    variant: DiscriminatedUnion | None = Field(
        tag=8,
        discriminator="kind",
        default=None,
    )


TestMethods = Methods(
    initialize_with_defaults=Writer(
        request=None,
        response=None,
    ),
    update_state=Writer(
        request=UpdateStateRequest,
        response=None,
    ),
    get_state=Reader(
        request=None,
        response=GetStateResponse,
    ),
)

api = API(
    DefaultValuesTest=Type(
        state=State,
        methods=TestMethods,
    ),
)
