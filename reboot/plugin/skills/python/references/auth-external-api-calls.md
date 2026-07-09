---
title: Calling External-Service APIs on the User's Behalf
impact: HIGH
impactDescription: Token capture is opt-in and easy to get subtly wrong — the wrong scope, a missing library, storing from a non-app-internal context, or an external call outside a Workflow all fail at runtime, not at startup. This is the host-agnostic recipe shared by chat apps and web apps.
tags: auth, oauth, tokens, store_tokens, oauth-token-manager, ciphertext, workflow, external, api, api-key, custom-endpoint, on-behalf, refresh-token, crypto-shred
---

## Calling External-Service APIs on the User's Behalf

Beyond telling you _who_ the caller is, OAuth can let your app act **as
the user** at an external service — read their Google Calendar, open
GitHub issues, post to their Slack — even in a background workflow long
after they've left. This recipe is **the same for chat apps and web
apps**; only how you _capture_ the tokens differs slightly by host (see
"Capturing tokens" below). Two halves, always:

1. **Capture** the service's OAuth tokens once and store them encrypted
   in an `OAuthTokenManager` (one per external service, app-internal).
2. **Use** them: read them back with `fetch` and make the outbound API
   call **inside a `Workflow`**.

The storage and use halves are identical regardless of how the tokens
were captured. The `OAuthTokenManager` type itself — its `store` /
`fetch` surface and the `OAuthTokens` fields — is documented in
`stdlib-oauth-tokens.md`; this file is the end-to-end flow. (A service
that doesn't expose OAuth at all — the user pastes an **API key**
instead — skips the manager: Path C below stores the key with
`Ciphertext`; the in-`Workflow` call rule still applies.)

### Libraries (required for the OAuth capture paths A and B)

The token store needs all three libraries on the `Application`, or it
fails fast at startup:

```python
from reboot.std.oauth.v1.oauth import oauth_library
from reboot.std.ciphertext.v1.ciphertext import ciphertext_library
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)

# libraries=[oauth_library(), ciphertext_library(), ordered_map_library()]
```

`REBOOT_CRYPTO_ROOT_KEYS` backs the encryption; it is auto-provisioned
under `rbt dev run` (and on Reboot Cloud), so local dev needs no setup.

## Capturing tokens

### Path A — the built-in easy path

If the API belongs to the **identity provider you already sign in with**
via `Application(oauth=...)` (`Google` / `GitHub` / `Auth0`), the OAuth
server can capture its tokens for you: add the extra `scopes=[...]` your
calls need and `store_tokens=True` on the provider — no endpoints to
write. This works on every surface that signs in through `oauth=` —
MCP chat apps and web apps alike. It captures the identity provider's **own**
tokens only: with `Auth0` you get an Auth0 token, not the upstream
Google/GitHub token a brokered sign-in went through — to call the
upstream API, ask Auth0 for the federated IdP token or use Path B. The
provider-config details (per-provider scopes, `Development()` issues no
tokens, the Auth0-broker caveat, etc.) are in the chat-app skill's
`auth-store-tokens.md`.

### Path B — your own OAuth flow (any other service)

