import os
import unittest
from log.log import get_logger
from reboot.aio.applications import Application
from reboot.aio.auth import Auth
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.exceptions import InputError
from reboot.aio.external import InitializeContext
from reboot.aio.servicers import Servicer
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot.aio.types import ServiceName, StateTypeName
from reboot.ping.ping import CounterServicer, UserServicer
from reboot.ping.ping_api_rbt import User
from reboot.settings import ENVVAR_RBT_DEV
from reboot.std.collections.v1.sorted_map import SortedMap, sorted_map_library
from tests.reboot.greeter_servicers import MyClockServicer, MyGreeterServicer
from typing import Optional
from unittest import mock

logger = get_logger(__name__)


class _BearerIsUserIdForTest(TokenVerifier):
    """A `TokenVerifier` that takes the bearer token verbatim as the
    user ID."""

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        if token is None:
            return None
        return Auth(user_id=token)


# Minimal `Servicer` stubs for exercising MCP auto-registration during
# mounting. Only the attributes the mount path reads need real values.
class _StubUserA(Servicer):
    __service_names__ = [ServiceName("test.v1.ServiceC")]
    __state_type_name__ = StateTypeName("test.v1.UserA")
    _is_auto_construct = True


class _StubUserB(Servicer):
    __service_names__ = [ServiceName("test.v1.ServiceD")]
    __state_type_name__ = StateTypeName("test.v1.UserB")
    _is_auto_construct = True


class TestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_initialize_is_internal(self) -> None:
        """
        Tests that the `initialize` method run by Application is given
        application-internal credentials.
        """

        async def initialize(context: InitializeContext) -> None:
            # A SortedMap requires application-internal credentials, so calling
            # it successfully means that the `initialize` method was given the
            # appropriate credentials.
            await SortedMap.ref("unimportant").Insert(
                context,
                entries={"Foo": b"Bar"},
            )

        application = Application(
            libraries=[sorted_map_library()],
            initialize=initialize,
        )

        await self.rbt.up(application)

    async def test_incorrect_arguments(self) -> None:
        """
        Tests that when a developer accidentally passes incorrectly-typed
        values to `Application`, they are told at runtime if the mistake is not
        caught at static-check-time.
        """
        with self.assertRaises(ValueError) as e:
            Application(
                servicers=[MyGreeterServicer()]  # type: ignore[list-item]
            )
        self.assertEqual(
            "The `servicers` parameter contains a 'MyGreeterServicer' object, "
            "but was expecting only classes. Try passing `MyGreeterServicer` "
            "instead of `MyGreeterServicer(...)`",
            str(e.exception),
        )

        with self.assertRaises(ValueError) as e:
            Application(
                servicers=[MyClockServicer]  # type: ignore[list-item]
            )
        self.assertEqual(
            "The `servicers` parameter contains 'MyClockServicer', which is "
            "not a Reboot servicer. If it is a legacy gRPC servicer it "
            "should be passed in via the `legacy_grpc_servicers` parameter "
            "instead",
            str(e.exception),
        )

        with self.assertRaises(ValueError) as e:
            Application(
                legacy_grpc_servicers=[
                    MyClockServicer()  # type: ignore[list-item]
                ]
            )
        self.assertEqual(
            "The `legacy_grpc_servicers` parameter contains a "
            "'MyClockServicer' object, but was expecting only classes. Try "
            "passing `MyClockServicer` instead of `MyClockServicer(...)`",
            str(e.exception),
        )

        with self.assertRaises(ValueError) as e:
            Application(
                legacy_grpc_servicers=[
                    MyGreeterServicer  # type: ignore[list-item]
                ]
            )
        self.assertEqual(
            "The `legacy_grpc_servicers` parameter contains "
            "'MyGreeterServicer', which is a Reboot servicer, not a legacy "
            "gRPC servicer. It should be passed in via the `servicers` "
            "parameter instead",
            str(e.exception),
        )

    async def test_multiple_auto_construct_types_ok(self) -> None:
        """
        Multiple auto-construct types of the same kind are allowed.
        """
        # Should not raise.
        Application(servicers=[_StubUserA, _StubUserB])

    async def test_oauth_without_allowed_origins_raises_outside_dev(
        self,
    ) -> None:
        """
        Outside `rbt dev run`, an `Application(oauth=...)` that leaves
        `allowed_origins` at its default (`None`) fails at
        construction: almost every `oauth=` app has a browser SPA, and
        a missing allow-list would silently CORS-block every
        cross-origin sign-in. An explicit `allowed_origins=[]` opts
        into same-origin-only browser auth instead.
        """
        with self.assertRaises(InputError) as context:
            Application(
                servicers=[_StubUserA],
                oauth=OAuthProviderByEnvironment(
                    dev=Development(),
                    prod=Development(),
                ),
            )
        self.assertIn(
            "requires `allowed_origins=[...]`",
            str(context.exception),
        )

        # An explicit empty list satisfies the requirement.
        Application(
            servicers=[_StubUserA],
            oauth=OAuthProviderByEnvironment(
                dev=Development(),
                prod=Development(),
            ),
            allowed_origins=[],
        )

        # The unit-test selector doesn't require an allow-list at all
        # (its `requires_allowed_origins_in_production()` is `False`),
        # so ordinary tests don't have to pass `allowed_origins`.
        Application(
            servicers=[_StubUserA],
            oauth=OAuthProviderForTest(Development()),
        )

    async def test_oauth_without_allowed_origins_warns_in_dev(
        self,
    ) -> None:
        """
        Under `rbt dev run` the `allowed_origins` default is honored,
        but the same configuration would fail at `rbt cloud up`, so
        construction warns about the missing allow-list. An explicit
        `allowed_origins` (or an `oauth` selector that doesn't require
        an allow-list in production) constructs silently.
        """
        # The same logger `applications.py` writes to: `get_logger`
        # returns children of the shared parent logger, so a bare
        # stdlib name would miss it.
        applications_logger = get_logger('reboot.aio.applications')
        with mock.patch.dict(os.environ, {ENVVAR_RBT_DEV: 'true'}):
            with self.assertLogs(applications_logger, level='WARNING') as logs:
                Application(
                    servicers=[_StubUserA],
                    oauth=OAuthProviderByEnvironment(
                        dev=Development(),
                        prod=Development(),
                    ),
                )
            self.assertTrue(
                any(
                    'will fail to deploy to production' in line
                    for line in logs.output
                ),
                logs.output,
            )

            # An explicit `allowed_origins` (even empty) constructs
            # without warning, as do an `oauth` selector that doesn't
            # require an allow-list in production and an application
            # without `oauth=` at all.
            with self.assertNoLogs(applications_logger, level='WARNING'):
                Application(
                    servicers=[_StubUserA],
                    oauth=OAuthProviderByEnvironment(
                        dev=Development(),
                        prod=Development(),
                    ),
                    allowed_origins=[],
                )
                Application(
                    servicers=[_StubUserA],
                    oauth=OAuthProviderForTest(Development()),
                )
                Application(servicers=[_StubUserA])

    async def test_oauth_composes_with_token_verifier(self) -> None:
        """
        `oauth=` and `token_verifier=` may both be passed: the OAuth
        server's verifier runs first and any token it has no opinion
        on falls through to the user's verifier.

        This exercises both branches against a live application: a
        Reboot-minted access JWT authenticates via the OAuth server's
        verifier, and an arbitrary non-JWT bearer — which the OAuth
        verifier has no opinion on — falls through to
        `_BearerIsUserIdForTest`, which takes the bearer verbatim as the
        authenticated user ID.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
                token_verifier=_BearerIsUserIdForTest(),
            ),
        )

        # OAuth path: a token minted through the production chokepoint
        # authenticates via the OAuth server's verifier, which is
        # authoritative for Reboot-minted access JWTs (and
        # auto-constructed the `User` as a mint side effect).
        oauth_context = self.rbt.create_external_context(
            name=f"oauth-{self.id()}",
            bearer_token=await self.rbt.make_valid_oauth_access_token(
                user_id="alice",
            ),
        )
        oauth_response = await User.ref("alice").whoami(oauth_context)
        self.assertEqual(oauth_response.user_id, "alice")

        # Fallthrough path: "carol" is not a JWT, so the OAuth server's
        # verifier has no opinion and the bearer falls through to
        # `_BearerIsUserIdForTest`, which authenticates the caller as the
        # literal token string. Nothing minted a token for "carol", so
        # the `User` is auto-constructed here rather than as a mint side
        # effect.
        custom_context = self.rbt.create_external_context(
            name=f"fallthrough-{self.id()}",
            bearer_token="carol",
        )
        await UserServicer._auto_construct(
            custom_context,
            state_id="carol",
        )
        custom_response = await User.ref("carol").whoami(custom_context)
        self.assertEqual(custom_response.user_id, "carol")

    async def test_duplicate_mcp_tool_names_raises(self) -> None:
        """
        Two servicers registering the same MCP tool is an error.
        """

        class _FooServicer(Servicer):
            __service_names__ = [ServiceName("test.v1.Svc")]
            __state_type_name__ = StateTypeName("test.v1.Foo")
            _is_auto_construct = False

            @staticmethod
            def _mcp_tool_names() -> list[str]:
                return ["foo_bar"]

        class _FooV2Servicer(Servicer):
            __service_names__ = [ServiceName("test.v2.Svc")]
            __state_type_name__ = StateTypeName("test.v2.Foo")
            _is_auto_construct = False

            @staticmethod
            def _mcp_tool_names() -> list[str]:
                return ["foo_bar"]

        with self.assertRaises(ValueError) as e:
            Application(servicers=[_FooServicer, _FooV2Servicer])
        msg = str(e.exception)
        self.assertIn("Duplicate MCP tool name 'foo_bar'", msg)
        self.assertIn("'_FooServicer'", msg)
        self.assertIn("'_FooV2Servicer'", msg)


if __name__ == "__main__":
    unittest.main()
