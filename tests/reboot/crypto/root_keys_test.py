import os
import unittest
from reboot.crypto import root_keys
from reboot.settings import ENVVAR_REBOOT_CRYPTO_ROOT_KEYS

_INFO_A = b"reboot.test.info.a"
_INFO_B = b"reboot.test.info.b"


class TestRootKeys(unittest.TestCase):

    def setUp(self) -> None:
        self._original = os.environ.get(ENVVAR_REBOOT_CRYPTO_ROOT_KEYS)

    def tearDown(self) -> None:
        if self._original is None:
            os.environ.pop(ENVVAR_REBOOT_CRYPTO_ROOT_KEYS, None)
        else:
            os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = self._original

    def test_derive_key_is_deterministic(self) -> None:
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "v1:key-one"
        self.assertEqual(
            root_keys.derive_key(info=_INFO_A, version=1),
            root_keys.derive_key(info=_INFO_A, version=1),
        )

    def test_derive_key_default_length(self) -> None:
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "v1:key-one"
        self.assertEqual(
            len(root_keys.derive_key(info=_INFO_A, version=1)), 32
        )
        self.assertEqual(
            len(root_keys.derive_key(info=_INFO_A, version=1, length=16)), 16
        )

    def test_domain_separation(self) -> None:
        # Different `info` labels derive independent keys from the same
        # root key.
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "v1:key-one"
        self.assertNotEqual(
            root_keys.derive_key(info=_INFO_A, version=1),
            root_keys.derive_key(info=_INFO_B, version=1),
        )

    def test_versions_derive_independent_keys(self) -> None:
        # The same `info` against different root versions derives different
        # keys (different underlying root).
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "v2:key-two,v1:key-one"
        self.assertNotEqual(
            root_keys.derive_key(info=_INFO_A, version=1),
            root_keys.derive_key(info=_INFO_A, version=2),
        )

    def test_active_version_is_highest(self) -> None:
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "v1:key-one,v3:c,v2:b"
        self.assertEqual(root_keys.active_version(), 3)

    def test_available_versions_sorted(self) -> None:
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "v3:c,v1:a,v2:b"
        self.assertEqual(root_keys.available_versions(), [1, 2, 3])

    def test_unknown_version(self) -> None:
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "v1:key-one"
        with self.assertRaises(root_keys.UnknownRootKeyVersion):
            root_keys.derive_key(info=_INFO_A, version=2)

    def test_missing(self) -> None:
        os.environ.pop(ENVVAR_REBOOT_CRYPTO_ROOT_KEYS, None)
        with self.assertRaises(root_keys.MissingRootKeys):
            root_keys.active_version()

    def test_malformed(self) -> None:
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "not-versioned"
        with self.assertRaises(root_keys.MalformedRootKeys):
            root_keys.active_version()

    def test_malformed_non_integer_version(self) -> None:
        os.environ[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = "vX:key"
        with self.assertRaises(root_keys.MalformedRootKeys):
            root_keys.active_version()


if __name__ == "__main__":
    unittest.main()
