---
title: Use `allow()` and `deny()` for Unconditional Rules
impact: HIGH
impactDescription: Without an authorizer, calls fail; `allow()`/`deny()` are the simplest correct shapes
tags: auth, allow, deny, authorizer, rule
---

## Use `allow()` and `deny()` for Unconditional Rules

> **Critical:** return a constructed rule **instance**, not the
> function reference: `return allow()`, not `return allow`. The
> latter is the most common authorizer bug.

The simplest authorizers are unconditional: `allow()` returns an `Ok`
decision for every call; `deny()` returns `PermissionDenied`. Return one
of them from `def authorizer(self)` on each Servicer.

**Incorrect (returning the function instead of the rule):**

```python
from reboot.aio.auth.authorizers import allow

class MyServicer(My.Servicer):
    def authorizer(self):
        return allow      # WRONG — function reference, not a rule
```

**Correct:**

```python
from reboot.aio.auth.authorizers import allow

class MyServicer(My.Servicer):
    def authorizer(self):
        return allow()    # constructed rule
```

## When `allow()` Is Acceptable

- Local dev / examples.
- Methods that are called only via `is_app_internal` paths (i.e. only by
  other Reboot servicers in the same app).
- Public read-only endpoints with intentionally open access.

For everything else, prefer `allow_if` with explicit predicates (see
`auth-allow-if.md`).

## `deny()` for Locked-Out Methods

`deny()` blocks all callers. It's primarily useful when temporarily
disabling a method without removing it from the proto, or when a method
should be reachable only through internal app flow (and a different
Servicer's authorizer covers that flow already).

```python
def authorizer(self):
    return deny()
```

## One Authorizer per Servicer

`def authorizer(self)` returns a single rule that applies to every
method on the Servicer. Per-method differentiation (e.g. allow reads but
gate writes) requires a custom authorizer subclass — see
`auth-custom-predicates.md`.

## Decision Outcomes

A rule's `execute` returns one of three outcomes:

| Outcome            | Meaning                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `Ok`               | Allow the call.                                                   |
| `Unauthenticated`  | No valid identity attached. Caller should retry with credentials. |
| `PermissionDenied` | Identity is fine but is not allowed to perform this action.       |

`allow()` always returns `Ok`; `deny()` always returns
`PermissionDenied`.
