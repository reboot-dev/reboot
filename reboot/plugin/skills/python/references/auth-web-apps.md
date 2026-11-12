---
title: Sign-in in a Web App — oauth=, Authorizers from Day One, Calling APIs as the User
impact: HIGH
impactDescription: How a web app's browser users get an identity, which authorizers to write when, and how to call an external API as the signed-in user. A missing rule papered over with allow() survives into production.
tags: auth, oauth, web-app, browser, session, authorizer, external-api, tokens
---

# Sign-in in a Web App

Web apps wire identity via
`Application(oauth=OAuth(provider=OAuthProviderByEnvironment(dev=Development(), prod=Google(...))))`
— the same parameter MCP Apps use. Reboot mounts its
built-in OAuth Authorization Server at `/__/oauth/*` and brokers
sign-in against the configured upstream IdP. Browser sessions
are carried in an HttpOnly `rbt_session` cookie set by
`/__/oauth/finish`; the framework reads it as a bearer on every
RPC, so user code only sees `context.auth.user_id` (same shape
as MCP).

A plain HTTP route the page calls — a download, an image, an export
— serves every request unless registered with
`require_oauth_token=True`, which serves only a request carrying the
client's bearer. A plain `<img src>`, `<video src>` or `<a href>`
carries none, and the session cookie never reaches the route, so the
page obtains a short-lived signed URL with the bearer and gives that
to `src`. Backend and page side are in
[python/references/auth-http-routes.md](auth-http-routes.md).

> **When to use `token_verifier=`.** For sign-in with Google,
> GitHub, Auth0 or anonymous users, use `oauth=...`. Use
> `token_verifier=` only when you need an identity provider the
> built-in `oauth=` providers don't cover (for example, an
> enterprise SAML/OIDC broker you can't wrap as an
> `OAuthProvider` subclass), or custom token semantics. The two
> compose: when both are set, Reboot's own verifier runs first,
> and any token that isn't a Reboot-minted access JWT falls
> through to yours.

The imports, so you don't have to go looking for them:

```python
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Development,
    Google,                       # or GitHub, Auth0, …
    OAuthProviderByEnvironment,
)
```

Recommended sequence:

1. **Early development (no provider chosen yet):** configure
   `oauth=OAuth(provider=OAuthProviderByEnvironment(dev=Development(), prod=None))`.
   `Development()` is a built-in fake account picker that lets
   you sign in as any identity at `/__/oauth/start`; `prod=None`
   fails fast at startup if you accidentally `rbt serve` without
   choosing a real provider. Because every caller already has a
   verified `context.auth.user_id` under `Development()`, **write
   `authorizer()` on every Servicer from day one**, with
   `allow_if(...)` rules that run in dev exactly as in production
   (see `python/references/servicer-authorizer.md`,
   `python/references/auth-allow-if.md`, and
   `python/references/auth-built-in-predicates.md`). Do **not** use
   `allow()` in place of a missing rule; `allow()` means
   "public, unauthenticated internet endpoint" and survives into
   production.
2. **Before `rbt serve` / Reboot Cloud:** set `prod=Google(...)`
   (or `GitHub(...)`, `Auth0(...)`, your own `OAuthProvider`
   subclass). The authorizers need no second pass. The providers
   and what each needs:

   All arguments are keyword-only.

   | provider        | required arguments                        |
   | --------------- | ----------------------------------------- |
   | `Development()` | none — dev only, sign in as any identity  |
   | `Anonymous()`   | none — every visitor is a fresh identity  |
   | `Google(...)`   | `client_id=`, `client_secret=`            |
   | `GitHub(...)`   | `client_id=`, `client_secret=`            |
   | `Auth0(...)`    | `domain=`, `client_id=`, `client_secret=` |
   | `Ory(...)`      | `domain=`, `client_id=`, `client_secret=` |

   The registered providers (everything but `Development` and
   `Anonymous`) also take `scopes=`, `claims=`, and
   `store_tokens=`; register `/__/oauth/callback` as the redirect
   URI with the provider.

   Add `claims=[...]` when you need identity fields such as the
   user's email, and `store_tokens=True` only when you will call
   that provider's own API as the user. **Choose deliberately
   before real users exist**: `context.auth.user_id` is namespaced
   per provider, so switching providers after launch strands every
   existing user's state. Only reach for
   [python/references/auth-oauth-providers.md](auth-oauth-providers.md)
   if you need to write a custom provider or debug a specific
   provider's flow.

   Tests build their own `Application(...)` rather than running
   `main.py`'s, whose `prod=None` arm and missing `allowed_origins`
   refuse to start anywhere but `rbt dev run`. List the same
   servicers, with the same authorizers, and wire identity per
   `python/references/testing-harness.md` ("Identity Wiring in
   Tests"): omit `oauth=` for backend scenarios, and for scenarios
   that open the web app use `Development()` for both `dev=` and `prod=`, plus
   `allowed_origins=[]`, as `frontend/references/testing-web-app.md`
   shows.

3. **Public, unauthenticated endpoints** (health checks, public
   sign-up, public catalog reads): mark these explicitly with
   `allow()`. That's the one legitimate use.

## Calling external APIs on the user's behalf

To act **as the user** at an external service (call their Slack,
Google, a partner API), store that service's OAuth tokens encrypted in
an `OAuthTokenManager` and make the call inside a `Workflow`. When the
API belongs to the identity provider you already sign in with via
`Application(oauth=...)` (`Google` / `GitHub` / `Auth0`), use the
`store_tokens=True` shortcut: add the extra `scopes=[...]` your calls
need and the OAuth server captures the provider's tokens at sign-in.
See the section titled "Path A — the built-in easy path" in
`python/references/auth-external-api-calls.md`. For any other
service, run that service's OAuth flow yourself with your own
authorize/callback HTTP endpoints (a callback registered
`app_internal=True`) and call `OAuthTokenManager.store`. See the
section titled "Path B — your own OAuth flow (any other service)" in
`python/references/auth-external-api-calls.md`; the same file covers
storage, reading tokens back, the in-`Workflow` call, refresh, and
erasure, for MCP Apps and web apps alike. Never store tokens in a
plain `str` field or hand-roll `Ciphertext`
(`python/references/stdlib-oauth-tokens.md`). If the service doesn't do
OAuth at all and the user pastes an **API key** instead, that key goes
through `Ciphertext` (the ciphertext id kept in state) — Path C in the
same recipe.

## Who Signs In

A web app's design says who signs in: anonymous visitors only,
signed-in users, or per-user state. **Every web app declares a `User`
type**, even one with no per-user state: the root's sign-in gate
reads `useUser()` before it renders the shell (the frontend skill's
"Building a web app"). Route creation through it the same way an MCP
App does — the `User`-front-door pattern is independent of MCP.
