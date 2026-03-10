import pydantic
import pydantic.errors
import unittest
from reboot.api import API, Field, Methods, Model, Type, UserPydanticError
from typing import Dict, List, Literal, Optional, Union


class VariantAMultiLiteral(Model):
    """Variant with multiple literal values - not allowed for discriminator."""

    kind: Literal["A", "A2"] = Field(tag=1)
    value: str = Field(tag=2)


class VariantBSingleLiteral(Model):
    """Variant with single literal value."""

    kind: Literal["B"] = Field(tag=1)
    value: int = Field(tag=2)


class StateWithMultiLiteralDiscriminator(Model):
    """State with discriminated union where one variant has multi-value Literal."""

    variant: Union[
        VariantAMultiLiteral,
        VariantBSingleLiteral,
    ] = Field(tag=1, discriminator="kind")


class PlainPydanticModel(pydantic.BaseModel):
    """Plain Pydantic model, not a Reboot Model."""

    value: str


class StateWithPlainPydanticField(Model):
    """State with a field that's not a Reboot Model."""

    nested: PlainPydanticModel = Field(tag=1)


class ModelValidationErrorsTest(unittest.TestCase):
    """Test UserPydanticError in Model.__pydantic_init_subclass__."""

    def test_unsupported_default_factory_type(self):
        """default_factory is only supported for list and dict."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: set = Field(tag=1, default_factory=set)

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` uses `default_factory` "
            "which is not supported for type `set`. Only `list`, `dict` "
            "types can have a `default_factory` currently.",
        )

    def test_invalid_default_factory_value_for_list(self):
        """default_factory for list must be list, not something else."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: List[str] = Field(tag=1, default_factory=tuple)

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` uses `default_factory` "
            "with an unsupported value. Supported default factory value "
            "for `list` is `list`.",
        )

    def test_invalid_default_factory_value_for_dict(self):
        """default_factory for dict must be dict, not something else."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: Dict[str, str] = Field(tag=1, default_factory=list)

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` uses `default_factory` "
            "with an unsupported value. Supported default factory value "
            "for `dict` is `dict`.",
        )

    def test_discriminated_union_with_default(self):
        """Discriminated unions cannot have default values."""

        class VariantA(Model):
            kind: Literal["A"] = Field(tag=1)

        class VariantB(Model):
            kind: Literal["B"] = Field(tag=1)

        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                # Discriminated union with a `default` is not allowed.
                variant: Union[VariantA, VariantB] = Field(
                    tag=1,
                    discriminator="kind",
                    default=VariantA(kind="A"),
                )

        self.assertEqual(
            str(error.exception),
            "Field `variant` in model `BadModel` is a discriminated union "
            "and cannot have a `default` value.",
        )

    def test_non_optional_model_with_default(self):
        """Non-optional Model fields cannot have default values."""

        class Inner(Model):
            value: str = Field(tag=1)

        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                inner: Inner = Field(tag=1, default=Inner(value="test"))

        self.assertEqual(
            str(error.exception),
            "Field `inner` in model `BadModel` is a non-optional `Model` "
            "type and cannot have a `default` value. Use `Optional` for "
            "`Model` types with empty default.",
        )

    def test_non_optional_field_with_none_default(self):
        """Non-optional fields cannot have default=None."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: str = Field(tag=1, default=None)

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` is a non-optional type and "
            "cannot have `default` set to `None`. Change the `default` or "
            "make the field `Optional`.",
        )

    def test_optional_field_with_non_none_default(self):
        """Optional fields can only have default=None."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: Optional[str] = Field(tag=1, default="not none")

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` is `Optional` and uses "
            "`default` with a non-None value. Reboot supports only "
            "`None` default value for `Optional` fields.",
        )

    def test_literal_with_wrong_default(self):
        """Literal fields must have first literal value as default."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                # Default must be 'first', not 'second'.
                status: Literal["first",
                                "second"] = Field(tag=1, default="second")

        self.assertEqual(
            str(error.exception),
            "Field `status` in model `BadModel` uses `default` with an "
            "unsupported value. Supported default value for `Literal` is "
            "the first literal value `first`.",
        )

    def test_unsupported_default_type(self):
        """Only primitive types, Optional, and Literal support defaults."""

        class Inner(Model):
            value: str = Field(tag=1)

        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                # `List` doesn't support `default`, only `default_factory`.
                items: List[str] = Field(tag=1, default=[])

        self.assertEqual(
            str(error.exception),
            "Field `items` in model `BadModel` is a `list` type and cannot "
            "have a `default` value. Use `default_factory` instead.",
        )

    def test_wrong_default_value_for_str(self):
        """String fields can only have empty string as default."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: str = Field(tag=1, default="non-empty")

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` uses `default` with an "
            "unsupported value. Supported default value for `str` is ``.",
        )

    def test_wrong_default_value_for_int(self):
        """Int fields can only have 0 as default."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: int = Field(tag=1, default=42)

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` uses `default` with an "
            "unsupported value. Supported default value for `int` is `0`.",
        )

    def test_wrong_default_value_for_bool(self):
        """Bool fields can only have False as default."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: bool = Field(tag=1, default=True)

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` uses `default` with an "
            "unsupported value. Supported default value for `bool` is "
            "`False`.",
        )

    def test_wrong_default_value_for_float(self):
        """Float fields can only have 0.0 as default."""
        with self.assertRaises(UserPydanticError) as error:

            class BadModel(Model):
                field: float = Field(tag=1, default=3.14)

        self.assertEqual(
            str(error.exception),
            "Field `field` in model `BadModel` uses `default` with an "
            "unsupported value. Supported default value for `float` is "
            "`0.0`.",
        )


class TypeValidationErrorsTest(unittest.TestCase):
    """Test UserPydanticError in Type.__init__ validation."""

    def test_discriminator_not_single_value_literal(self):
        """Discriminator field must be a Literal with exactly one value."""
        with self.assertRaises(UserPydanticError) as error:
            Type(
                state=StateWithMultiLiteralDiscriminator,
                methods=Methods(),
            )

        self.assertEqual(
            str(error.exception),
            f"Discriminator field `kind` in option type "
            f"`<class '{__name__}.VariantAMultiLiteral'>` "
            f"must be a `Literal` with exactly one value.",
        )

    def test_literal_with_non_string_value(self):
        """Literal fields must have string values only."""

        class State(Model):
            # Integer literals are not supported.
            status: Literal[1, 2, 3] = Field(tag=1)

        with self.assertRaises(UserPydanticError) as error:
            Type(
                state=State,
                methods=Methods(),
            )

        self.assertEqual(
            str(error.exception),
            "'state' has `Literal` field with non-string value `1`. "
            "Only string literals are supported.",
        )

    def test_field_not_subclass_of_model(self):
        """Nested types must be subclasses of Model, not plain BaseModel."""
        with self.assertRaises(UserPydanticError) as error:
            Type(
                state=StateWithPlainPydanticField,
                methods=Methods(),
            )

        self.assertEqual(
            str(error.exception),
            f"'state' has field type "
            f"'<class '{__name__}.PlainPydanticModel'>' "
            f"which is not a subclass of Reboot 'Model'. All 'state', "
            f"'request', 'response', and 'error' types must inherit "
            f"from 'Model'.",
        )

    def test_state_not_subclass_of_model(self):
        """State must be a subclass of Model."""
        with self.assertRaises(UserPydanticError) as error:
            Type(
                state=PlainPydanticModel,
                methods=Methods(),
            )

        self.assertEqual(
            str(error.exception),
            "'state' must be a subclass of 'Model'.",
        )

    def test_invalid_method_type(self):
        """Methods must be Writer, Reader, Transaction, Workflow, or UI."""

        class State(Model):
            value: str = Field(tag=1)

        with self.assertRaises(UserPydanticError) as error:
            Type(
                state=State,
                methods=Methods(
                    bad_method="not a method",  # type: ignore[arg-type]
                ),
            )

        self.assertEqual(
            str(error.exception),
            "Method 'bad_method' must be an instance of "
            "'Writer', 'Reader', 'Transaction', 'Workflow', or 'UI'.",
        )


class APIValidationErrorsTest(unittest.TestCase):
    """Test UserPydanticError in API.__init__ validation."""

    def test_non_type_data_type(self):
        """API values must be Type instances."""
        with self.assertRaises(UserPydanticError) as error:
            API(
                BadType="not a type",  # type: ignore[arg-type]
            )

        self.assertEqual(
            str(error.exception),
            "Data type 'BadType' must be a 'Type' instance, got 'str'",
        )


class SessionStateValidationErrorsTest(unittest.TestCase):
    """Test that Session state must be default-constructible."""

    def test_session_state_without_defaults_raises_error(self):
        """Session state fields must all have defaults."""

        class BadSessionState(Model):
            value: int = Field(tag=1)  # No default!

        with self.assertRaises(UserPydanticError) as error:
            API(
                Session=Type(
                    state=BadSessionState,
                    methods=Methods(),
                ),
            )

        self.assertEqual(
            str(error.exception),
            "Field `value` in Session state model "
            "`BadSessionState` must have a default "
            "value, or be optional. Session instances "
            "are auto-constructed, in their default "
            "(empty) state, for every new AI session "
            "connecting to the application, and such "
            "a fresh state must be valid.",
        )

    def test_session_state_with_defaults_is_valid(self):
        """Session state with all defaults should be accepted."""

        class GoodSessionState(Model):
            value: int = Field(tag=1, default=0)

        # Should not raise.
        API(
            Session=Type(
                state=GoodSessionState,
                methods=Methods(),
            ),
        )

    def test_session_state_with_optional_field_is_valid(self):
        """Session state with Optional fields is accepted."""

        class GoodSessionState(Model):
            value: Optional[str] = Field(tag=1)

        # Should not raise: Optional fields default to None.
        API(
            Session=Type(
                state=GoodSessionState,
                methods=Methods(),
            ),
        )


if __name__ == "__main__":
    unittest.main()
