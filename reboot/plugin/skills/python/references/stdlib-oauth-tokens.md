---
title: Store Provider OAuth Tokens in `OAuthTokenManager`, Not Hand-Rolled `Ciphertext`
impact: HIGH
impactDescription: OAuth access/refresh tokens are secrets at rest; the stdlib manager encrypts, indexes, and crypto-shreds them per user for you — a plain `str` field leaks them, and hand-rolling `Ciphertext` re-implements what already exists.
tags: stdlib, oauth, tokens, access-token, refresh-token, store-tokens, ciphertext, encryption, crypto-shred, google, github, secret
---

## Store Provider OAuth Tokens in `OAuthTokenManager`

> **Critical:** never store an external provider's OAuth access/refresh
> token in a plain `str` state field — that is a secret in plaintext at
> rest. And don't hand-roll `Ciphertext` for it either: the
> `OAuthTokenManager` stdlib type already wraps `Ciphertext` plus the
> pointer index, per-service key manager, and per-user crypto-shred
> scope. For non-OAuth secrets/PII, use `Ciphertext` directly
> (`stdlib-ciphertext.md`); for OAuth provider tokens, use this.

`OAuthTokenManager`
(`reboot.std.oauth.v1.oauth` / `rbt.std.oauth.v1.oauth_rbt`) holds the
OAuth tokens for **one** external third-party service (Google, GitHub,
…), keyed by `user_id`. It is addressed by a state id naming the service
(use the `GOOGLE` / `GITHUB` constants, or any string for a service
without a predefined one). Each manager encrypts under its own dedicated
`KeyManager`, and each user's tokens are scoped to their `user_id`, so a
single user's tokens can be crypto-shredded (right-to-erasure) without
touching anyone else's.

The methods are **app-internal by default** (no authorizer) — call them
from your own backend with an app-internal context, never from an
untrusted client.

### Register the libraries

`OAuthTokenManager` builds on `Ciphertext` (which builds on
`OrderedMap`), so all three libraries must be mounted — omitting any
makes the app fail fast at boot:

```python
from reboot.std.oauth.v1.oauth import oauth_library
from reboot.std.ciphertext.v1.ciphertext import ciphertext_library
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)


async def main():
    await Application(
        servicers=[...],
        libraries=[
            oauth_library(), ciphertext_library(), ordered_map_library(),
        ],
    ).run()
```

### The easy path: `store_tokens=True`

If the tokens you want are the **identity provider's own** (the provider
the user logs in with) **and** you're a chat app using
`Application(oauth=...)`, don't store anything yourself. Configure the
`OAuthProvider` with `store_tokens=True` and the OAuth server captures
the access/refresh tokens during the code exchange and persists them
encrypted under the matching `OAuthTokenManager` automatically. Your code
only ever `fetch`es. The end-to-end recipe — this easy path, the custom
endpoints for any other service, and the in-`Workflow` call — is
`auth-external-api-calls.md`.

### Imports

```python
from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager, OAuthTokens
from reboot.std.oauth.v1.oauth import GOOGLE, GITHUB, oauth_library
```

### `OAuthTokens`

| Field           | Type             | Notes                                             |
| --------------- | ---------------- | ------------------------------------------------- |
| `access_token`  | `str`            | Bearer token for the provider's API.              |
| `refresh_token` | optional `str`   | Unset (`HasField` false) if none was issued.      |
| `expires_at`    | optional `int64` | Absolute expiry, epoch seconds; unset if unknown. |
| `scopes`        | repeated `str`   | Scopes the provider actually granted.             |

### Fetch (reader)

```python
response = await OAuthTokenManager.ref(GOOGLE).fetch(
    context, user_id=user_id,
)
if response.found:
    access_token = response.tokens.access_token
```

`found` is false when nothing is stored for the user, or once their
tokens have been crypto-shredded.

### Store (transaction)

You call `store` yourself when you capture tokens from a service
**other** than a chat-app login provider — i.e. you run that service's
OAuth flow via your own HTTP endpoints (the only path in a web app).
**Store with `OAuthTokenManager`, never hand-rolled `Ciphertext` or a
`str` field** — it is the same secret-at-rest problem, already solved
(the manager encrypts, indexes by `user_id`, and gives you per-user
crypto-shred scope).

```python
await OAuthTokenManager.ref("slack.com").store(
    context,                  # must be app-internal (e.g. from an
    user_id=user_id,          # `app_internal=True` callback route).
    tokens=OAuthTokens(
        access_token=access_token,
        refresh_token=refresh_token,  # omit if none.
        scopes=granted_scopes,
    ),
)
```

`store` replaces any previously stored tokens for the user, but carries a
prior `refresh_token` forward if the new `tokens` leaves it unset (some
providers issue a refresh token only on first consent). The full
end-to-end recipe — the authorize/callback endpoints, the HMAC-signed
`state`, the `app_internal=True` danger note, and the in-`Workflow`
read-and-call — is in `auth-external-api-calls.md`.

### Don't

- **Don't put tokens in a `str` field** — plaintext at rest.
- **Don't hand-roll `Ciphertext`** for provider OAuth tokens — this type
  already does the encryption, indexing, and per-user shred scope.
- **Don't forget any of the three libraries** — `oauth_library()`,
  `ciphertext_library()`, `ordered_map_library()`.
- **Don't expose these methods to untrusted callers** — they default to
  app-internal.
