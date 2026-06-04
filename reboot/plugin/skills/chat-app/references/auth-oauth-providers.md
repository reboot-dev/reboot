---
title: OAuth Providers — Choosing a Production Provider
impact: HIGH
impactDescription: The provider you launch with fixes your user-ID namespace; switching providers later strands all user-keyed state, so choose deliberately before you have production users
tags: auth, oauth, development, anonymous, google, github, auth0, provider, production, migration
---

## OAuth Providers — Choosing a Production Provider

> **Critical:** the provider you launch with **fixes your user-ID
> namespace**. Each provider identifies callers in its own ID space
> (Google `sub`, GitHub numeric ID, …) with no mapping between them.
> Switch providers once you have real users and every user-keyed piece
> of state — anything gated by `state_id_is_user_id`, anything created
> with a user ID as its state ID — becomes unreachable. Choose your
> production provider **deliberately, before you have production
> state**, and don't launch on a throwaway intending to "upgrade
> later."

`Application(oauth=...)` is the identity slot for an MCP Chat App. It
takes an **`OAuthProviderSelector`** — not a provider directly — so the
provider can depend on the run environment. The selector that ships is
`OAuthProviderByEnvironment(dev=..., prod=...)`.

The **providers** you place in the `dev` / `prod` arms ship in
`reboot.aio.auth.oauth_providers`:

| Provider        | Construction                                          | Identity issued                                          | When to use                                                                                            |
| --------------- | ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Development()` | `Development()` — no args                             | stable `dev-{hash}` per fake identity, account-picker UI | Local dev only; **never in production**.                                                               |
| `Google(...)`   | `Google(client_id=..., client_secret=...)`            | Google account's OIDC `sub` claim                        | Production apps where users sign in with Google.                                                       |
| `GitHub(...)`   | `GitHub(client_id=..., client_secret=...)`            | GitHub user's numeric ID (as `str`)                      | Production apps where users sign in with GitHub.                                                       |
| `Auth0(...)`    | `Auth0(domain=..., client_id=..., client_secret=...)` | Auth0 OIDC `sub` (e.g. `google-oauth2\|108…`)            | Production apps that broker sign-in through Auth0 (Google, GitHub, password, SSO) behind one provider. |

`Auth0` takes a `domain=` (your tenant, e.g. `your-tenant.us.auth0.com`)
on top of the client credentials — all its endpoints live under that
domain. It's an identity _broker_: one Auth0 application lets users sign
in through any connection you enable in the Auth0 dashboard
(Google, GitHub, username/password, enterprise SSO), and your app sees a
single OIDC provider. The per-user choice of login method happens
upstream in Auth0, not in your code. Because the `sub` it issues encodes
the upstream connection (`google-oauth2|…`, `auth0|…`, `github|…`), the
namespace-permanence rule below still applies: changing which Auth0
connections you offer can change users' `sub`s.

There is also an `Anonymous()` provider that mints a fresh
`anon-{ULID}` per OAuth flow with no sign-in UI. It's a real provider
that populates `context.auth.user_id`, but **don't launch on it** — see
"Your provider choice is effectively permanent" below.

**Choosing per environment.**
`OAuthProviderByEnvironment(dev=..., prod=...)` returns its `dev` arm
only under `rbt dev run`, and its `prod` arm everywhere else — `rbt serve`, Reboot Cloud, and any environment it can't classify (which
defaults to the more secure `prod`, never the local-dev arm). Both arms
are **required** (so the choice for each environment is deliberate), but
either may be `None`: if the selected arm is `None`, the application
**fails to start** with a clear message — so an app that never chose a
provider for the current environment can't silently ship without
sensible auth. (The selector is resolved only when the app has a
`User`-typed auto-construct servicer that actually needs identity.)
`oauth=None` is equivalent to
`OAuthProviderByEnvironment(dev=None, prod=None)` — no provider in any
environment. In unit tests you use the `OAuthProviderForTest(provider)`
selector, with `Anonymous` a reasonable default provider to go with.

Servicers and authorizer rules are **provider-agnostic** — the same
`allow_if(all=[state_id_is_user_id])` works under every provider.
Only `main.py` changes.

**Beyond identity.** Identity is this slot's only required job, but the
same OAuth machinery can also let the app act **as the user** at an
external service — call your identity provider's own API (built in via
`scopes=[...]` + `store_tokens=True`), or **any other** third-party
service (which you wire up yourself with your own OAuth endpoints). That's
a separate concern from picking a provider; the full setup for both is in
[`auth-provider-api-calls.md`](auth-provider-api-calls.md). The rest of
this reference is only about **identity**.

## Replace `Development` Before Production

This part is obvious: `Development` is a local-development convenience.
It shows a fake account picker ("Alice", "Ben", …) and issues stable
but fake `dev-{hash}` IDs (reset on `rbt dev expunge`). Real customers
must never see it — swap it for a real provider (`Google` / `GitHub`)
before you ship. The subtler, more important trap is further down.

## The Code Swap

The recommended pattern keeps the friendly fake sign-in locally and
uses your real provider everywhere else — one `main.py`, no
environment-conditional code:

```python
import os
from reboot.aio.auth.oauth_providers import (
    Development,
    Google,
    OAuthProviderByEnvironment,
)

