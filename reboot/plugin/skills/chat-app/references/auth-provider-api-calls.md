---
title: Calling the OAuth Provider's API on the User's Behalf
impact: HIGH
impactDescription: Token capture is opt-in and easy to get subtly wrong — the wrong scope, the missing library, or an external call outside a Workflow all fail at runtime, not at startup
tags: auth, oauth, scopes, tokens, store_tokens, ciphertext, google, github, auth0, workflow, api
---

## Calling the OAuth Provider's API on the User's Behalf

Identity is the default job of `Application(oauth=...)`: the provider
tells you _who_ the caller is (`context.auth.user_id`). But `Google`,
`GitHub`, and `Auth0` are full OAuth providers, so the same sign-in can
also grant your app **delegated access** to the user's data at that
provider — their Google Calendar, their GitHub repos, their Auth0-brokered
APIs — and let the app call those APIs **as the user**, even in a
background workflow long after they've left.

This is **opt-in** and orthogonal to _which_ provider you chose
(`auth-oauth-providers.md`). It has three moving parts:

1. **Request the scopes** that authorize the API you want to call
   (`scopes=[...]`).
2. **Capture and persist the provider's tokens** during sign-in
   (`store_tokens=True`), which Reboot encrypts at rest.
3. **Read the tokens back at call time** with `oauth_tokens(...)` and
   make the outbound HTTP call **inside a `Workflow`**.

The snippets below show the pattern end to end, using a Chat App that
lists and edits the signed-in user's Google Calendar as the running
example.

## 1. Scopes and `store_tokens=True` in `main.py`

Both options live on the provider constructor (`Google` / `GitHub` /
`Auth0`). `scopes=` is the **extra** OAuth scopes to request on top of
the base identity scope the provider always asks for (e.g. `openid` for
Google/Auth0, `read:user` for GitHub) — list only the additional
permissions your API calls need. `store_tokens=True` tells the OAuth
server to capture the provider's access/refresh tokens at the code
exchange and persist them encrypted.

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
        # Calendar API. Requires the `ciphertext` library (below).
        store_tokens=True,
    )


