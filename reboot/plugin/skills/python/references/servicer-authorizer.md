---
title: Authorizers — When to Write Them, When to Skip
impact: HIGH
impactDescription: Whether to write `authorizer()` from day one or defer it depends on how identity is wired (`oauth=` works for both MCP and web; `token_verifier=` is the custom-IdP escape hatch)
tags: servicer, authorizer, allow, allow_if, auth, authorizers, production, oauth, anonymous, token-verifier
---

## Authorizers — When to Write Them, When to Skip

> **Critical:** authorizer rules are evaluated against the caller's
> **identity**. Whether identity exists during development depends on
> how the `Application(...)` is wired. The right "when to write
> authorizers" rule follows from that — don't sprinkle `allow()`
> everywhere to paper over the difference.

A Reboot Servicer may define `def authorizer(self)` returning a rule
instance (e.g. `allow_if(all=[has_verified_token])`). Reboot evaluates
that rule against `context.auth` before each method call. Identity
comes from one of two sources on `Application(...)`:

| Identity source on `Application(...)`                                                            | When identity is available                                                                                                   | Implication for authorizer rules                                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `oauth=<OAuthProviderSelector>` (e.g. `OAuthProviderByEnvironment(dev=Development(), prod=...)`) | **Always** — every caller gets a verified `context.auth.user_id` (a `dev-{hash}` under `Development()`), in dev and in prod. | Write real `allow_if(...)` rules **from day one**. They work in dev exactly as in production. |
| `token_verifier=<TokenVerifier>`                                                                 | **Only when the verifier is wired** — typically requires integrating an external IdP (Auth0, Firebase, JWT issuer, …).       | Until the verifier is in place, no caller has identity. Defer rules (see below).              |
| Neither                                                                                          | Never.                                                                                                                       | All rules that need identity will fail.                                                       |

`Development()` (the typical `dev` arm, wired via
`oauth=OAuthProviderByEnvironment(dev=Development(), prod=...)`) is a
real OAuth provider that shows a fake account-picker sign-in UI and
mints a stable `dev-{hash}` user ID per chosen identity — no external
IdP, but `context.auth.user_id` is populated and predicates like
`has_verified_token` and `state_id_is_user_id` work correctly. This is
what makes "write real authorizers from day one" viable for apps that
don't need an external IdP.

## What Happens Without `authorizer()`

If a Servicer doesn't define `authorizer()`, Reboot's fallback depends
on the runtime mode:

| Mode                       | Behavior when `authorizer()` is missing                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `rbt dev`                  | Call is **allowed**, with a `WARNING` log every ~60s naming the unauthorized method. |
| `rbt serve` / Reboot Cloud | Call is **denied** (`PermissionDenied`).                                             |
| Servicer for a `User` type | Always enforced (`state_id_is_user_id` + `is_app_internal`), **including in dev**.   |

So "skip the authorizer in dev" is a real option — but only sensible
when you couldn't have written a meaningful rule yet anyway (no
identity available).

## When to Write Authorizers from Day One vs. Defer

- **`Application(oauth=...)` (any OAuth provider, including `Development()`)** —
  identity is wired by construction. **Write `authorizer()` on every
  Servicer up front**, using `allow_if(...)` with predicates like
  `has_verified_token` and `state_id_is_user_id`. The rules execute
  identically in dev and prod; no second pass before shipping. This
  is the typical and recommended pattern for **both** MCP chat apps
  and standalone web apps — the same OAuth server serves both
  surfaces, browsers via a `rbt_session` cookie and MCP clients via
  `Authorization: Bearer`.
- **`Application(token_verifier=...)` before the verifier is wired** —
  the escape hatch for custom IdPs the built-in `oauth=` providers
  don't cover. Fine to **omit `authorizer()` during early
  development** while standing up the verifier; the dev-mode warning
  serves as the TODO list for what still needs rules. Wire the
  verifier and add real `allow_if(...)` rules before `rbt serve` /
  cloud.
- **`User`-type Servicers** — usually don't need a custom
  `authorizer()` at all. The framework's default
  (`state_id_is_user_id` + `is_app_internal`) is production-worthy.

## Don't Default to `allow()` Everywhere

`allow()` is an unconditional rule that permits every caller from
the public internet. It is not a "safe default" — it's an explicit
"this endpoint is public, unauthenticated" declaration. See
`auth-allow-deny.md` for the narrow legitimate uses and the
anti-patterns the agent should refuse.

## When You DO Define `authorizer()` — Return an Instance, Not a Class

The single most common bug when writing one: returning the function
itself instead of calling it.

```python
# Wrong — returns the function reference, not a rule:
def authorizer(self):
    return allow

# Right — constructs a rule instance:
def authorizer(self):
    return allow()
```

## Canonical Shapes

**App using `oauth=` (write real rules from day one):**

```python
from reboot.aio.auth.authorizers import allow_if, state_id_is_user_id
from reboot.aio.contexts import ReaderContext


class CounterServicer(Counter.Servicer):

    def authorizer(self):
        # Only the user whose ID matches this Counter's state ID may
        # call its methods. An `oauth=` provider (e.g. via
        # `OAuthProviderByEnvironment`) ensures every caller has a
        # `user_id`.
        return allow_if(all=[state_id_is_user_id])

    async def value(
        self, context: ReaderContext,
    ) -> Counter.ValueResponse:
        return Counter.ValueResponse(value=self.state.value)
```

**App using `token_verifier=` before the verifier is wired (defer):**

```python
class CatalogServicer(Catalog.Servicer):
    # No `authorizer()` yet — `rbt dev` allows and warns; this is
    # the TODO list for what needs a real rule before `rbt serve`.

    async def list(
        self, context: ReaderContext,
    ) -> Catalog.ListResponse:
        return Catalog.ListResponse(items=self.state.items)
```

## One Authorizer per Servicer

`def authorizer(self)` returns a single rule that applies to every
method on the Servicer. Per-method differentiation (e.g. allow reads
but gate writes) requires a custom authorizer subclass — see
`auth-custom-predicates.md`.
