import unittest
from dataclasses import dataclass
from rbt.v1alpha1.errors_pb2 import Ok, PermissionDenied, Unauthenticated
from reboot.aio.caller_id import CallerID
from reboot.aio.caller_id_auth import (
    APPLICATION_ID_KEY,
    SPACE_ID_KEY,
    Auth,
    TokenVerifier,
    is_from_permitted_applications_by_space,
)
from reboot.aio.headers import Headers
from reboot.aio.types import StateRef
from reboot.naming import ApplicationId, SpaceId
from typing import Optional

LEGAL_SPACE_ID = SpaceId(
    # Required: "s" + 10 characters.
    'spaceeeeeee'
)

LEGAL_APPLICATION_ID = ApplicationId(
    # Required: "a" + 10 characters.
    'application'
)


@dataclass
class FakeContext:
    _headers: Headers
    auth: Optional[Auth] = None


class CallerIdTest(unittest.IsolatedAsyncioTestCase):

    async def test_parse(self) -> None:
        # Test parsing with both space ID and application ID.
        caller_id = CallerID(
            application_id=LEGAL_APPLICATION_ID,
            space_id=LEGAL_SPACE_ID,
        )
        parsed = CallerID.parse(str(caller_id))
        self.assertEqual(caller_id, parsed)

        # Test parsing with just application ID (no space ID).
        caller_id_no_space = CallerID(application_id=LEGAL_APPLICATION_ID)
        parsed_no_space = CallerID.parse(str(caller_id_no_space))
        self.assertEqual(caller_id_no_space, parsed_no_space)

    async def test_parse_invalid(self) -> None:
        # Test parsing with missing application ID.
        with self.assertRaises(ValueError):
            CallerID.parse("space_id=spaceeeeeee")

        # Test parsing with malformed part.
        with self.assertRaises(ValueError):
            CallerID.parse("invalid_part")

    async def test_token_verifier_and_authorizer(self) -> None:
        context = FakeContext(
            _headers=Headers(
                application_id=ApplicationId("unimportant"),
                state_ref=StateRef.
                from_maybe_readable("Unimportant:uninportant"),
                caller_id=CallerID(
                    application_id=LEGAL_APPLICATION_ID,
                    space_id=LEGAL_SPACE_ID,
                ),
            )
        )
        context.auth = await TokenVerifier().verify_token(
            context=context,  # type: ignore[arg-type]
            token="unimportant",
        )
        self.assertEqual(
            Auth(
                user_id=None,
                properties={
                    SPACE_ID_KEY: LEGAL_SPACE_ID,
                    APPLICATION_ID_KEY: LEGAL_APPLICATION_ID,
                },
            ),
            context.auth,
        )

        # Exact match.
        self.assertEqual(
            Ok(),
            is_from_permitted_applications_by_space(
                {LEGAL_SPACE_ID: {LEGAL_APPLICATION_ID}}
            )(
                context=context,  # type: ignore[arg-type]
            ),
        )

        # Wildcard application ID match.
        self.assertEqual(
            Ok(),
            is_from_permitted_applications_by_space(
                {LEGAL_SPACE_ID: {ApplicationId("*")}}
            )(
                context=context,  # type: ignore[arg-type]
            ),
        )

        # Wildcard space ID match.
        self.assertEqual(
            Ok(),
            is_from_permitted_applications_by_space(
                {SpaceId("*"): {LEGAL_APPLICATION_ID}}
            )(
                context=context,  # type: ignore[arg-type]
            ),
        )

        # Double wildcard match.
        self.assertEqual(
            Ok(),
            is_from_permitted_applications_by_space(
                {SpaceId("*"): {ApplicationId("*")}}
            )(
                context=context,  # type: ignore[arg-type]
            ),
        )

        # No match.
        self.assertEqual(
            PermissionDenied(),
            is_from_permitted_applications_by_space(
                {SpaceId("nope"): {ApplicationId("nope")}}
            )(context=context),
        )

        # No auth.
        context.auth = None
        self.assertEqual(
            Unauthenticated(),
            is_from_permitted_applications_by_space({})(
                context=context,  # type: ignore[arg-type]
            )
        )

    async def test_token_verifier_with_no_caller_id(self) -> None:
        # Test with missing caller ID header.
        context = FakeContext(
            _headers=Headers(
                application_id=ApplicationId("unimportant"),
                state_ref=StateRef.
                from_maybe_readable("Unimportant:uninportant"),
                caller_id=None,
            )
        )
        auth = await TokenVerifier().verify_token(
            context=context,  # type: ignore[arg-type]
            token="unimportant",
        )
        self.assertIsNone(auth)


if __name__ == '__main__':
    unittest.main()