async def main() -> None:
    application = Application(
        servicers=[UserServicer],
        # `store_tokens=True` encrypts tokens via `ciphertext`, which in
        # turn needs `ordered_map`. Without these the app fails fast at
        # startup.
        libraries=[ciphertext_library(), ordered_map_library()],
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

- **The `ciphertext` + `ordered_map` libraries.** The token store
  encrypts each user's tokens with the `Ciphertext` stdlib type and
  keeps a `user_id → ciphertext` pointer in an `OrderedMap`. Register
  **both** `libraries=[ciphertext_library(), ordered_map_library()]`;
  omitting them makes the app fail fast.
- **`REBOOT_CRYPTO_ROOT_KEYS`** backs the encryption. It's
  **auto-provisioned under `rbt dev run`**, so local dev needs no setup.
  In production it's part of your deploy; see
  `python/references/stdlib-ciphertext.md` and
  `python/references/crypto-root-keys.md`.

**`Development()` issues no tokens.** It's a fake account picker with no
real provider behind it, so `oauth_tokens(...)` returns `None` under it.
If a feature genuinely needs the provider's API, use the real provider in
the `dev=` arm too (as above) so you can exercise it locally — you'll
need real credentials in dev then.

## 2. Reading tokens and calling the API — inside a `Workflow`

At call time, read the signed-in user's tokens with `oauth_tokens`:

```python
from reboot.aio.auth.oauth_token_store import oauth_tokens
```

```python
tokens = await oauth_tokens(context, context.state_id)
```

It returns `Optional[IdpTokens]` (from
`reboot.aio.auth.oauth_providers`):

| Field           | Type            | Meaning                                                    |
| --------------- | --------------- | ---------------------------------------------------------- |
| `access_token`  | `str`           | Bearer token for the provider's API.                       |
| `refresh_token` | `Optional[str]` | Present only when the provider issued one (see below).     |
| `expires_at`    | `Optional[int]` | Absolute expiry, epoch seconds, or `None` if not reported. |
| `scopes`        | `list[str]`     | The scopes the provider actually granted.                  |

`None` means **no tokens are stored for this user** — they haven't
signed in with this provider yet, signed in _before_ you added
`store_tokens=True` / a new scope, or had their tokens crypto-shredded.
Always handle it: surface a "connect / re-authenticate" message rather
than crashing.

> **The outbound HTTP call MUST go in a `Workflow`.** This is the
> framework-wide "external calls only in Workflows" rule
> (`python/references/workflow-method.md`): a `Reader` / `Writer` /
> `Transaction` re-executes under retries and effect validation, which
> would re-issue the API call. Wrap the call in the durability
> primitive that fits — usually `at_least_once(...)`, or
> `at_most_once(...)` when a duplicate call is itself the failure mode —
> inside a `WorkflowContext` (see
> `python/references/workflow-method.md` for the decision table). A
> `WorkflowContext` is also app-internal,
> which the `OrderedMap` / `Ciphertext` servicers backing the token
> store require — so reading tokens and calling the API belong in the
> same workflow. Use **`context.state_id`** as the `user_id` argument,
> **not `context.auth`**: a `Workflow` is a `@classmethod` typically
> reached via a scheduled or app-internal call, so `context.auth` isn't
> reliably populated there. `context.state_id` always resolves to the
> actor the method runs on, and for a `User`-type servicer keyed by user
> ID (the `state_id_is_user_id` pattern) that _is_ the signed-in user's
> ID.

```python
class UserServicer(User.Servicer):

    @classmethod
    async def create_event(
        cls,
        context: WorkflowContext,
        request: User.CreateEventRequest,
    ) -> CreateEventResponse:
        tokens = await oauth_tokens(context, context.state_id)
        if tokens is None:
            # Not connected (or scope not yet granted): tell the user,
            # don't crash.
            return CreateEventResponse(ok=False, message=_CONNECT_MESSAGE)

        async def do_create() -> calendar_api.EventResult:
            # The actual external HTTP call to the provider's API, using
            # the user's access token as a bearer credential.
            return await calendar_api.create_event(
                access_token=tokens.access_token,
                summary=request.summary,
                start=request.start,
                end=request.end,
            )

        # External call in a Workflow → wrap in a durability primitive;
        # `at_least_once` here (this create is safe to retry).
        # `effect_validation=DISABLED` because the provider's API isn't
        # deterministic across the replay Reboot uses to validate
        # effects (it would re-issue the call).
        result = await at_least_once(
            "create:post",
            context,
            do_create,
            effect_validation=EffectValidation.DISABLED,
        )
        if result.error:
            return CreateEventResponse(
                ok=False,
                message=f"Provider error: {result.error}",
            )
        return CreateEventResponse(event=..., ok=True, message="")
```

The HTTP plumbing (`calendar_api.create_event`, etc.) is ordinary
`aiohttp` against the provider's REST API with
`Authorization: Bearer {access_token}` — keep it in a plain helper
module, separate from the servicer.

**UI shape that fits the Workflow rule.** Because the work is a
`Workflow` and a `Reader` subscription is what a React UI watches, the
common pattern is: a `Workflow` fetches from the provider and writes a
**snapshot** into the actor's own state; a `Reader` exposes that
snapshot for the UI to subscribe to; a `Writer` invoked from the UI
`schedule()`s the workflow (a `Writer` can't `await` a workflow) — e.g.
a `request_sync` Writer that schedules a `sync_events` Workflow whose
result a `cached_events` Reader exposes.

## 3. Refresh tokens differ per provider

Reboot **stores** whatever the token endpoint returns and **carries a
previously stored `refresh_token` forward** if a later sign-in omits it
— but it does **not** auto-refresh expired access tokens for you. If you
need long-lived background access, check `expires_at` and refresh via the
provider's token endpoint yourself. Whether you even _get_ a refresh
token is provider-specific:

- **Google** returns a `refresh_token` only on the **first** consent, and
  only because the provider sends `access_type=offline` automatically.
  Reboot carries that first refresh token forward across later sign-ins,
  so you don't have to force the consent screen every time.
- **Auth0** issues a `refresh_token` only when `offline_access` is
  requested; the `Auth0` provider adds that scope **automatically** when
  `store_tokens=True`, so you don't list it in `scopes=` yourself.
- **GitHub** depends on the _kind_ of credential, not anything you can
  request. A classic **OAuth App** never issues a refresh token (its
  access token simply doesn't expire). A **GitHub App** with "Expire user
  authorization tokens" enabled issues an expiring access token **and** a
  refresh token. To get refresh tokens from GitHub, register a GitHub App
  with that option on and use its credentials.

## 4. Erasing a user's tokens

Each user's tokens are encrypted under a dedicated per-user
crypto-shred scope (`oauth-idp-tokens:{user_id}`), separate from any
scope your app uses for its own ciphertexts. To erase a user's stored
provider tokens (e.g. as part of deleting the user), shred that scope;
`oauth_tokens(...)` then returns `None` for them. The scope mechanics are
in `python/references/stdlib-ciphertext.md`.

## Checklist

- [ ] `scopes=[...]` lists the extra permissions your API calls need
      (least privilege), on top of the provider's base identity scope.
- [ ] `store_tokens=True` on the provider.
- [ ] `libraries=[ciphertext_library(), ordered_map_library()]` on the
      `Application`.
- [ ] The real provider is in the `dev=` arm if the feature must work
      under `rbt dev run` (`Development()` issues no tokens).
- [ ] Every method that calls the provider's API is a `Workflow`, with
      the call wrapped in a durability primitive (`at_least_once` /
      `at_most_once`).
- [ ] `oauth_tokens(context, context.state_id) is None` is handled with a
      "connect / re-authenticate" path, not a crash.
