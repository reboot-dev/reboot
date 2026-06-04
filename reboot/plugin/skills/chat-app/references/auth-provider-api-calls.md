---
title: Calling External-Service APIs on the User's Behalf
impact: HIGH
impactDescription: Token capture is opt-in and easy to get subtly wrong — the wrong scope, a missing library, storing from a non-app-internal context, or an external call outside a Workflow all fail at runtime, not at startup
tags: auth, oauth, scopes, tokens, store_tokens, ciphertext, google, github, auth0, workflow, api, external, slack
---

## Calling External-Service APIs on the User's Behalf

Identity is the default job of `Application(oauth=...)`: the provider
tells you _who_ the caller is (`context.auth.user_id`). But the same OAuth
machinery can also let your app act **as the user** at an external
service — read their Google Calendar, open issues in their GitHub repos,
post to their Slack — even in a background workflow long after they've
left. There are **two** ways to get there, and which one you use depends
only on _whose_ API you want to call:

- **Part A — your identity provider's own API.** If the API belongs to the
  provider you already sign in with (`Google`, `GitHub`, `Auth0`), Reboot
  captures and stores its tokens for you. You add `scopes=[...]` and
  `store_tokens=True` and write no endpoints.
- **Part B — any other external service.** If the service is _not_ your
  identity provider (you sign in with Google but want the user's Slack or
  Notion), the `oauth=` provider can't grant its tokens — a Google grant
  only authorizes Google's APIs. You run that service's OAuth flow
  yourself: your own endpoints, your own `store` call.

