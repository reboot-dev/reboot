---
title: OAuth Providers — Upgrading from `Anonymous()` Before Production
impact: HIGH
impactDescription: The swap is one line, but the user-ID namespace changes — do it before production to avoid an unwinnable state-migration problem
tags: auth, oauth, anonymous, google, github, provider, upgrade, migration, production
---

## OAuth Providers — Upgrading from `Anonymous()` Before Production

> **Critical:** swap providers **before** you have production users
> with real state. After the swap, every caller is identified by the
> new provider's ID space (Google `sub`, GitHub numeric ID) — none of
> which match the `anon-{ULID}` IDs minted under `Anonymous()`.
> State scoped to user IDs (anything gated by
> `state_id_is_user_id`, anything created with a user ID as its state
> ID) is **unreachable** after the swap. Cross-namespace migration is
> app-specific, error-prone, and usually infeasible — don't paint
> yourself into that corner.

`Application(oauth=<OAuthProvider>)` is the identity slot for an MCP
Chat App. Three providers ship in
`reboot.aio.auth.oauth_providers`:

| Provider      | Construction                               | Identity issued                          | When to use                                                              |
| ------------- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------ |
| `Anonymous()` | `Anonymous()` — no args                    | `anon-{ULID}` per session, no sign-in UI | Local dev and early scaffolding; demos that don't need durable identity. |
| `Google(...)` | `Google(client_id=..., client_secret=...)` | Google account's OIDC `sub` claim        | Production apps where users sign in with Google.                         |
| `GitHub(...)` | `GitHub(client_id=..., client_secret=...)` | GitHub user's numeric ID (as `str`)      | Production apps where users sign in with GitHub.                         |

Servicers and authorizer rules are **provider-agnostic** — the same
`allow_if(all=[state_id_is_user_id])` works under every provider.
Only `main.py` changes.

## The Code Swap

```python
# Before:
from reboot.aio.auth.oauth_providers import Anonymous

async def main():
    await Application(
        servicers=[UserServicer, CounterServicer],
        oauth=Anonymous(),
    ).run()

# After (Google):
import os
from reboot.aio.auth.oauth_providers import Google

async def main():
    await Application(
        servicers=[UserServicer, CounterServicer],
        oauth=Google(
            client_id=os.environ["GOOGLE_OAUTH_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
        ),
    ).run()
```

GitHub is the same shape — `GitHub(client_id=..., client_secret=...)`,
reading both values from `os.environ`. Servicer code, API
definitions, React components, and authorizer rules don't change.

## Where Credentials Come From

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
  Secret are what you pass to `GitHub(...)`.

For both providers, register the callback URL Reboot serves
(`<your-app-base-url>/oauth/callback`) when the registration flow
asks for an authorized redirect URI.

**Never** hard-code the client ID or client secret in `main.py` and
never check them into git. Deliver them to the running process as
environment variables — read them in `main.py` with
`os.environ["GOOGLE_OAUTH_CLIENT_ID"]` etc. (any uppercase
environment-style name you pick; `REBOOT_*` and `RBT_*` are
reserved). Set the values:

- **Locally under `rbt dev run`:** `export GOOGLE_OAUTH_CLIENT_ID=...` in the shell before launching, or
  pass `--env=GOOGLE_OAUTH_CLIENT_ID=...` on the CLI. Don't put
  the values in `.rbtrc` (it's checked into git).
- **On Reboot Cloud:** `rbt cloud secret set GOOGLE_OAUTH_CLIENT_ID` (reads the value from your shell env so
  it doesn't appear in shell history) — see
  `python/references/lifecycle-reboot-cloud.md` for the full
  command shape.

Full secrets reference (rules, gotchas, the reserved-prefix list,
the "don't" list): `python/references/lifecycle-secrets.md`.

## Why You Must Do This Before Production

`Anonymous()` mints a fresh `anon-{ULID}` user ID per OAuth flow.
Real providers issue stable IDs tied to a real account. The two ID
spaces don't overlap and have no mapping between them. Anything in
your app keyed on user ID — directly or indirectly — is affected:

- **State keyed by `user_id`.** If your app creates `Counter` actors
  with `state_id=user_id` (the typical chat-app pattern), the state
  is stranded under `anon-{ULID}` keys after the swap. A user who
  signs in with Google will land on a fresh, empty `Counter`.
- **`state_id_is_user_id` authorizers.** They keep working
  syntactically (every caller still has a `user_id`), but they now
  guard a different set of identities. The post-swap user can't
  reach pre-swap state, and pre-swap callers (long-lived MCP
  sessions still holding anon tokens) won't reach post-swap state.
- **Anything stored inside `User`-typed actors.** Same story — the
  `User` actor's state ID was the user's ID at creation time.
- **Index actors keyed on user ID.** Same story.

Cross-namespace migration is rarely viable:

- You'd need a way to tell the user "the data you created under your
  anonymous session belongs to _this_ Google account" — but there's
  no reliable, secure way to make that linkage without a session
  cookie or out-of-band proof that survived the swap.
- Anonymous IDs are by design unmemorable and unauthenticated, so
  even if you build a manual claim flow, it's hand-jobs at best and
  identity theft at worst.

**The right plan is to swap providers before launch.** Specifically:

1. While building, use `oauth=Anonymous()` so the developer loop is
   frictionless.
2. As soon as the app is something users would create real state in
   — even an internal pilot — swap to `Google` / `GitHub`. Throw
   away the `anon-{ULID}` state from dev (start clean) and proceed
   with the real provider for the rest of the app's lifetime.
3. Treat the provider choice as **a one-way decision after launch**.
   Adding additional providers later (e.g. start with Google, add
   GitHub) is a separate, harder topic — the framework today
   accepts a single `oauth=` provider, so multi-provider support
   needs deliberate design and isn't covered here.

## Verifying the Swap

After deploying with the new provider:

1. Run through the OAuth flow as a real user. The provider's
   sign-in page should appear (it does **not** under `Anonymous()`).
2. Check that `context.auth.user_id` in a Servicer reads as the
   provider-issued ID (Google `sub` looks like `1234567890`; GitHub
   IDs are short integer strings) — not `anon-{ULID}`.
3. Confirm `state_id_is_user_id`–protected methods accept the
   logged-in user and reject other callers as expected.
