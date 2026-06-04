"""Pure cryptographic helpers for the `Ciphertext` std library.

It implements AES-256-GCM authenticated encryption and derives the
library's key-encryption key (KEK) from the Reboot-managed
cryptographic root keys (see `reboot.crypto.root_keys`).
"""

import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from reboot.crypto import root_keys

# Re-export so the ciphertext servicer can catch a single error type.
UnknownRootKeyVersion = root_keys.UnknownRootKeyVersion

# AES-256-GCM: 256-bit keys, 96-bit nonces.
KEY_LENGTH = 32
NONCE_LENGTH = 12

# HKDF `info` (domain separator) for the ciphertext key-encryption key.
_KEK_INFO = b"reboot.std.ciphertext.kek"


def generate_key() -> bytes:
    """Returns a fresh random 256-bit key, for use as a wrapping key or a
    data encryption key (DEK)."""
    return os.urandom(KEY_LENGTH)


def kek(version: int) -> bytes:
    """The ciphertext key-encryption key derived from root key `version`.
    Raises `UnknownRootKeyVersion` if `version` is no longer configured."""
    return root_keys.derive_key(
        info=_KEK_INFO, version=version, length=KEY_LENGTH
    )


def encrypt(
    *,
    key: bytes,
    plaintext: bytes,
    associated_data: bytes,
) -> bytes:
    """AES-256-GCM encrypts `plaintext`, binding `associated_data` as
    additional authenticated data. Returns `nonce || ciphertext || tag`.
    Keyword-only: every argument is `bytes`, so positional calls are too
    easy to get wrong."""
    nonce = os.urandom(NONCE_LENGTH)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, associated_data)


def decrypt(
    *,
    key: bytes,
    blob: bytes,
    associated_data: bytes,
) -> bytes:
    """Reverses `encrypt`. Raises `cryptography.exceptions.InvalidTag` if
    the key or `associated_data` is wrong, or if `blob` is corrupt.
    Keyword-only: every argument is `bytes`, so positional calls are too
    easy to get wrong."""
    nonce, ciphertext = blob[:NONCE_LENGTH], blob[NONCE_LENGTH:]
    return AESGCM(key).decrypt(nonce, ciphertext, associated_data)
