---
title: Compose Predicates with `allow_if(all=...)` / `allow_if(any=...)`
impact: HIGH
impactDescription: All non-trivial authorization is composed from `allow_if` and predicates
tags: auth, allow_if, predicate, all, any, composition
---

## Compose Predicates with `allow_if(all=...)` / `allow_if(any=...)`

> **Critical:** pass exactly one of `all=` **or** `any=` (passing both
> asserts at runtime). For `all=`, list cheap auth-establishing
> predicates first — short-circuiting + later predicates can rely on
> earlier `Ok` results.

`allow_if` composes a list of predicate callables into an authorizer
rule. Pass `all=[...]` to require every predicate to return `Ok`, or
`any=[...]` to require at least one. The two are mutually exclusive —
exactly one keyword is allowed.

**Incorrect (passing both `all` and `any`):**

```python
allow_if(all=[has_verified_token], any=[is_app_internal])  # asserts at runtime
```

**Correct (one or the other):**

```python
from reboot.aio.auth.authorizers import (
    allow_if, has_verified_token, is_app_internal,
)


def authorizer(self):
    # Caller must be authenticated AND match some other condition.
    return allow_if(all=[has_verified_token, my_predicate])


def authorizer(self):
    # Either internal-app calls OR authenticated user-facing calls work.
    return allow_if(any=[is_app_internal, has_verified_token])
```

## Built-In Predicates

Three predicates are shipped:

- `has_verified_token` — caller has a verified auth token.
- `is_app_internal` — call is from the app itself (another Reboot
  servicer, not an external client).
- `state_id_is_user_id` — the caller's `user_id` equals the actor's
  state ID. Useful for per-user resources.

See `auth-built-in-predicates.md` for details.

## Evaluation Order Matters for `all`

Predicates are invoked one at a time. For `all=[...]`, list cheap or
authentication-establishing predicates first — later predicates can rely
on earlier ones having returned `Ok` (so e.g. a predicate that reads
`context.auth.user_id` can come after `has_verified_token`).

## Short-Circuiting

`all` short-circuits on the first `PermissionDenied` or
`Unauthenticated`. `any` short-circuits on the first `Ok`.

## Aggregated Decision

When `any=[...]` runs out without finding an `Ok`:

- If at least one predicate returned `PermissionDenied`, the aggregate
  is `PermissionDenied`.
- Otherwise (all returned `Unauthenticated`), the aggregate is
  `Unauthenticated`.

This shape lets callers know whether to retry with auth (the call was
unauthenticated) or stop trying entirely (denied).

## Stdlib Uses It Internally

`OrderedMapServicer` defaults to
`allow_if(all=[is_app_internal])` — only other Reboot code in the same
app can call it. Apply the same pattern when a stdlib-style helper
shouldn't be reachable from outside.
