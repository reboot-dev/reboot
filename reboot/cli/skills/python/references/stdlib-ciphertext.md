---
title: Use `Ciphertext` for Envelope Encryption and Crypto-Shredding
impact: HIGH
impactDescription: Hand-rolled encryption-at-rest / right-to-erasure is easy to get wrong; the stdlib library is auditable and handles key rotation for you.
tags: stdlib, ciphertext, encryption, envelope, crypto-shred, gdpr, right-to-erasure, shred, scope, key-manager, associated-data
---

## Use `Ciphertext` for Envelope Encryption and Crypto-Shredding

> **Critical:** register **both** `ciphertext_library()` **and** > `ordered_map_library()` in `Application(libraries=[...])` —
> `Ciphertext` depends on `OrderedMap`; forgetting either fails at boot
> with "unknown actor type." `associated_data` must be supplied
> **byte-for-byte identical** at decrypt as at encrypt — build it with
> `make_associated_data`, never an ad-hoc string. These methods are
> **app-internal by default** (no authorizer); call them from within
> your app, not directly from untrusted clients.

`Ciphertext`
(`reboot.std.ciphertext.v1.ciphertext` /
`rbt.std.ciphertext.v1.ciphertext_rbt`) is application-layer **envelope
encryption** for data at rest, with **one-call crypto-shredding** (GDPR
"right to erasure"): make a whole _scope_ of data permanently
unrecoverable by destroying a single key, without finding or rewriting
the data itself. Reach for it when you store sensitive values (PII,
secrets, notes) and want either encryption-at-rest or per-user/per-tenant
erasure.

### The model (three key layers)

```
root KEK   — derived from REBOOT_CRYPTO_ROOT_KEYS (auto-provisioned); never stored.
  └ wraps → WrappingKey — one per `scope`; the revocable unit, stored *encrypted*.
     └ wraps → DEK — a fresh per-value data-encryption key.
        └ encrypts → your plaintext   (the stored "envelope")
```

- Recovering a value needs _both_ the database _and_
  `REBOOT_CRYPTO_ROOT_KEYS` (which lives outside the DB) — a leaked
  backup alone is inert.
- **`scope`** is the crypto-shred unit (a user id, tenant id — any
  string). Shredding it destroys the one `WrappingKey` that can unwrap
  every value in that scope.
- Root-key **rotation is automatic** and cheap — only the small wrapping
  keys are re-wrapped, never the data (see Rotation below).

### Register the libraries

```python
from reboot.std.ciphertext.v1.ciphertext import ciphertext_library
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)


async def main():
    await Application(
        servicers=[VaultServicer],
        libraries=[ciphertext_library(), ordered_map_library()],
    ).run()
```

### Methods

| Call                                                                                      | Type                      | Notes                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Ciphertext.encrypt(context, [id], *, plaintext, associated_data, scope, key_manager_id)` | transaction (constructor) | `key_manager_id` is **required** (pass `APP_SHARED_KEY_MANAGER_ID`); returns `(ref, EncryptResponse)`; omit `id` to auto-generate one and read it back as `ref.state_id` |
| `Ciphertext.ref(id).decrypt(context, *, associated_data)`                                 | reader                    | `-> DecryptResponse(plaintext)`. Raises `DecryptAborted`                                                                                                                 |
| `Ciphertext.ref(id).rescope(context, *, scope)`                                           | transaction               | move a ciphertext to a different scope (same manager); only the wrapped DEK changes                                                                                      |
| `KeyManager.ref(APP_SHARED_KEY_MANAGER_ID).shred(context, *, scope)`                      | transaction               | crypto-shred a scope — idempotent                                                                                                                                        |
| `KeyManager.ref(APP_SHARED_KEY_MANAGER_ID).status(context)`                               | reader                    | `-> StatusResponse(active_version, rotating)`; poll to confirm a rotation finished (`active_version` reached and `rotating` is false)                                    |

Imports:

```python
from rbt.std.ciphertext.v1.ciphertext_rbt import Ciphertext, KeyManager
from rbt.std.ciphertext.v1.ciphertext_pb2 import (
    DecryptionFailed, ScopeShredded, UnknownRootKeyVersion,
)
from reboot.std.ciphertext.v1.ciphertext import (
    APP_SHARED_KEY_MANAGER_ID, ciphertext_library, make_associated_data,
)
```

### Encrypt

```python
ciphertext, _ = await Ciphertext.encrypt(
    context,
    plaintext=b"123-45-6789",
    associated_data=make_associated_data(user_id="42", purpose="ssn"),
    scope="user:42",                       # the crypto-shred unit
    key_manager_id=APP_SHARED_KEY_MANAGER_ID,
)
ciphertext_id = ciphertext.state_id   # store this to decrypt later
```

`key_manager_id` is **required**: pass `APP_SHARED_KEY_MANAGER_ID` for
the application-wide shared manager, or a dedicated id to partition keys
into an independent `KeyManager` (its own rotation loop, registry, and
shred domain) — two managers may use the same `scope` without sharing or
shredding each other's wrapping key.

### Decrypt

Supply the **same** `associated_data` used at encrypt time, and handle
the typed failures:

```python
try:
    response = await Ciphertext.ref(ciphertext_id).decrypt(
        context,
        associated_data=make_associated_data(user_id="42", purpose="ssn"),
    )
    plaintext = response.plaintext
