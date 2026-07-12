---
title: Capturing the Identity Provider's Tokens with `store_tokens=True`
impact: HIGH
impactDescription: The `store_tokens=True` capture path is opt-in and easy to get subtly wrong — the wrong scope, a missing library, or the real provider absent in `dev=` all fail at runtime, not startup.
tags: auth, oauth, scopes, tokens, store_tokens, ciphertext, google, github, auth0, workflow, api, external
---

## Capturing the Identity Provider's Tokens with `store_tokens=True`

Your app can act **as the user** at an external service — read their
Google Calendar, open GitHub issues, post to their Slack. It always has
two halves: **capture** the service's OAuth tokens once (stored encrypted
in an `OAuthTokenManager`), then **use** them by reading them back and
calling the API **inside a `Workflow`**. This reference covers only the
chat-app shortcut for the capture half.

The full, host-agnostic recipe — capturing tokens via your own OAuth
endpoints, the read-back, the in-`Workflow` call, refresh tokens, and
token erasure — lives in the python skill:
[`python/references/auth-external-api-calls.md`](../../python/references/auth-external-api-calls.md).
**Read that for everything except the one shortcut below.**

## The chat-app shortcut: `store_tokens=True`

When the API you want belongs to the **identity provider** in
`Application(oauth=...)` (`Google` / `GitHub` / `Auth0`), the OAuth
server captures its tokens for you — no endpoints to write. The same
shortcut works for web apps: every surface that signs in through
`oauth=` captures tokens at the same `/__/oauth/callback` exchange.

`scopes=` is the **extra** OAuth scopes to request on top of the base
identity scope the provider always asks for — list only the additional
permissions your API calls need. `store_tokens=True` tells the OAuth
server to capture the access/refresh tokens at the code exchange and
persist them encrypted.

```python
import os
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Google,
    OAuthProviderByEnvironment,
)
from reboot.std.ciphertext.v1.ciphertext import ciphertext_library
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
from reboot.std.oauth.v1.oauth import oauth_library
from servicers.calendar import UserServicer

# Read/write the user's calendar *events* (narrower than the full
# `calendar` scope). Request the least you need.
_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"


def _google() -> Google:
    return Google(
        client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"),
        # Ask for Calendar access on top of the base `openid` scope.
        scopes=[_CALENDAR_SCOPE],
        # Capture + persist the Google tokens so the app can call the
        # Calendar API. Requires the `oauth` library (below).
        store_tokens=True,
    )


async def main() -> None:
    application = Application(
        servicers=[UserServicer],
        # `store_tokens=True` persists tokens via the `oauth` library,
        # which encrypts them via `ciphertext`, which in turn needs
        # `ordered_map`. Without all three the app fails fast at startup.
        libraries=[oauth_library(), ciphertext_library(),
                   ordered_map_library()],
        oauth=OAuthProviderByEnvironment(
            # The calendar needs a real provider token even in local dev
            # (`Development()` issues none), so both arms are `Google`.
            dev=_google(),
            prod=_google(),
        ),
    )
    await application.run()
```

**Two setup requirements that fail at startup if missing:**

- **The `oauth` + `ciphertext` + `ordered_map` libraries** (as above) —
  omitting any makes the app fail fast.
- **`REBOOT_CRYPTO_ROOT_KEYS`** backs the encryption. It's
  **auto-provisioned under `rbt dev run`**, so local dev needs no setup;
  in production it's part of your deploy. See
  `python/references/stdlib-ciphertext.md`.

**`Development()` issues no tokens.** It's a fake account picker with no
real provider behind it, so `fetch(...)` reports nothing stored under it.
If a feature genuinely needs the provider's API, use the real provider in
the `dev=` arm too (as above) — you'll need real credentials in dev then.

## Reboot stores only the provider's _own_ tokens

`store_tokens=True` captures the tokens of the identity provider itself
— nothing upstream of it. This matters most with `Auth0`: it's a broker,
so when a user signs in "with Google" through Auth0, what Reboot stores
(under the tenant-domain service id) is an **Auth0** access/refresh
token, which authorizes Auth0's own APIs — **not** a Google token, and
it will not work against the Google Calendar API. To call the upstream
service you have two options:

- **Ask Auth0 for the upstream token.** Auth0 keeps the federated IdP's
  access token on the user's profile; retrieve it via Auth0's Management
  API (`GET /api/v2/users/{sub}`, which requires a Management API token
  with the `read:user_idp_tokens` scope), using the stored Auth0 tokens
  to identify the user. Follow Auth0's "Call an Identity Provider API"
  docs for the exact setup (token expiry caveats apply).
- **Get the token yourself.** Run the upstream service's own OAuth flow
  with your own endpoints (Path B in
  [`python/references/auth-external-api-calls.md`](../../python/references/auth-external-api-calls.md))
  and store what it issues in that service's `OAuthTokenManager` — or,
  if Google's API is the whole point of the app, sign users in with
  `Google(...)` directly instead of brokering through Auth0.

## Then: read back and call the API

Once captured, reading the tokens with `OAuthTokenManager.fetch` and
making the call **inside a `Workflow`** is identical to the custom path,
and is documented once in
[`python/references/auth-external-api-calls.md`](../../python/references/auth-external-api-calls.md)
("Using tokens — inside a `Workflow`"), along with refresh-token behavior
and token erasure. For a service that is **not** your identity provider
(e.g. sign in with Google, call Slack), there is no `store_tokens=True`
shortcut — use the custom-endpoint Path B in that same recipe.
