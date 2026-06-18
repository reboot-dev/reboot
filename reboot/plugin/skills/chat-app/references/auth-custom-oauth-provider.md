---
title: Writing Your Own OAuth Provider
impact: MEDIUM
impactDescription: Only needed when no shipped provider fits; the contract is small but strict — an unstable user id silently fragments user state, and a wrong `state`/`redirect_uri` handling breaks the flow at runtime, not startup.
tags: auth, oauth, provider, custom, oidc, okta, keycloak, sso, identity, exchange-code, authorization-url, store_tokens
---

## Writing Your Own OAuth Provider

Reach here **last**. The order of preference for
`Application(oauth=...)`:

1. **`Google` / `GitHub`** when users sign in with one of those
   directly.
2. **`Auth0`** when you need several login methods behind one provider,
   or user management beyond a bare user id (profiles, password resets,
   MFA, …) — Auth0 brokers most IdPs, including enterprise SSO.
3. **A custom provider** only when neither works: a self-hosted
   Keycloak, an internal SSO you can't put Auth0 in front of, an OAuth
   service Auth0 can't broker.

A provider is a subclass of `OAuthProvider`
(`reboot.aio.auth.oauth_providers`). For the standard case — an
authorization-code IdP with pre-registered `client_id` /
`client_secret` — subclass **`RegisteredOAuthProvider`**, which already
handles credentials, extra `scopes=`, `store_tokens=`, and fail-fast
`validate()`. Subclass `OAuthProvider` directly only for non-standard
schemes (`Development` and `Anonymous` are the in-tree examples).

## The contract

You implement two methods; Reboot's OAuth server does everything else
(its own `/__/oauth/...` endpoints, `state` minting and verification,
minting the app's own access tokens, populating
`context.auth.user_id`).

- **`authorization_url(state, redirect_uri) -> str`** — build the IdP's
  authorize URL: your `client_id`, the requested scopes,
  `response_type=code`, and **`state` and `redirect_uri` passed through
  verbatim** — `state` is a JWT the server verifies on callback (CSRF
  protection), and `redirect_uri` is the server's own
  `/__/oauth/callback`, which must also be registered with the IdP.
- **`exchange_code(code, redirect_uri) -> ExchangeResult`** — POST the
  `code` to the IdP's token endpoint (plain `aiohttp` / `httpx`) and
  resolve the user's id: from the OIDC `id_token`'s `sub` claim, or for
  a plain-OAuth IdP by calling its user-info API with the access token
  (that's what `GitHub` does). Raising any exception here is safe — the
  server logs it and turns it into a graceful `access_denied` redirect.

> **The user id must be stable.** Whatever `exchange_code` returns
> becomes `context.auth.user_id` and the key of all user-keyed state —
> the same human must get the same id on every sign-in (an OIDC `sub`,
> a numeric account id; never an email that can change or anything
> session-scoped). It also fixes your user-ID namespace, so the
> provider-permanence rule of `auth-oauth-providers.md` applies to your
> custom provider too.

Optional hooks:

- **`validate()`** — raise `InputError` on missing/invalid
  configuration. Called once, when the provider is actually selected
  for the current environment, so a misconfigured `prod=` arm fails at
  startup, not mid-sign-in. `RegisteredOAuthProvider` already checks
  `client_id` / `client_secret`; override to check your extras (call
  `super().validate()` first — see `Auth0._normalize_domain` /
  `Auth0.validate` for the shape).
- **`mount_routes(http)`** — register provider-specific HTTP routes,
  rarely needed (`Development` uses it for its login page).
- **`token_service_id`** — see "Supporting `store_tokens=True`" below.

## Model your provider on the shipped ones

Don't write a provider from a blank page — read the shipped providers
in `reboot.aio.auth.oauth_providers` (the module is part of the
installed `reboot` package; open its source) and adapt the closest one:

- **`Auth0`** is the model for any OIDC IdP (Keycloak, Okta, a
  self-hosted SSO): authorization-code exchange, the user id from the
  ID token's `sub` claim, a constructor extra (`domain=`) with its
  `validate()` check, and full `store_tokens=True` support including
  the `offline_access` refresh-token scope.
- **`GitHub`** is the model for a plain-OAuth (non-OIDC) IdP: no ID
  token, so it resolves the user id by calling the IdP's user-info API
  with the freshly exchanged access token.
- **`Google`** shows a provider-specific refresh-token knob added in
  `authorization_url` (`access_type=offline`).

Your subclass differs from its model only in the endpoint URLs, the
`_REQUIRED_SCOPE`, any constructor extras (a base URL, a realm, a
tenant), and `token_service_id` — the rest carries over line by line.

Wire the instance like any shipped provider. Reboot serves the
callback route (`<base-url>/__/oauth/callback`) automatically, but the
IdP only redirects to URLs on its per-client allowlist — and that
allowlist lives in the IdP's own console, where only the **user** can
go. **Tell the user explicitly** to add that URL as an authorized
redirect URI there (along with registering the client and obtaining
the `client_id` / `client_secret`); don't assume it's done — the
provider won't work until it is. This is the same hand-off
`auth-oauth-providers.md` describes for the shipped providers:

```python
oauth=OAuthProviderByEnvironment(
    dev=Development(),
    prod=MyIdP(
        client_id=os.environ.get("MY_IDP_CLIENT_ID"),
        client_secret=os.environ.get("MY_IDP_CLIENT_SECRET"),
    ),
)
```

## Supporting `store_tokens=True`

To let your provider participate in the token-capture machinery of
`auth-store-tokens.md` (so the app can call the IdP's API as the
user):

1. Override **`token_service_id`** with the state id naming the service
   (e.g. `"sso.example.com"`) — apps read tokens back with
   `OAuthTokenManager.ref(<that id>).fetch(...)`.
2. When `self._store_tokens` is set, have `exchange_code` return an
   `OAuthTokens` (`rbt.std.oauth.v1.oauth_rbt`) built from the token
   response — `access_token`, `refresh_token`, `expires_at`, and
   `scopes`. Return `tokens=None` when it isn't — apps that don't opt
   in must never carry these secrets around.
3. If the IdP needs a special knob to issue refresh tokens (Google's
   `access_type=offline`, Auth0's `offline_access` scope), add it in
   `authorization_url` — only when `self._store_tokens` is set.

The server then persists the tokens encrypted under the matching
`OAuthTokenManager` (requiring the `oauth` + `ciphertext` +
`ordered_map` libraries) and carries a previously stored
`refresh_token` forward when a later sign-in omits one — identical to
the shipped providers.