async def main():
    await Application(
        servicers=[UserServicer, CounterServicer],
        oauth=OAuthProviderByEnvironment(
            dev=Development(),
            prod=Google(
                client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID"),
                client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"),
            ),
        ),
    ).run()
```

Under `rbt dev` you get the fake account picker (no real Google
credentials needed locally); everywhere else — including `rbt serve`,
Reboot Cloud, and any unrecognized environment — you get Google. If
you'd rather exercise the real provider locally too, set `dev=Google(...)`
as well (you'll then need its credentials in dev).

Note the `os.environ.get(...)` (not `os.environ[...]`): the `Google(...)`
constructor runs even under `rbt dev`, where only the `dev=` arm is
actually used. `.get()` returns `None` when the variable isn't set so
local dev doesn't need the production credentials; `Google` /
`GitHub` reject a `None` `client_id` / `client_secret` only when the
OAuth server actually mounts them, so the production deploy still
fails fast if the credentials are missing there.

GitHub is the same shape — `GitHub(client_id=..., client_secret=...)`,
reading both values from `os.environ`. Servicer code, API
definitions, React components, and authorizer rules don't change.

## Where Credentials Come From

**Remind the user** that this side is theirs to configure, for **every**
provider — none of it is done in code. Registering the application,
getting the client ID / secret, and authorizing the callback URL all
happen in the provider's own console (Google Cloud Console, GitHub
Developer Settings, the Auth0 dashboard — plus enabling upstream
connections for Auth0). An `oauth=` provider won't work until they've set
that up correctly, so tell them explicitly; don't assume it's done.

Each provider has its own one-time registration flow. Follow the
provider's own docs — they stay current with UI changes and cover
edge cases (verification, scopes, callback URL formats, etc.) that
we won't try to mirror here:

- **Google**: [Setting up OAuth 2.0](https://support.google.com/cloud/answer/6158849)
  in the Google Cloud Console. Create an OAuth client ID of type
  "Web application"; the resulting Client ID and Client Secret are
  what you pass as `client_id=` and `client_secret=`.
- **GitHub**: [Creating an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
  in GitHub Developer Settings. The Client ID and generated Client
  Secret are what you pass to `GitHub(...)`. (If you need
  `store_tokens=True` with refresh tokens, register a **GitHub App**
  with expiring user tokens instead — see
  [`auth-provider-api-calls.md`](auth-provider-api-calls.md).)
- **Auth0**: in the [Auth0 dashboard](https://auth0.com/docs/get-started/auth0-overview/create-applications),
  create a **Regular Web Application**. Its Domain, Client ID, and
  Client Secret are what you pass as `domain=`, `client_id=`, and
  `client_secret=`. Enable the upstream connections you want users to
  sign in through (Google, GitHub, username/password, SSO) under the
  application's Connections tab.

For every provider, register the callback URL Reboot serves —
`<your-app-base-url>/__/oauth/callback` (note the `/__/` prefix) — when
the registration flow asks for an authorized redirect URI. For local
`rbt dev run` that base URL is `http://localhost:9991`, and providers
often treat `localhost` and `127.0.0.1` as distinct origins, so register
**both** `http://127.0.0.1:9991/__/oauth/callback` and
`http://localhost:9991/__/oauth/callback`.

