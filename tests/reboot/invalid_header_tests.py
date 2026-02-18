import unittest
from reboot.aio.call import (
    InvalidBearerTokenError,
    InvalidStateRefError,
    Options,
)
from reboot.aio.external import ExternalContext
from reboot.aio.headers import Headers
from reboot.aio.types import (
    ApplicationId,
    InvalidIdempotencyKeyError,
    StateId,
    StateRef,
    StateTypeName,
)
from tests.reboot.greeter_rbt import Greeter


def _state_ref(state_id: StateId) -> StateRef:
    return StateRef.from_id(StateTypeName("Test"), state_id)


class RebootTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_non_ascii_header_values_backstop(self) -> None:
        """
        As a backstop, the `Headers` class enforces that no user-settable
        headers contain non-ASCII values.

        This backstop is valuable in case we forget to validate an input in the
        call path towards header serialization.
        """
        with self.assertRaises(ValueError) as e:
            _state_ref('😾'),
        self.assertEqual(
            str(e.exception), (
                "The 'state_id' option must be an ASCII string; the given value "
                "'😾' is not ASCII"
            )
        )

        with self.assertRaises(ValueError) as e:
            Headers(
                application_id=ApplicationId('test'),
                state_ref=_state_ref('test'),
                bearer_token='😾',
            )
        self.assertEqual(
            str(e.exception), (
                "The 'bearer_token' option must be an ASCII string; the given "
                "value '😾' is not ASCII"
            )
        )

        with self.assertRaises(ValueError) as e:
            Headers(
                application_id=ApplicationId('test'),
                state_ref=_state_ref('test'),
                bearer_token='test\n',
            )
        self.assertEqual(
            "The 'bearer_token' option contained illegal characters: ['\\n']. "
            "The value was: 'test\\n'",
            str(e.exception),
        )

    async def test_invalid_state_ref_type(self) -> None:
        """
        Using an actor ID (in a lookup, or a constructor) that is not a `str`
        will raise an exception earlier than header serialization, so that the
        user gets a friendlier stack trace.
        """
        # Lookup.
        with self.assertRaises(TypeError) as type_error:
            # Intentionally create a type error, as might happen when the user
            # doesn't use mypy.
            Greeter.ref(123)  # type: ignore[arg-type]
        self.assertEqual(
            str(type_error.exception),
            "The 'state_id' option must be of type 'str', but got 'int'"
        )

        # Constructor.
        with self.assertRaises(AssertionError) as assertion_error:
            context = ExternalContext(name='test', url='http://test')
            # Intentionally create a type error, as might happen when the user
            # doesn't use mypy.
            await Greeter.Create(
                context, 123
            )  # type: ignore[arg-type, call-overload]
        self.assertEqual(
            str(assertion_error.exception),
            "Invalid argument type. Did you pass:\n"
            "  - A 'state_id' that is not of type 'reboot.aio.types.StateId'?\n"
            "  - 'options' that are not of type 'reboot.aio.call.Options'?"
        )

    async def test_invalid_state_ref_value_non_ascii(self) -> None:
        """
        Using an actor ID (in a lookup, or a constructor) with non-ASCII
        characters will raise an exception earlier than header serialization, so
        that the user gets a friendlier stack trace.
        """
        # Lookup.
        with self.assertRaises(InvalidStateRefError) as e:
            Greeter.ref('😾')
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option must be an ASCII string; the given value "
            "'😾' is not ASCII"
        )

        # Constructor.
        with self.assertRaises(InvalidStateRefError) as e:
            context = ExternalContext(name='test', url='http://test')
            await Greeter.Create(context, '😾')
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option must be an ASCII string; the given value "
            "'😾' is not ASCII"
        )

    async def test_invalid_state_ref_value_too_short(self) -> None:
        """
        Using an actor ID (in a lookup, or a constructor) with too few
        characters will raise an exception.
        """
        # Lookup.
        with self.assertRaises(InvalidStateRefError) as e:
            Greeter.ref('')
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option must be at least 1 character(s) long; the "
            "given value is 0 character(s) long"
        )

        # Constructor.
        with self.assertRaises(InvalidStateRefError) as e:
            context = ExternalContext(name='test', url='http://test')
            await Greeter.Create(context, '')
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option must be at least 1 character(s) long; the "
            "given value is 0 character(s) long"
        )

    async def test_invalid_state_ref_value_too_long(self) -> None:
        """
        Using an actor ID (in a lookup, or a constructor) with too many
        characters will raise an exception.
        """
        # Lookup.
        with self.assertRaises(InvalidStateRefError) as e:
            Greeter.ref('x' * 129)
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option must be at most 128 characters long; the "
            "given value is 129 characters long"
        )

        # Constructor.
        with self.assertRaises(InvalidStateRefError) as e:
            context = ExternalContext(name='test', url='http://test')
            await Greeter.Create(context, 'x' * 129)
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option must be at most 128 characters long; the "
            "given value is 129 characters long"
        )

    async def test_invalid_state_ref_value_invalid_char(self) -> None:
        """
        Using an actor ID (in a lookup, or a constructor) with an invalid character
        will raise an exception.
        """
        # Lookup.
        with self.assertRaises(InvalidStateRefError) as e:
            Greeter.ref('hello \x00?')
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option contained illegal characters: ['\\x00']. "
            "The value was: 'hello \\x00?'"
        )
        with self.assertRaises(InvalidStateRefError) as e:
            Greeter.ref('hello \\?')
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option contained illegal characters: ['\\\\']. "
            "The value was: 'hello \\\\?'"
        )

        # Constructor.
        with self.assertRaises(InvalidStateRefError) as e:
            context = ExternalContext(name='test', url='http://test')
            await Greeter.Create(context, 'hello \x00?')
        self.assertEqual(
            str(e.exception),
            "The 'state_id' option contained illegal characters: ['\\x00']. "
            "The value was: 'hello \\x00?'"
        )

    async def test_invalid_bearer_token_type(self) -> None:
        """
        Using an invalid bearer token type will raise an exception earlier than
        header serialization, so that the user gets a friendlier stack trace.
        """
        with self.assertRaises(TypeError) as e:
            await Greeter.Create(
                ExternalContext(name='test', url='http://test'),
                # Intentionally create a type error, as might happen when the user
                # doesn't use mypy.
                Options(bearer_token=1337),  # type: ignore[arg-type]
            )
        self.assertEqual(
            str(e.exception),
            "The 'bearer_token' option must be of type 'str', but got 'int'"
        )

    async def test_invalid_bearer_token_value(self) -> None:
        """
        Using an invalid bearer token value will raise an exception earlier than
        header serialization, so that the user gets a friendlier stack trace.
        """
        with self.assertRaises(InvalidBearerTokenError) as e:
            await Greeter.Create(
                ExternalContext(name='test', url='http://test'),
                None,
                Options(bearer_token='😾'),
            )
        self.assertEqual(
            str(e.exception),
            "The 'bearer_token' option must be an ASCII string; the given "
            "value '😾' is not ASCII"
        )

        with self.assertRaises(InvalidBearerTokenError) as e:
            await Greeter.Create(
                ExternalContext(name='test', url='http://test'),
                None,
                Options(bearer_token='test\n'),
            )
        self.assertEqual(
            "The 'bearer_token' option contained illegal characters: ['\\n']. "
            "The value was: 'test\\n'",
            str(e.exception),
        )

        with self.assertRaises(InvalidBearerTokenError) as e:
            await Greeter.Create(
                ExternalContext(name='test', url='http://test'),
                None,
                Options(bearer_token='x' * 4097),
            )
        self.assertEqual(
            str(e.exception),
            "The 'bearer_token' option must be at most 4096 characters long; "
            "the given value is 4097 characters long"
        )

    async def test_invalid_idempotency_key_type(self) -> None:
        """
        Using an invalid idempotency key type will raise an exception earlier
        than header serialization, so that the user gets a friendlier stack
        trace.
        """
        with self.assertRaises(TypeError) as e:
            await Greeter.idempotently(
                # Intentionally create a type error, as might happen
                # when the user doesn't use mypy.
                key=1337,  # type: ignore[call-overload]
            ).Create(
                ExternalContext(name='test', url='http://test'),
                'valid-state-ref',
            )
        self.assertEqual(
            str(e.exception),
            "The 'key' option must be of type 'str', but got 'int'"
        )

    async def test_invalid_idempotency_key_value(self) -> None:
        """
        Using an invalid bearer token value will raise an exception earlier than
        header serialization, so that the user gets a friendlier stack trace.
        """
        with self.assertRaises(InvalidIdempotencyKeyError) as e:
            await Greeter.idempotently(
                # Intentionally create a type error, as might happen
                # when the user doesn't use mypy.
                key='😾'  # type: ignore[call-overload]
            ).Create(
                ExternalContext(name='test', url='http://test'),
                'valid-state-ref',
            )
        self.assertEqual(
            str(e.exception),
            "The 'key' option must be an ASCII string; the given "
            "value '😾' is not ASCII"
        )

        with self.assertRaises(InvalidIdempotencyKeyError) as e:
            # Intentionally create a type error, as might happen
            # when the user doesn't use mypy.
            await Greeter.idempotently(
                key='x' * 129,
            ).Create(  # type: ignore[call-overload]
                ExternalContext(name='test', url='http://test'),
            )
        self.assertEqual(
            str(e.exception),
            "The 'key' option must be at most 128 characters long; "
            "the given value is 129 characters long"
        )


if __name__ == '__main__':
    unittest.main()
