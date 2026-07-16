import rbt.v1alpha1.errors_pb2
import unittest
from rbt.std.ciphertext.v1.ciphertext_rbt import KeyManager
from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager, OAuthTokens
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.std.ciphertext.v1.ciphertext import ciphertext_library
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
from reboot.std.oauth.v1.oauth import (
    GITHUB,
    GOOGLE,
    _key_manager_id,
    oauth_library,
)


class TestOAuthTokenManager(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # `Reboot` sets a default `REBOOT_CRYPTO_ROOT_KEYS` for tests.
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                libraries=[
                    oauth_library(),
                    ciphertext_library(),
                    ordered_map_library(),
                ]
            )
        )
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _store(
        self,
        *,
        service: str,
        user_id: str,
        access_token: str,
        refresh_token: str | None = None,
    ) -> None:
        await OAuthTokenManager.ref(service).store(
            self.context,
            user_id=user_id,
            tokens=OAuthTokens(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=None,
                scopes=[],
            ),
        )

    async def _fetch(self, *, service: str, user_id: str):
        return await OAuthTokenManager.ref(service).fetch(
            self.context, user_id=user_id
        )

    async def _shred(self, *, service: str, user_id: str) -> None:
        # Shred a single user's tokens for a service: revoke the wrapping
        # key for their scope within the service's dedicated `KeyManager`.
        await KeyManager.ref(_key_manager_id(service)
                            ).shred(self.context, scope=user_id)

    async def test_store_fetch_round_trip(self) -> None:
        await self._store(
            service=GOOGLE,
            user_id="u1",
            access_token="access-1",
            refresh_token="refresh-1",
        )
        fetched = await self._fetch(service=GOOGLE, user_id="u1")
        self.assertTrue(fetched.found)
        self.assertEqual(fetched.tokens.access_token, "access-1")
        self.assertEqual(fetched.tokens.refresh_token, "refresh-1")

    async def test_fetch_before_any_store_is_unconstructed(self) -> None:
        # Nothing stored for the service yet: the manager is unconstructed,
        # so `fetch` aborts with `StateNotConstructed`. Callers treat this
        # as "no tokens".
        with self.assertRaises(OAuthTokenManager.FetchAborted) as raised:
            await self._fetch(service=GOOGLE, user_id="nobody")
        self.assertIsInstance(
            raised.exception.error,
            rbt.v1alpha1.errors_pb2.StateNotConstructed,
        )

    async def test_fetch_unknown_user_is_not_found(self) -> None:
        # Once the manager exists (a different user was stored), fetching a
        # user with no tokens reports `found=False` rather than aborting.
        await self._store(
            service=GOOGLE, user_id="u1", access_token="access-1"
        )
        fetched = await self._fetch(service=GOOGLE, user_id="someone-else")
        self.assertFalse(fetched.found)

    async def test_services_are_independent(self) -> None:
        # The same user under two services gets independent ciphertexts,
        # encrypted under separate `KeyManager`s; shredding one service's
        # tokens leaves the other readable.
        await self._store(
            service=GOOGLE, user_id="u1", access_token="google-access"
        )
        await self._store(
            service=GITHUB, user_id="u1", access_token="github-access"
        )

        await self._shred(service=GOOGLE, user_id="u1")

        self.assertFalse(
            (await self._fetch(service=GOOGLE, user_id="u1")).found
        )
        github = await self._fetch(service=GITHUB, user_id="u1")
        self.assertTrue(github.found)
        self.assertEqual(github.tokens.access_token, "github-access")

    async def test_shred_is_per_user(self) -> None:
        await self._store(
            service=GOOGLE, user_id="u1", access_token="access-1"
        )
        await self._store(
            service=GOOGLE, user_id="u2", access_token="access-2"
        )

        await self._shred(service=GOOGLE, user_id="u1")

        self.assertFalse(
            (await self._fetch(service=GOOGLE, user_id="u1")).found
        )
        kept = await self._fetch(service=GOOGLE, user_id="u2")
        self.assertTrue(kept.found)
        self.assertEqual(kept.tokens.access_token, "access-2")

    async def test_second_store_replaces_tokens(self) -> None:
        # `store` replaces wholesale: a later store with no refresh token
        # drops the previously stored one. (Carrying a refresh token
        # forward is the caller's responsibility, via `fetch` + merge).
        await self._store(
            service=GOOGLE,
            user_id="u1",
            access_token="access-1",
            refresh_token="refresh-1",
        )
        await self._store(
            service=GOOGLE,
            user_id="u1",
            access_token="access-2",
            refresh_token=None,
        )
        fetched = await self._fetch(service=GOOGLE, user_id="u1")
        self.assertTrue(fetched.found)
        self.assertEqual(fetched.tokens.access_token, "access-2")
        self.assertFalse(fetched.tokens.HasField("refresh_token"))

    async def test_unset_refresh_token_stays_unset(self) -> None:
        # With no refresh token ever stored, the fetched message has it
        # unset (not the empty string).
        await self._store(
            service=GOOGLE, user_id="u1", access_token="access-1"
        )
        fetched = await self._fetch(service=GOOGLE, user_id="u1")
        self.assertTrue(fetched.found)
        self.assertFalse(fetched.tokens.HasField("refresh_token"))


if __name__ == "__main__":
    unittest.main()


# Runs the snippets used in
# `documentation/docs/library_services/oauth_token_manager.mdx`.
class TestOAuthTokenManagerDocumentation(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                libraries=[
                    oauth_library(),
                    ciphertext_library(),
                    ordered_map_library(),
                ]
            )
        )
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_documentation_snippets(self) -> None:
        context = self.context

        user_id = "u1"
        access_token = "access-1"
        refresh_token = "refresh-1"
        expires_at = 2000000000
        granted_scopes = ["calendar.events"]

        await OAuthTokenManager.ref("slack.com").store(
            context,
            user_id=user_id,
            tokens=OAuthTokens(
                access_token=access_token,
                refresh_token=refresh_token,  # Omit if none was issued.
                expires_at=expires_at,  # Epoch seconds, if reported.
                scopes=granted_scopes,
            ),
        )

        await OAuthTokenManager.ref(GOOGLE).store(
            context,
            user_id=user_id,
            tokens=OAuthTokens(access_token=access_token),
        )

        response = await OAuthTokenManager.ref(GOOGLE).fetch(
            context,
            user_id=user_id,
        )
        if response.found:
            access_token = response.tokens.access_token

        assert response.found

        await KeyManager.ref(_key_manager_id(GOOGLE)).shred(
            context,
            scope=user_id,
        )
