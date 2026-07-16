import os
import unittest
from cryptography.exceptions import InvalidTag
from rbt.std.ciphertext.v1.ciphertext_pb2 import (
    DecryptionFailed,
    ScopeShredded,
)
from rbt.std.ciphertext.v1.ciphertext_rbt import Ciphertext, KeyManager
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot, temporary_environ
from reboot.settings import ENVVAR_REBOOT_CRYPTO_ROOT_KEYS
from reboot.std.ciphertext.v1 import _crypto
from reboot.std.ciphertext.v1.ciphertext import (
    APP_SHARED_KEY_MANAGER_ID,
    ciphertext_library,
    make_associated_data,
)
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
from uuid import uuid4

PLAINTEXT = b"123-45-6789"
ASSOCIATED_DATA = make_associated_data(user_id="42", purpose="ssn")


class TestCiphertext(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # `Reboot` sets a default `REBOOT_CRYPTO_ROOT_KEYS` for tests,
        # so we don't provision one here (but some tests below
        # overrides it to control versions).
        self.rbt = Reboot()
        await self.rbt.start()
        self.revision = await self.rbt.up(
            Application(
                libraries=[
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

    async def _encrypt(
        self,
        *,
        plaintext: bytes,
        associated_data: bytes,
        scope: str,
        key_manager_id: str,
    ) -> str:
        ciphertext, _ = await Ciphertext.encrypt(
            self.context,
            plaintext=plaintext,
            associated_data=associated_data,
            scope=scope,
            key_manager_id=key_manager_id,
        )
        return ciphertext.state_id

    async def _decrypt(
        self,
        ciphertext_id: str,
        *,
        associated_data: bytes,
    ) -> bytes:
        response = await Ciphertext.ref(ciphertext_id).decrypt(
            self.context,
            associated_data=associated_data,
        )
        return response.plaintext

    async def _shred(
        self,
        *,
        scope: str,
        key_manager_id: str,
    ) -> None:
        await KeyManager.ref(key_manager_id).shred(self.context, scope=scope)

    async def _wait_for_active_version(self, version: int) -> None:
        # The `Watch` control loop rotates in the background; react to
        # `status` updates until the active version reaches the expected
        # one and the rotation has settled (the test times out otherwise).
        async for response in KeyManager.ref(
            APP_SHARED_KEY_MANAGER_ID,
        ).reactively().status(self.context):
            if response.active_version >= version and not response.rotating:
                break

    async def test_encrypt_decrypt_round_trip(self) -> None:
        ciphertext_id = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="user:42",
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )
        self.assertEqual(
            await
            self._decrypt(ciphertext_id, associated_data=ASSOCIATED_DATA),
            PLAINTEXT,
        )

    async def test_wrong_associated_data_fails(self) -> None:
        ciphertext_id = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="user:42",
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )
        with self.assertRaises(Ciphertext.DecryptAborted) as raised:
            await self._decrypt(
                ciphertext_id,
                associated_data=make_associated_data(
                    user_id="99", purpose="ssn"
                ),
            )
        self.assertIsInstance(raised.exception.error, DecryptionFailed)

    async def test_shred_makes_unrecoverable(self) -> None:
        ciphertext_id = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="user:42",
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )
        self.assertEqual(
            await
            self._decrypt(ciphertext_id, associated_data=ASSOCIATED_DATA),
            PLAINTEXT,
        )

        await self._shred(
            scope="user:42", key_manager_id=APP_SHARED_KEY_MANAGER_ID
        )

        with self.assertRaises(Ciphertext.DecryptAborted) as raised:
            await self._decrypt(ciphertext_id, associated_data=ASSOCIATED_DATA)
        self.assertIsInstance(raised.exception.error, ScopeShredded)

    async def test_shred_is_scoped(self) -> None:
        ciphertext_id_a = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="scope-a",
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )
        ciphertext_id_b = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="scope-b",
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )

        await self._shred(
            scope="scope-a", key_manager_id=APP_SHARED_KEY_MANAGER_ID
        )

        self.assertEqual(
            await
            self._decrypt(ciphertext_id_b, associated_data=ASSOCIATED_DATA),
            PLAINTEXT,
        )
        with self.assertRaises(Ciphertext.DecryptAborted):
            await self._decrypt(
                ciphertext_id_a, associated_data=ASSOCIATED_DATA
            )

    async def test_rescope_moves_scope(self) -> None:
        ciphertext_id = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="old-scope",
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )

        await Ciphertext.ref(ciphertext_id).rescope(
            self.context,
            scope="new-scope",
        )
        self.assertEqual(
            await
            self._decrypt(ciphertext_id, associated_data=ASSOCIATED_DATA),
            PLAINTEXT,
        )

        await self._shred(
            scope="old-scope", key_manager_id=APP_SHARED_KEY_MANAGER_ID
        )
        self.assertEqual(
            await
            self._decrypt(ciphertext_id, associated_data=ASSOCIATED_DATA),
            PLAINTEXT,
        )

        await self._shred(
            scope="new-scope", key_manager_id=APP_SHARED_KEY_MANAGER_ID
        )
        with self.assertRaises(Ciphertext.DecryptAborted):
            await self._decrypt(ciphertext_id, associated_data=ASSOCIATED_DATA)

    async def test_key_managers_are_independent(self) -> None:
        # The same scope under two different `KeyManager` instances yields
        # independent wrapping keys: revoking one does not shred the other.
        ciphertext_id_a = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="user:1",
            key_manager_id="manager-a",
        )
        ciphertext_id_b = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="user:1",
            key_manager_id="manager-b",
        )

        await self._shred(scope="user:1", key_manager_id="manager-a")

        self.assertEqual(
            await
            self._decrypt(ciphertext_id_b, associated_data=ASSOCIATED_DATA),
            PLAINTEXT,
        )
        with self.assertRaises(Ciphertext.DecryptAborted):
            await self._decrypt(
                ciphertext_id_a, associated_data=ASSOCIATED_DATA
            )

    async def test_watch_rotates_after_new_version(self) -> None:
        # This test controls the root key versions itself; restore whatever
        # `REBOOT_CRYPTO_ROOT_KEYS` was on cleanup.
        temporary_environ(
            self,
            {ENVVAR_REBOOT_CRYPTO_ROOT_KEYS: "v1:test-root-secret-aaa"},
        )
        ciphertext_id = await self._encrypt(
            plaintext=PLAINTEXT,
            associated_data=ASSOCIATED_DATA,
            scope="user:1",
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )
        await self._wait_for_active_version(1)

        # Operator updates the secret and restarts the application.
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = (
            "v2:test-root-secret-bbb,v1:test-root-secret-aaa"
        )
        await self.rbt.down()
        await self.rbt.up(revision=self.revision)

        # The `Watch` control loop should pick up v2 and rotate to it.
        await self._wait_for_active_version(2)

        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "v2:test-root-secret-bbb"
        self.assertEqual(
            await
            self._decrypt(ciphertext_id, associated_data=ASSOCIATED_DATA),
            PLAINTEXT,
        )