**Never** hard-code the client ID or client secret in `main.py` and
never check them into git. Deliver them to the running process as
environment variables — read them in `main.py` with
`os.environ.get("GOOGLE_OAUTH_CLIENT_ID")` etc. (any uppercase
environment-style name you pick; `REBOOT_*` and `RBT_*` are
reserved). Use `.get()`, not `os.environ[...]`: when you only use
`Google` in the `prod=` arm, the constructor still runs under `rbt dev`
where the variable isn't set, and `.get()` returns `None` cleanly there
— the provider only rejects `None` when it's actually mounted on the
OAuth server. Set the values:

- **Locally under `rbt dev run`:** `export GOOGLE_OAUTH_CLIENT_ID=...` in the shell before launching, or
  pass `--env=GOOGLE_OAUTH_CLIENT_ID=...` on the CLI. Don't put
  the values in `.rbtrc` (it's checked into git).
- **On Reboot Cloud:** `rbt cloud secret set GOOGLE_OAUTH_CLIENT_ID` (reads the value from your shell env so
  it doesn't appear in shell history) — see
  `python/references/lifecycle-reboot-cloud.md` for the full
  command shape.

Full secrets reference (rules, gotchas, the reserved-prefix list,
the "don't" list): `python/references/lifecycle-secrets.md`.

## Your Provider Choice Is Effectively Permanent

This is the non-obvious part, and it's why the choice matters before
launch — not just that `Development` is fake. A user's ID comes from
the provider, and providers don't share an ID space:

- `Google` issues the OIDC `sub`.
- `GitHub` issues a numeric account ID.
- `Auth0` issues its OIDC `sub`, which encodes the upstream connection
  (`google-oauth2|…`, `auth0|…`).
- `Anonymous()` issues a fresh `anon-{ULID}` per flow.
- `Development()` issues a `dev-{hash}` per fake identity.

Switching from one to another — Google→GitHub, and especially
`Anonymous` → a real provider — changes **every** user's ID. Anything
keyed on user ID is then stranded:

- **State keyed by `user_id`.** A `Counter` created with
  `state_id=user_id` (the typical chat-app pattern) lives under the old
  ID; after the switch the same human signs in with a new ID and lands
  on a fresh, empty `Counter`.
- **`state_id_is_user_id` authorizers.** Still valid syntactically
  (every caller still has a `user_id`), but they now guard a different
  set of identities — pre-switch callers can't reach post-switch state
  and vice versa.
- **Anything stored inside `User`-typed actors, or in index actors
  keyed on user ID.** Same story — the state ID was the user's ID at
  creation time.

And the migration back is rarely viable: there's no reliable, secure
way to prove "the data under this old ID belongs to that new account"
without a session cookie or out-of-band proof that survived the
switch. With `Anonymous` it's worse — the old IDs are unauthenticated
throwaways, so any "claim your data" flow is guesswork at best and
identity theft at worst.

This is exactly why **launching on `Anonymous` "for now" is a trap**:
it issues real, durable-looking IDs, so it's tempting to ship with it
and "add real sign-in later" — but that later swap strands everything
your early users created. The right plan:

1. While building, use the default `Development` provider (no sign-in
   friction, and it lets you exercise multiple identities). `Anonymous`
   is fine here too — both are throwaway state you can wipe.
2. Before you have production users with real state — even an internal
   pilot — pick your real provider (`Google` / `GitHub`) and launch on
   it. Start clean; don't carry dev or anonymous state forward.
3. Treat that production provider as a **one-way decision**. Adding a
   second provider later (e.g. Google _and_ GitHub) is a separate,
   harder problem — the framework accepts a single `oauth=` provider
   today, so multi-provider support needs deliberate design and isn't
   covered here.

## Verifying the Swap

After deploying with the new provider:

1. Run through the OAuth flow as a real user. The provider's real
   sign-in page should appear (under `Development()` you instead saw a
   fake account picker).
2. Check that `context.auth.user_id` in a Servicer reads as the
   provider-issued ID (Google `sub` looks like `1234567890`; GitHub
   IDs are short integer strings) — not `dev-{hash}`.
3. Confirm `state_id_is_user_id`–protected methods accept the
   logged-in user and reject other callers as expected.
