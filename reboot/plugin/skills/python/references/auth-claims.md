---
title: Identity Claims and `User.set_claims`
impact: HIGH
impactDescription: Without claims= the app sees only an opaque user id; a missing set_claims override fails every sign-in
tags: auth, oauth, claims, set_claims, email, email_verified, User, Development
---

## Identity Claims and `User.set_claims`

Signing in gives the app one fact about the caller: an opaque
`context.auth.user_id`. When the app needs to know something _about_
the user (an email address, whether the provider verified it, a
display name), it asks the provider for **claims**. Claims are opt-in
per provider, and they arrive in one place: the `set_claims`
transaction on the state type named `User`.

### Request Claims in Every Arm

Ask for the same claims in the `dev` arm as in `prod`, so the code
that reads them runs during development too. `Development()` accepts
`claims=` and fabricates the values:

```python
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)

application = Application(
    servicers=[UserServicer, ...],
    oauth=OAuth(
        provider=OAuthProviderByEnvironment(
            dev=Development(claims=["email", "email_verified", "name"]),
            prod=None,  # chosen at deploy, e.g. Google(..., claims=[...])
        ),
    ),
)
```

A claim can be presented under another name with a mapping:
`claims={"email": "verified-email"}`. Each registered provider
requests the OAuth scopes its claims need on its own.

### Override `set_claims` on `User`

`set_claims` is a `Transaction` the framework adds to `User`. Override
it in the servicer with `(self, context, request)` and write through
`self.state`:

```python
from reboot.aio.contexts import TransactionContext


class UserServicer(User.Servicer):

    async def set_claims(
        self,
        context: TransactionContext,
        request: User.SetClaimsRequest,
    ) -> None:
        # A full replace: a claim absent from the request is one the
        # provider no longer asserts.
        self.state.email = request.claims.get("email", "")
        self.state.email_verified = bool(
            request.claims.get("email_verified", False)
        )
        self.state.name = request.claims.get("name", "")
```

`request.claims` is a `dict[str, Any]` holding the complete, current
set of requested claims. On each sign-in the framework constructs the
`User` if it doesn't exist yet, then calls `set_claims`, so the method
must be harmless when the same claims arrive again. Anything keyed by
the address, such as a roster entry or an invitation, should be linked
only when `email_verified` is true: an unverified address is a claim
anybody can make ([`auth-roles.md`](auth-roles.md)).

Every field on `User`'s state needs a default (or must be optional),
because the framework constructs it with no arguments.

### What Each Provider Can Deliver

| Provider      | Claims                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Development` | `email`, `email_verified`, `name`: fabricated, `alice@example.com` for Alice, always verified                      |
| `Google`      | `email`, `email_verified`, `name`, `given_name`, `family_name`, `picture`, `locale`, `profile`                     |
| `GitHub`      | `email`, `email_verified`                                                                                          |
| `Auth0`       | `email`, `email_verified`, `name`, `given_name`, `family_name`, `middle_name`, `nickname`, `picture`, `updated_at` |
| `Ory`         | `email`, `email_verified`, `name`, `given_name`, `family_name`, `username`, `website`, `updated_at`                |
| `Anonymous`   | none; it takes no `claims=` argument                                                                               |

`Development` offers five identities: Alice, Ben, Carlos, Dani and Esi.
Its user ids (`dev-<hash>`) are opaque on purpose, so key nothing on
them; key on the verified `email` claim and look the user id up at run
time.

### When Claims Arrive

- **Only at sign-in.** Claims are delivered when the provider's
  authorization code is exchanged. A token refresh delivers none and
  clears none. Access tokens last 24 hours by default
  (`access_token_ttl_seconds=` on the provider).
- **`Ory` can also deliver between sign-ins**: with
  `webhook_secret=` (which requires `claims=`), a change made in an
  Ory settings flow reaches users who have already signed in. See
  [`auth-oauth-providers.md`](../../mcp-ui/references/auth-oauth-providers.md).
- **`set_claims` is app-internal only.** A check that runs before any
  authorizer refuses external callers with `PermissionDenied`, so not
  even `allow()` exposes it.
- **Sign-in waits for it.** Keep `set_claims` small: it is a
  transaction on the user's `User`, so a long one, or another
  transaction holding that `User`, delays the sign-in.

### Mistakes and What They Look Like

- **`Development()` with no `claims=`:** the app sees only the user
  id, `set_claims` is never called, and nothing warns.
- **Requesting claims without overriding `set_claims`:** the
  generated default raises at the first sign-in that delivers them.
- **Merging claims into existing state:** each delivery is the whole
  truth; overwrite.
- **Declaring `set_claims` or `create` in the `User` API:** both are
  reserved and added by the framework; override them in the servicer.

| Error text                                                     | Cause                                                      | Fix                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `Verified identity claims were delivered for this`             | Claims requested, `set_claims` not overridden              | Override it, or remove `claims=`                 |
| `cannot deliver the identity claim(s)`                         | A claim the provider doesn't have (raised at construction) | Pick from the claims the message lists           |
| `is a reserved method name for User types`                     | `set_claims` or `create` declared in the API               | Delete the declaration; override in the servicer |
| `Signature of "set_claims" incompatible with supertype` (mypy) | The override takes a `state` parameter                     | `(self, context, request)`, with `self.state`    |

### See Also

- [`auth-roles.md`](auth-roles.md): a staff roster built on verified
  claims
- [`servicer-authorizer.md`](servicer-authorizer.md): authorizer rules
  and app-internal calls
- [`auth-oauth-providers.md`](../../mcp-ui/references/auth-oauth-providers.md):
  choosing and configuring providers
