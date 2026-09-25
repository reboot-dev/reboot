---
title: Built-In Authorizer Predicates
impact: HIGH
impactDescription: The three shipped predicates cover most auth needs without custom code
tags: auth, predicate, has_verified_token, is_app_internal, state_id_is_user_id
---

## Built-In Authorizer Predicates

> **Critical:** three shipped predicates cover most needs:
> `has_verified_token` (any verified caller), `is_app_internal`
> (only same-app internal calls — the right gate for stdlib-style
> helpers), `state_id_is_user_id` (per-user resources where actor IDs
> are user IDs). Compose via `allow_if(all=[...])` / `allow_if(any=[...])`.

`reboot.aio.auth.authorizers` ships three predicate callables. Each takes
keyword args and returns one of `Ok` / `Unauthenticated` /
`PermissionDenied`. Compose them via `allow_if`.

### `has_verified_token`

```python
def has_verified_token(*, context: ReaderContext, **kwargs):
    if context.auth is None:
        return Unauthenticated()
    return Ok()
```

Returns `Ok` when the caller has any verified auth token. It does **not**
verify that the token's user is registered with the application — only
that the token itself is valid. Use it as a baseline gate; combine with
other predicates for "authenticated AND \_\_\_".

```python
return allow_if(all=[has_verified_token, can_access_resource])
```

### `is_app_internal`

```python
def is_app_internal(*, context: ReaderContext, **kwargs):
    if context.app_internal:
        return Ok()
    return PermissionDenied()
```

Returns `Ok` when the call originates from inside the same Reboot app
(another Servicer calling this one). External clients always get
`PermissionDenied`. This is the right gate for stdlib-style internal
helpers.

```python
# The OrderedMap servicer's default:
return allow_if(all=[is_app_internal])
```

### `state_id_is_user_id`

```python
def state_id_is_user_id(*, context: ReaderContext, **kwargs):
    if context.auth is None or context.auth.user_id is None:
        return Unauthenticated()
    if context.auth.user_id == context.state_id:
        return Ok()
    return PermissionDenied()
```

Returns `Ok` only when the actor's `state_id` equals the caller's
authenticated `user_id`. Use this when an actor _is_ a user — e.g.
`UserProfileServicer` whose state IDs are user IDs.

```python
return allow_if(all=[state_id_is_user_id])
```

## Common Compositions

```python
# Internal-only:
allow_if(all=[is_app_internal])

# Public to authenticated users:
allow_if(all=[has_verified_token])

# Authenticated and matching the actor's user-keyed identity:
allow_if(all=[state_id_is_user_id])  # implies has_verified_token

# Either internal call or authenticated user:
allow_if(any=[is_app_internal, has_verified_token])
```

## Self-Scheduled Workflows Need `is_app_internal`

If your Servicer has methods that schedule workflows on the
**same actor** (`self.ref().schedule().<workflow>(context)`),
the workflow runs **app-internally** — it has no bearer token,
even when the original transaction was authenticated as a user.
Authorizers gated only on user identity will deny the framework's
scheduled call:

```python
# WRONG — user-only auth blocks the framework's scheduled
# workflow on the same actor.
def authorizer(self):
    return allow_if(all=[state_id_is_user_id])

async def place(self, context: TransactionContext, request):
    # Place is called by the user (alice), but `pay` is scheduled
    # — runs as an app-internal workflow with no token.
    await self.ref().schedule().pay(context)
    # → at workflow launch, auth check on `Pay` raises
    #   `Unauthenticated`; `Place` gets aborted.

# RIGHT — accept either the owner OR an internal call.
def authorizer(self):
    return allow_if(any=[state_id_is_user_id, is_app_internal])
```

Use `any=[state_id_is_user_id, is_app_internal]` whenever the
actor has self-scheduled workflows. The pattern is canonical
for "user-owned actors with background work."

## Predicates Always Take `**kwargs`

Predicates receive `context`, `state`, and `request` keyword args. Always
include `**kwargs` in the signature so newly-added args don't break the
predicate. The shipped predicates follow this convention; mirror it in
your own (see `auth-custom-predicates.md`).