class TestMakeAssociatedData(unittest.TestCase):
    """Unit tests for the `make_associated_data` canonical encoder."""

    def test_is_independent_of_key_order(self) -> None:
        self.assertEqual(
            make_associated_data(user_id="42", purpose="ssn"),
            make_associated_data(purpose="ssn", user_id="42"),
        )

    def test_distinguishes_fields_unambiguously(self) -> None:
        self.assertNotEqual(
            make_associated_data(user_id="a:b", purpose="c"),
            make_associated_data(user_id="a", purpose="b:c"),
        )

    def test_golden_wire_format(self) -> None:
        self.assertEqual(
            make_associated_data(user_id="42", purpose="ssn"),
            b"\x00\x00\x00\x07purpose\x00\x00\x00\x03ssn"
            b"\x00\x00\x00\x07user_id\x00\x00\x00\x0242",
        )


class TestCiphertextCrypto(unittest.TestCase):
    """Unit tests for the pure-crypto helpers (no Reboot harness)."""

    def test_encrypt_decrypt_round_trip(self) -> None:
        key = _crypto.generate_key()
        blob = _crypto.encrypt(
            key=key, plaintext=PLAINTEXT, associated_data=ASSOCIATED_DATA
        )
        self.assertEqual(
            _crypto.decrypt(
                key=key, blob=blob, associated_data=ASSOCIATED_DATA
            ),
            PLAINTEXT,
        )

    def test_decrypt_rejects_wrong_associated_data(self) -> None:
        key = _crypto.generate_key()
        blob = _crypto.encrypt(
            key=key, plaintext=PLAINTEXT, associated_data=ASSOCIATED_DATA
        )
        with self.assertRaises(InvalidTag):
            _crypto.decrypt(key=key, blob=blob, associated_data=b"wrong")


if __name__ == "__main__":
    unittest.main()


async def main():
    application = Application(
        libraries=[ciphertext_library(),
                   ordered_map_library()],
    )
    await application.run()


# Runs the snippets used in
# `documentation/docs/library_services/ciphertext.mdx`.
class TestCiphertextDocumentation(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                libraries=[
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

        associated_data = make_associated_data(user_id="42", purpose="ssn")

        del associated_data

        ciphertext_id = str(uuid4())
        ciphertext, _ = await Ciphertext.encrypt(
            context,
            ciphertext_id,
            plaintext=b"123-45-6789",
            associated_data=make_associated_data(user_id="42", purpose="ssn"),
            scope="user_id:42",
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )

        del ciphertext

        response = await Ciphertext.ref(ciphertext_id).decrypt(
            context,
            associated_data=make_associated_data(user_id="42", purpose="ssn"),
        )
        plaintext = response.plaintext

        assert plaintext == b"123-45-6789"

        await Ciphertext.ref(ciphertext_id).rescope(
            context,
            scope="tenant:acme",
        )

        ciphertext_id = str(uuid4())

        # Encrypt under a named manager.
        await Ciphertext.encrypt(
            context,
            ciphertext_id,
            plaintext=b"123-45-6789",
            associated_data=make_associated_data(user_id="42", purpose="ssn"),
            scope="user_id:42",
            key_manager_id="tenant:acme",
        )

        # Shred that scope within the same manager.
        await KeyManager.ref("tenant:acme").shred(context, scope="user_id:42")

        await KeyManager.ref(APP_SHARED_KEY_MANAGER_ID).shred(
            context,
            scope="user_id:42",
        )