Both paths converge on the **same storage and read-back machinery**: the
tokens land in an `OAuthTokenManager` (one per external service,
app-internal), and you read them back and call the API identically — see
[Reading tokens and calling the API](#reading-tokens-and-calling-the-api--inside-a-workflow).
Only how the tokens are _captured_ differs. Both also need the same three
libraries (`oauth_library()` + `ciphertext_library()` +
`ordered_map_library()`) on the `Application`, or it fails fast at startup.

The Part A snippets use a Chat App that lists and edits the signed-in
user's Google Calendar; Part B uses storing a user's Slack tokens.

## Part A — Your identity provider's own API (built in)

When the API you want belongs to the provider in `Application(oauth=...)`,
the OAuth server does the capture for you. Two options live on the provider
constructor (`Google` / `GitHub` / `Auth0`). `scopes=` is the **extra**
OAuth scopes to request on top of the base identity scope the provider
always asks for (e.g. `openid` for Google/Auth0, `read:user` for GitHub) —
list only the additional permissions your API calls need.
`store_tokens=True` tells the OAuth server to capture the provider's
access/refresh tokens at the code exchange and persist them encrypted.

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

- **The `oauth` + `ciphertext` + `ordered_map` libraries.** The token
  store keeps each external service's tokens in an `OAuthTokenManager`
  (one per service, addressed by `GOOGLE` / `GITHUB` / …), encrypts each
  user's tokens with the `Ciphertext` stdlib type, and keeps a
  `user_id → ciphertext` pointer in an `OrderedMap`. Register **all
  three** `libraries=[oauth_library(), ciphertext_library(), ordered_map_library()]`; omitting any makes the app fail fast.
- **`REBOOT_CRYPTO_ROOT_KEYS`** backs the encryption. It's
  **auto-provisioned under `rbt dev run`**, so local dev needs no setup.
  In production it's part of your deploy; see
  `python/references/stdlib-ciphertext.md` and
  `python/references/crypto-root-keys.md`.

**`Development()` issues no tokens.** It's a fake account picker with no
real provider behind it, so `fetch(...)` reports nothing stored under it.
If a feature genuinely needs the provider's API, use the real provider in
the `dev=` arm too (as above) so you can exercise it locally — you'll
need real credentials in dev then.

## Part B — Any other external service (you wire it up)

When the service you want to call is **not** the one in
`Application(oauth=...)` — sign in with Google, but call the user's
Slack — there's no `store_tokens=True` shortcut: that flag only captures
the identity provider's own tokens. You run the other service's OAuth flow
yourself and store its tokens in an `OAuthTokenManager` of your own. Once
they're stored, reading them back and calling the API is **identical** to
Part A.

### 1. Add your own OAuth endpoints

Register an authorize redirect and a callback as HTTP routes on the
`Application` (the Reboot `Application` exposes the web framework as
`.http`). The callback must opt in to an **app-internal** context with
`app_internal=True`, because the `OAuthTokenManager` you'll `store` into is
app-internal-only — an ordinary external context can't call it:

```python
# In `main()`, after constructing `application`:
application.http.get("/__/oauth/slack/authorize")(slack_authorize)
application.http.get("/__/oauth/slack/callback", app_internal=True)(
    slack_callback
)
```

> **DANGER — `app_internal=True` bypasses authorizers.** An app-internal
> context can make trusted in-app calls on behalf of _any_ caller, with no
> end-user auth. Only set it on a route you are completely certain serves
> trusted traffic — here, a callback that runs only _after_ you've
> validated the OAuth `state` you issued and exchanged the authorization
> code. **Never** set it on a route that acts on unvalidated request input,
> and never use it as a shortcut around proper end-user auth.

The authorize route (no app-internal context needed) builds the service's
`/authorize` URL — your `client_id`, the `scopes` you need, your
`/__/oauth/slack/callback` as `redirect_uri`, and an **HMAC-signed
`state`** that carries the signed-in `user_id` so the callback can tie the
tokens to the right user — and redirects the browser there.

### 2. Exchange the code and `store` the tokens

In the callback — which now runs with an app-internal context — verify the
`state`, exchange the `code` at the service's token endpoint, assemble an
`OAuthTokens`, and store it under a service id of your choosing:

```python
from reboot.aio.http import external_context
from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager, OAuthTokens
from starlette.responses import RedirectResponse

# Pick a stable state id naming this external service. Any string works —
# the well-known `GOOGLE` / `GITHUB` constants are just `"google.com"` /
# `"github.com"` — so use the service's domain.
SLACK = "slack.com"


async def slack_callback(request: Request):
    # ... verify the signed `state`, recover `user_id` from it, and
    # exchange `request.query_params["code"]` at Slack's token endpoint
    # (ordinary `httpx`/`aiohttp`), yielding the fields below ...
    tokens = OAuthTokens(
        access_token=access_token,
        refresh_token=refresh_token,  # omit if the service issues none
        expires_at=expires_at,        # epoch seconds, if the service reports it
        scopes=granted_scopes,
    )
    # `external_context(request)` is app-internal here *because* the route
    # opted in with `app_internal=True`; that's what lets it call the
    # app-internal-only `OAuthTokenManager`.
    context = external_context(request)
    await OAuthTokenManager.ref(SLACK).store(
        context,
        user_id=user_id,
        tokens=tokens,
    )
    return RedirectResponse("/")  # back into your app's UI.
```

`store` **replaces** any previously stored tokens for that `user_id`
wholesale. If the service issues a refresh token only on first consent and
you need to carry it forward, `fetch` the existing tokens first and merge
(you can't read and write the same manager in one transaction — `store`
already writes it — so do the `fetch` as a separate call before `store`,
exactly as Reboot's own server does for Part A).

That's the only difference from Part A: _you_ run the flow and call
`store`. Everything downstream is the same.

## Reading tokens and calling the API — inside a `Workflow`

This half is identical whether the tokens came from Part A or Part B. At
call time, read the signed-in user's tokens with `OAuthTokenManager.fetch`,
addressing the manager by the service whose tokens you stored (`GOOGLE` /
`GITHUB` for the well-known services, or your own id such as `SLACK`):

```python
from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager
from reboot.std.oauth.v1.oauth import GOOGLE
```

```python
response = await OAuthTokenManager.ref(GOOGLE).fetch(
    context, user_id=context.state_id
)
```

It returns a `FetchResponse` with `found: bool` and `tokens: OAuthTokens`
(meaningful only when `found`):

| Field           | Type           | Meaning                                                |
| --------------- | -------------- | ------------------------------------------------------ |
| `access_token`  | `str`          | Bearer token for the service's API.                    |
| `refresh_token` | `optional str` | Present only when the service issued one (see below).  |
| `expires_at`    | `optional int` | Absolute expiry, epoch seconds; unset if not reported. |
| `scopes`        | `list[str]`    | The scopes the service actually granted.               |

`found=False` means **no tokens are stored for this user** — they signed
in / connected _before_ you added `store_tokens=True` (or, for Part B,
before they ran your link flow) or had their tokens crypto-shredded. And
if **no one** has ever stored tokens for this service yet, the manager is
unconstructed and `fetch` aborts with `OAuthTokenManager.FetchAborted` (a
`StateNotConstructed` error) — treat that the same as "not connected".
Always handle both: surface a "connect / re-authenticate" message rather
than crashing.

> **The outbound HTTP call MUST go in a `Workflow`.** This is the
> framework-wide "external calls only in Workflows" rule
> (`python/references/workflow-method.md`): a `Reader` / `Writer` /
> `Transaction` re-executes under retries and effect validation, which
> would re-issue the API call. Wrap the call in the durability primitive
> that fits — usually `at_least_once(...)`, or `at_most_once(...)` when a
> duplicate call is itself the failure mode — inside a `WorkflowContext`
> (see `python/references/workflow-method.md` for the decision table). A
> `WorkflowContext` is also app-internal, which the `OAuthTokenManager` /
> `Ciphertext` / `OrderedMap` servicers backing the token store require —
> so reading tokens and calling the API belong in the same workflow. Use
> **`context.state_id`** as the `user_id` argument, **not `context.auth`**:
> a `Workflow` is a `@classmethod` typically reached via a scheduled or
> app-internal call, so `context.auth` isn't reliably populated there.
> `context.state_id` always resolves to the actor the method runs on, and
> for a `User`-type servicer keyed by user ID (the `state_id_is_user_id`
> pattern) that _is_ the signed-in user's ID.

```python
class UserServicer(User.Servicer):

    @classmethod
    async def create_event(
        cls,
        context: WorkflowContext,
        request: User.CreateEventRequest,
    ) -> CreateEventResponse:
        try:
            stored = await OAuthTokenManager.ref(GOOGLE).fetch(
                context, user_id=context.state_id
            )
        except OAuthTokenManager.FetchAborted:
            # No one has connected this service yet (the manager is
            # constructed lazily by the first store).
            return CreateEventResponse(ok=False, message=_CONNECT_MESSAGE)
        if not stored.found:
            # Not connected (or scope not yet granted): tell the user,
            # don't crash.
            return CreateEventResponse(ok=False, message=_CONNECT_MESSAGE)
        tokens = stored.tokens

        async def do_create() -> calendar_api.EventResult:
            # The actual external HTTP call to the service's API, using
            # the user's access token as a bearer credential.
            return await calendar_api.create_event(
                access_token=tokens.access_token,
                summary=request.summary,
                start=request.start,
                end=request.end,
            )

        # External call in a Workflow → wrap in a durability primitive;
        # `at_least_once` here (this create is safe to retry).
        # `effect_validation=DISABLED` because the service's API isn't
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
`aiohttp` against the service's REST API with
`Authorization: Bearer {access_token}` — keep it in a plain helper
module, separate from the servicer.

**UI shape that fits the Workflow rule.** Because the work is a
`Workflow` and a `Reader` subscription is what a React UI watches, the
common pattern is: a `Workflow` fetches from the service and writes a
**snapshot** into the actor's own state; a `Reader` exposes that
snapshot for the UI to subscribe to; a `Writer` invoked from the UI
`schedule()`s the workflow (a `Writer` can't `await` a workflow) — e.g.
a `request_sync` Writer that schedules a `sync_events` Workflow whose
result a `cached_events` Reader exposes.

## Refresh tokens

Reboot **stores** whatever the token endpoint returns and, for Part A,
**carries a previously stored `refresh_token` forward** if a later sign-in
omits it. It does **not** auto-refresh expired access tokens for you,
either path: if you need long-lived background access, check `expires_at`
and refresh via the service's token endpoint yourself. For Part B you also
own the carry-forward merge (see the `store` note above). Whether you even
_get_ a refresh token is service-specific; for the built-in providers:

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

## Erasing a user's tokens

Each service's tokens live under their own dedicated `KeyManager`, and
each user's tokens are encrypted under a per-user crypto-shred scope (the
`user_id`) within it — separate from any scope your app uses for its own
ciphertexts. To erase a user's stored tokens for a service (e.g. as part
of deleting the user), shred that scope in the service's manager:

```python
from rbt.std.ciphertext.v1.ciphertext_rbt import KeyManager
from reboot.std.oauth.v1.oauth import GOOGLE, _key_manager_id

await KeyManager.ref(_key_manager_id(GOOGLE)).shred(
    context, scope=user_id
)
```

`fetch(...)` then reports `found=False` for them. The scope mechanics are
in `python/references/stdlib-ciphertext.md`.

## Checklist

- [ ] `libraries=[oauth_library(), ciphertext_library(), ordered_map_library()]` on the `Application` (needed for **both**
      paths).
- [ ] **Part A** (the identity provider's own API): `scopes=[...]` lists
      the extra permissions your API calls need (least privilege), and
      `store_tokens=True` is set on the provider. The real provider is in
      the `dev=` arm if the feature must work under `rbt dev run`
      (`Development()` issues no tokens).
- [ ] **Part B** (another service): your own authorize + callback routes,
      the callback registered with `app_internal=True`, the OAuth `state`
      HMAC-signed and verified, and `OAuthTokenManager.ref("<service>") .store(...)` called with the app-internal `external_context(request)`.
- [ ] Every method that calls the service's API is a `Workflow`, with the
      call wrapped in a durability primitive (`at_least_once` /
      `at_most_once`).
- [ ] A `fetch` reporting `found=False` (and an
      `OAuthTokenManager.FetchAborted` before anyone has connected) is
      handled with a "connect / re-authenticate" path, not a crash.
