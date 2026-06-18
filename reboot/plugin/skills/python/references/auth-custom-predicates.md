---
title: Write Custom Authorizer Predicates
impact: MEDIUM
impactDescription: App-specific access rules require custom predicates; the shipped ones aren't enough alone
tags: auth, custom, predicate, allow_if, async, sync
---

## Write Custom Authorizer Predicates

> **Critical:** signature must be keyword-only with `**kwargs`:
> `(*, context, state, request, **kwargs) -> Ok | Unauthenticated | PermissionDenied`. Positional args break dispatch; missing `**kwargs`
> breaks when the runtime adds new keyword args.

A predicate is a plain callable matching the signature
`(*, context, state, request, **kwargs) -> Ok | Unauthenticated | PermissionDenied`.
It can be sync or async; `allow_if` handles both. Pass it inside
`allow_if(all=[...])` or `allow_if(any=[...])`.

**Incorrect (positional args, no `**kwargs`):\*\*

```python
def can_edit(context, state, request):  # WRONG signature shape
    if context.auth.user_id == state.owner_id:
        return Ok()
    return PermissionDenied()
```

**Correct (keyword-only with `**kwargs`):\*\*

```python
import rbt.v1alpha1.errors_pb2 as errors


def is_owner(*, context, state, request, **kwargs):
    if context.auth is None or context.auth.user_id is None:
        return errors.Unauthenticated()
    if state is not None and state.owner_id == context.auth.user_id:
        return errors.Ok()
    return errors.PermissionDenied()


class DocServicer(Doc.Servicer):
    def authorizer(self):
        return allow_if(all=[has_verified_token, is_owner])
```

## Async Predicates Work Too

Predicates can be `async def`. `allow_if` awaits them when needed:

```python
async def is_team_member(*, context, state, request, **kwargs):
    # `members` is a declared `Reader` method on `Team` — reading
    # another actor always goes through its declared `Reader`s.
    response = await Team.ref(state.team_id).members(context)
    if context.auth.user_id in response.member_ids:
        return errors.Ok()
    return errors.PermissionDenied()


def authorizer(self):
    return allow_if(all=[has_verified_token, is_team_member])
```

## Predicate Signatures

The runtime invokes a predicate with at minimum these keyword args:
`context` (always a `ReaderContext`), `state` (the actor state, possibly
`None`), and `request` (the request message, possibly `None`). Always
declare them as keyword-only and include `**kwargs` so signature
extensions don't break the predicate.

## Order Predicates by Cost in `all`

`allow_if(all=[...])` evaluates left to right and short-circuits on the
first non-`Ok`. List cheap auth-establishing predicates first
(`has_verified_token`) and expensive ones last (predicates that read
state from another actor):

```python
# Good — cheap auth check happens first.
return allow_if(all=[has_verified_token, expensive_team_check])

# Bad — expensive check runs even when caller isn't authenticated.
return allow_if(all=[expensive_team_check, has_verified_token])
```

## Distinguish `PermissionDenied` from `Unauthenticated`

Return `Unauthenticated` when the call has no identity at all (or no
identity is needed yet — the right answer is "log in"). Return
`PermissionDenied` when there _is_ an identity but it's not allowed to
do this. Clients use the distinction to decide between "redirect to
login" and "show 403".

## Per-Method Authorization

`def authorizer(self)` returns a single rule for all methods. To gate
methods individually, return a custom `Authorizer` subclass that
inspects the request type or method name (the framework dispatches by
request type). For most apps, splitting state into multiple Servicers
with different authorizers is simpler than building a per-method rule.