For **any other external service** (you sign in with Google but want the
user's Slack or Notion), the `oauth=`
slot can't grant it — you run that service's OAuth flow yourself with
your own HTTP endpoints and your own `store` call. This is the
host-agnostic path; the rest of this section is it.

Register an authorize redirect and a callback as HTTP routes on the
`Application` (it exposes the web framework as `.http`). The callback
must opt into an **app-internal** context with `app_internal=True`,
because `OAuthTokenManager` is app-internal-only — an ordinary external
context can't call it:

```python
# In `main()`, after constructing `application`:
application.http.get("/__/oauth/slack/authorize")(slack_authorize)
application.http.get("/__/oauth/slack/callback", app_internal=True)(
    slack_callback
)
```

> **DANGER — `app_internal=True` bypasses authorizers.** An app-internal
> context makes trusted in-app calls on behalf of _any_ caller, with no
> end-user auth. Only set it on a route you are certain serves trusted
> traffic — here, a callback that runs _only after_ you've verified the
> OAuth `state` you issued and exchanged the code. **Never** set it on a
> route that acts on unvalidated request input.

The **authorize** route (no app-internal context needed) builds the
service's `/authorize` URL — your `client_id`, the `scopes` you need,
your callback as `redirect_uri`, and an **HMAC-signed `state`** carrying
the signed-in `user_id` so the callback can tie the tokens to the right
user — and redirects the browser there.

The **callback** route verifies the `state`, exchanges the `code` at the
service's token endpoint (ordinary `httpx` / `aiohttp`), assembles an
`OAuthTokens`, and stores it under a service id of your choosing — **use
`OAuthTokenManager`, never hand-rolled `Ciphertext` or a `str` field**:

```python
from reboot.aio.http import external_context
from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager, OAuthTokens
from starlette.responses import RedirectResponse

SLACK = "slack.com"  # any string; a state id naming the service.


async def slack_callback(request):
    # ... verify the signed `state`, recover `user_id`, and exchange
    # `request.query_params["code"]` at Slack's token endpoint, yielding
    # the fields below ...
    tokens = OAuthTokens(
        access_token=access_token,
        refresh_token=refresh_token,  # omit if the service issues none.
        expires_at=expires_at,        # epoch seconds, if reported.
        scopes=granted_scopes,
    )
    # `external_context(request)` is app-internal here *because* the
    # route opted in with `app_internal=True`; that's what lets it call
    # the app-internal-only `OAuthTokenManager`.
    context = external_context(request)
    await OAuthTokenManager.ref(SLACK).store(
        context, user_id=user_id, tokens=tokens,
    )
    return RedirectResponse("/")  # back into your app's UI.
```

`store` **replaces** the user's stored tokens wholesale, but carries a
prior `refresh_token` forward if the new `tokens` leaves it unset (some
services issue one only on first consent). You can't read and write the
same manager in one transaction, so if you need to merge, `fetch` first
in a separate call.

### Path C — the user provides an API key, not OAuth

Some services don't expose per-user OAuth at all — the user pastes an
API key, personal access token, or webhook secret into your UI instead.

> **Path C is only for keys the _user_ provides** so the app can act
> _as that user_ — a per-user secret, stored per user. Don't confuse it
> with service-to-service auth, where **you, the developer,** hold one
> key for the whole application (your Stripe secret key, your OpenAI
> key): that key is not per-user state and never goes in an actor —
> deliver it as an application secret via environment variables /
> `rbt cloud secret` (`lifecycle-secrets.md`).

`OAuthTokenManager` is purpose-built for OAuth tokens; don't shoehorn an
API key into it. The key is still a secret at rest, so the rule from
`state-scalar-fields.md` applies: **never a plain `str` field** — encrypt
it with the `Ciphertext` stdlib type and keep the returned `state_id` (a
harmless `str`) in your state as the reference to the encrypted value.
This path needs only `ciphertext_library()` + `ordered_map_library()`
(no `oauth_library()`).

**Capture** — a `Transaction` the UI calls with the raw key:

```python
from rbt.std.ciphertext.v1.ciphertext_rbt import Ciphertext
from reboot.std.ciphertext.v1.ciphertext import (
    APP_SHARED_KEY_MANAGER_ID, make_associated_data,
)


class UserServicer(User.Servicer):

    async def connect_acme(
        self,
        context: TransactionContext,
        request: User.ConnectAcmeRequest,
    ) -> User.ConnectAcmeResponse:
        user_id = self.ref().state_id
        ciphertext, _ = await Ciphertext.encrypt(
            context,
            plaintext=request.api_key.encode(),
            associated_data=make_associated_data(
                user_id=user_id, purpose="acme-api-key",
            ),
            scope=f"user:{user_id}",  # crypto-shred unit (erasure).
            key_manager_id=APP_SHARED_KEY_MANAGER_ID,
        )
        # The reference to the encrypted key; never the key itself.
        self.state.acme_api_key_id = ciphertext.state_id
        return User.ConnectAcmeResponse()
```

**Use** — the Workflow rule below applies identically: decrypt (with the
**same** `associated_data`) and make the outbound call inside a
`Workflow`, the call wrapped in `at_least_once` / `at_most_once`. An
empty `<service>_api_key_id` is this path's "not connected" signal.
**Erase** by shredding the user's scope —
`KeyManager.ref(APP_SHARED_KEY_MANAGER_ID).shred(context, scope=...)`.
The full `Ciphertext` surface (typed decrypt failures,
`associated_data` rules, rotation) is `stdlib-ciphertext.md`.

## Using tokens — inside a `Workflow`

This half is identical no matter how the tokens were captured. Read the
user's tokens with `OAuthTokenManager.fetch`, addressing the manager by
the service whose tokens you stored (`GOOGLE` / `GITHUB`, or your own id
such as `SLACK`):

```python
from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager
from reboot.std.oauth.v1.oauth import GOOGLE
```

> **The outbound HTTP call MUST go in a `Workflow`.** This is the
> framework-wide "external calls only in Workflows" rule
> (`servicer-workflow.md`): a `Reader` / `Writer` / `Transaction`
> re-executes under retries and effect validation, which would re-issue
> the API call. Wrap the call in the durability primitive that fits —
> usually `at_least_once(...)`, or `at_most_once(...)` when a duplicate
> call is itself the failure mode — inside a `WorkflowContext`. A
> `WorkflowContext` is also app-internal, which the token store's
> servicers require, so reading the tokens and calling the API belong in
> the same workflow. Use **`context.state_id`** as the `user_id`, **not
> `context.auth`**: a `Workflow` is a `@classmethod` typically reached
> via a scheduled or app-internal call, so `context.auth` isn't reliably
> populated; `context.state_id` always resolves to the actor the method
> runs on, which for a `User`-type servicer keyed by user id _is_ the
> signed-in user.

```python
class UserServicer(User.Servicer):

    @classmethod
    async def create_event(
        cls,
        context: WorkflowContext,
        request: User.CreateEventRequest,
    ) -> User.CreateEventResponse:
        try:
            stored = await OAuthTokenManager.ref(GOOGLE).fetch(
                context, user_id=context.state_id
            )
        except OAuthTokenManager.FetchAborted:
            # No one has connected this service yet (the manager is
            # constructed lazily by the first store).
            return User.CreateEventResponse(ok=False, message=_CONNECT)
        if not stored.found:
            # Not connected (or scope not yet granted): tell the user.
            return User.CreateEventResponse(ok=False, message=_CONNECT)
        tokens = stored.tokens

        async def do_create():
            # The actual external HTTP call, using the user's access
            # token as a bearer credential. Plain `httpx`/`aiohttp` in a
            # helper module, separate from the servicer.
            return await calendar_api.create_event(
                access_token=tokens.access_token, summary=request.summary,
            )

        # External call in a Workflow → wrap in a durability primitive;
        # `at_least_once` here (this create is safe to retry). See
        # `servicer-workflow.md` for the decision table and imports.
        result = await at_least_once("create:post", context, do_create)
        return User.CreateEventResponse(ok=True, event=...)
```

Always handle both "not connected" signals — `found=False` **and** the
`FetchAborted` (`StateNotConstructed`) you get before _anyone_ has ever
stored for this service — with a "connect / re-authenticate" path, not a
crash.

**UI shape that fits the Workflow rule.** A React UI subscribes to a
`Reader`, but the fetch-and-call is a `Workflow`. The common pattern: a
`Workflow` calls the service and writes a **snapshot** into the actor's
state; a `Reader` exposes that snapshot; a UI-invoked `Writer`
`schedule()`s the workflow (a `Writer` can't `await` one).

## Refresh tokens

Reboot **stores** whatever the token endpoint returns and carries a
previously stored `refresh_token` forward if a later capture omits it. It
does **not** auto-refresh expired access tokens — check `expires_at` and
refresh via the service's token endpoint yourself for long-lived
background access. Whether you even get a refresh token is
service-specific; for the built-in providers:

- **Google** returns one only on the **first** consent (it sends
  `access_type=offline` automatically); Reboot carries it forward.
- **Auth0** issues one only with `offline_access`, which the `Auth0`
  provider adds automatically when `store_tokens=True`.
- **GitHub** depends on the credential kind: a classic **OAuth App**
  never issues one (its token doesn't expire); a **GitHub App** with
  "Expire user authorization tokens" enabled issues both an expiring
  access token and a refresh token.

## Erasing a user's tokens

Each service's tokens live under their own dedicated `KeyManager`, with
each user's tokens encrypted under a per-user crypto-shred scope (the
`user_id`). To erase a user's stored tokens for a service (e.g. as part
of deleting the user), shred that scope in the service's manager:

```python
from rbt.std.ciphertext.v1.ciphertext_rbt import KeyManager
from reboot.std.oauth.v1.oauth import GOOGLE, _key_manager_id

await KeyManager.ref(_key_manager_id(GOOGLE)).shred(context, scope=user_id)
```

`fetch(...)` then reports `found=False`. The scope mechanics are in
`stdlib-ciphertext.md`.

## Checklist

- [ ] `libraries=[oauth_library(), ciphertext_library(), ordered_map_library()]` on the `Application` (Path C needs only the latter two).
- [ ] **Capture** — Path A (identity provider's own API):
      `scopes=[...]` (least privilege) + `store_tokens=True`. Path B
      (any other service): your own authorize + callback routes, callback registered `app_internal=True`, the
      OAuth `state` HMAC-signed and verified, `OAuthTokenManager.store`
      called with the app-internal `external_context(request)`. Path C
      (the user provides an API key, not OAuth): `Ciphertext.encrypt`,
      with the returned `state_id` — never the raw key — kept in state.
      A key the developer holds for the whole app is an application
      secret (`rbt cloud secret`), not actor state.
- [ ] Every method that calls the service's API is a `Workflow`, the
      call wrapped in a durability primitive (`at_least_once` /
      `at_most_once`), with `user_id=context.state_id`.
- [ ] A `fetch` reporting `found=False` (and `FetchAborted` before
      anyone has connected) is handled with a "connect" path, not a
      crash.