except Ciphertext.DecryptAborted as aborted:
    if isinstance(aborted.error, ScopeShredded):
        ...   # permanently unrecoverable — the scope was shredded
    elif isinstance(aborted.error, DecryptionFailed):
        ...   # wrong associated_data, or the envelope is corrupt
    raise
```

### Crypto-shred a scope

```python
await KeyManager.ref(APP_SHARED_KEY_MANAGER_ID).shred(context, scope="user:42")
```

Every `Ciphertext` in that scope is now permanently undecryptable —
even with full database and root-key access — and decrypting one raises
`DecryptAborted(ScopeShredded())`. You do **not** need to touch (or even
enumerate) the ciphertexts. This is the right-to-erasure primitive: key
your scope on the entity you may need to forget (e.g. the user id), and
one `shred` erases all their data.

### `associated_data` (encryption context)

`associated_data` is authenticated but **not stored**, so the identical
bytes must be supplied to decrypt — it binds a ciphertext to its context
(a value sealed for `user_id=42` can't be decrypted as `user_id=99`).
Because it must match byte-for-byte, build it with `make_associated_data`
(a canonical, length-prefixed encoding) — never a hand-built string like
`b"user-42:ssn"` (ambiguous) or `json.dumps(...)` (non-canonical). Use
ASCII keys and string values; the Python and TypeScript helpers produce
identical bytes.

### Rotation is automatic

Operators rotate by editing `REBOOT_CRYPTO_ROOT_KEYS` (newest-first,
e.g. `v2:NEW,v1:OLD`) and restarting; the `KeyManager`'s `Watch` loop
re-wraps every wrapping key onto the new version in the background. Poll
`KeyManager.ref(APP_SHARED_KEY_MANAGER_ID).status(context)` until
`active_version` reaches the new version and `rotating` is false, then
the old one can be dropped (`REBOOT_CRYPTO_ROOT_KEYS="v2:NEW"`). The underlying facility — and how
to build your _own_ key-deriving library with rotation — is in
`crypto-root-keys.md`. `REBOOT_CRYPTO_ROOT_KEYS` is auto-provisioned by
`rbt dev` and Reboot Cloud (`lifecycle-secrets.md`).

### Don't

- **Don't forget `ordered_map_library()`** — `Ciphertext` needs it.
- **Don't reconstruct `associated_data` by hand** — use
  `make_associated_data`, and pass the exact same fields at decrypt.
- **Don't address `WrappingKey` directly** — it's an implementation
  detail; shred via `KeyManager.shred(scope=...)`.
- **Don't expose these methods to untrusted callers** — they default to
  app-internal; add an explicit authorizer if you must (`auth-allow-if.md`).
- **Don't lose the `Ciphertext` id** — store the returned `state_id`;
  it's how you decrypt later.
