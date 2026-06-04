"""Reboot-managed cryptographic root keys.

Reboot provisions and rotates a versioned set of root keys in the
`REBOOT_CRYPTO_ROOT_KEYS` environment variable (a comma-separated list of
`vN:key` entries; the highest version is "active"). Libraries derive
their own purpose-specific keys from these roots via HKDF-SHA256, passing a
distinct `info` label per use so that derived keys are independent (domain
separation) — e.g., the ciphertext library derives a key-encryption key and
the MCP OAuth server derives its JWT signing key.

This module deliberately has no Reboot dependencies so it can be used from
anywhere (including the framework's auth path) and unit tested in isolation.
"""

import os
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from reboot.settings import ENVVAR_REBOOT_CRYPTO_ROOT_KEYS


class MissingRootKeys(Exception):
    """Raised when `REBOOT_CRYPTO_ROOT_KEYS` is unset or empty."""


class MalformedRootKeys(Exception):
    """Raised when `REBOOT_CRYPTO_ROOT_KEYS` is not a `vN:key` list."""


class UnknownRootKeyVersion(Exception):
    """Raised when a requested version is not in `REBOOT_CRYPTO_ROOT_KEYS`
    (e.g., it was retired before everything derived from it stopped being
    used)."""


def derive_key(*, info: bytes, version: int, length: int = 32) -> bytes:
    """Derives a `length`-byte key from root key `version` via HKDF-SHA256,
    using `info` as the HKDF `info`.

    `info` is a domain separator: distinct `info` labels derive independent
    keys from the same root, so each library can derive its own keys
    without collision. Raises `UnknownRootKeyVersion` if `version` is not
    configured.
    """
    key = _parse().get(version)
    if key is None:
        raise UnknownRootKeyVersion(
            f"root key version v{version} is not in "
            f"'{ENVVAR_REBOOT_CRYPTO_ROOT_KEYS}'"
        )
    return HKDF(
        algorithm=hashes.SHA256(),
        length=length,
        salt=None,
        info=info,
    ).derive(key.encode())


def active_version() -> int:
    """Returns the highest configured root key version — the one new keys
    should be derived from."""
    return max(_parse())


def available_versions() -> list[int]:
    """Returns all configured root key versions, ascending."""
    return sorted(_parse())


def _parse() -> dict[int, str]:
    """Parses `REBOOT_CRYPTO_ROOT_KEYS` into `{version: key}`."""
    value = os.environ.get(ENVVAR_REBOOT_CRYPTO_ROOT_KEYS)
    if not value:
        raise MissingRootKeys(f"'{ENVVAR_REBOOT_CRYPTO_ROOT_KEYS}' is not set")

    keys: dict[int, str] = {}
    for entry in value.split(","):
        entry = entry.strip()
        prefix, separator, key = entry.partition(":")
        if separator != ":" or not prefix.startswith("v") or not key:
            raise MalformedRootKeys(
                f"'{ENVVAR_REBOOT_CRYPTO_ROOT_KEYS}' entry '{entry}' is not of "
                "the form 'vN:key'"
            )
        try:
            version = int(prefix[1:])
        except ValueError:
            raise MalformedRootKeys(
                f"'{ENVVAR_REBOOT_CRYPTO_ROOT_KEYS}' entry '{entry}' has a "
                "non-integer version"
            )
        keys[version] = key
    return keys
