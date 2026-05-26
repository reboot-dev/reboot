---
title: `allow()` and `deny()` — Narrow Uses, Not Defaults
impact: HIGH
impactDescription: `allow()` is for genuinely public endpoints; do not use it to silence dev-mode auth warnings
tags: auth, allow, deny, authorizer, rule
---

## `allow()` and `deny()` — Narrow Uses, Not Defaults

> **Critical:** `allow()` is **not** the "default" authorizer to slap
> on every Servicer. In `rbt dev` you can omit `authorizer()` entirely;
> the runtime allows the call and logs a warning that flags real
> production work. See `servicer-authorizer.md` for the dev-vs-prod
> rules.

`allow()` returns an `Ok` decision for every call. `deny()` returns
`PermissionDenied` for every call. Both are valid authorizer rule
_instances_, but each has a narrow legitimate use; neither is a
sensible default for application Servicers.

## When `allow()` Is Acceptable

`allow()` means "any caller on the public internet may invoke this
method, anonymously." There is exactly one legitimate use:

- **Intentionally public endpoints** you've consciously decided to
  expose to the world unauthenticated — e.g. a health check, an
  unauthenticated catalog read, a public sign-up endpoint. Open access
  is the product, not an accident.

That's it. In particular, `allow()` is **not** appropriate for:

- **"Methods only called from inside the app."** Every Reboot method
  is reachable from the internet by default — there is no network
  boundary that makes a method app-internal. If you want to enforce
  app-internal-only, say so: `allow_if(all=[is_app_internal])`. Using
  `allow()` here is a security hole the moment someone discovers the
  endpoint.
- **Examples, tutorials, and scaffolding.** Don't write `allow()` "to
  make the example work" — omit `authorizer()` entirely. The example
  then runs in `rbt dev` (with the runtime's missing-auth warning) and
  refuses to start serving externally without real auth, which is the
  correct teaching signal.

For everything else — anything reachable from a browser, an MCP
client, an external service, or any caller you'd want to identify —
compose an `allow_if(...)` rule with predicates from
`auth-built-in-predicates.md` and/or `auth-custom-predicates.md`.

## When `allow()` Is NOT a Substitute

Common anti-patterns the agent should refuse:

- "Add `allow()` to every Servicer so dev warnings stop." Don't. The
  warning is the TODO list for production auth.
- "Use `allow()` everywhere now; tighten before shipping." This
  approach loses track of _which_ Servicers needed real rules, and the
  `allow()` calls survive into production code.
- "Use `allow()` because there's no auth yet." Pick the right
  identity wiring for your app instead:
  `Application(oauth=OAuthProviderByEnvironment(dev=Development(), prod=...))`
  gives every caller a verified `dev-{hash}` identity in dev (and a real
  one in prod), letting you write real `allow_if(...)` rules from day
  one — typical for MCP/chat apps; and `Application(token_verifier=...)`
  integrates an external IdP (typical for web apps; until it's wired,
  omit `authorizer()` so the dev-mode warning flags what's
  outstanding). See `servicer-authorizer.md` for the full table.

## `deny()` for Locked-Out Methods

`deny()` blocks **all** callers — including app-internal ones. There
is no carve-out for other servicers in the same app. Its narrow
legitimate use is temporarily disabling a method without removing it
from the API file (e.g. a deprecated endpoint you haven't deleted
yet).

If your intent is "only other servicers in the same app may call
this," that's `allow_if(all=[is_app_internal])`, not `deny()`.

```python
from reboot.aio.auth.authorizers import deny

def authorizer(self):
    return deny()
```

## Return an Instance, Not the Function

When you do call `allow()` or `deny()`, construct the rule — don't
return the function reference. This is the single most common bug
when writing authorizers:

```python
# Wrong — function reference, not a rule:
def authorizer(self):
    return allow

# Right — constructed rule instance:
def authorizer(self):
    return allow()
```

## Decision Outcomes

A rule's `execute` returns one of three outcomes:

| Outcome            | Meaning                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `Ok`               | Allow the call.                                                   |
| `Unauthenticated`  | No valid identity attached. Caller should retry with credentials. |
| `PermissionDenied` | Identity is fine but is not allowed to perform this action.       |

`allow()` always returns `Ok`; `deny()` always returns
`PermissionDenied`.

## One Authorizer per Servicer

`def authorizer(self)` returns a single rule that applies to every
method on the Servicer. Per-method differentiation (e.g. allow reads
but gate writes) requires a custom authorizer subclass — see
`auth-custom-predicates.md`.
