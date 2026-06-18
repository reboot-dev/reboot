---
title: Schema Evolution Is Additive-Only on Deployed Applications
impact: CRITICAL
impactDescription: Backwards-incompatible API changes make a deployed application fail to boot
tags: api, schema, evolution, backwards-compatibility, migration, deploy, expunge
---

## Schema Evolution Is Additive-Only on Deployed Applications

> **Critical:** once an application has persisted state, every new
> version of its API is validated at boot against the schema that
> state was written with. Deleting a state type, method, or field —
> renaming a state type or method — or changing a field's type or
> tag — is backwards-incompatible: the application refuses to boot
> and the deploy fails. Evolve schemas additively: add new methods
> and fields rather than deleting or repurposing existing ones.
> (Renaming a _field_ is fine as long as its `tag` is unchanged.)

Reboot persists every actor's state durably, together with the
schema it was written under. On startup the runtime compares the
application's current API against that stored schema. If any change
is backwards-incompatible, boot fails with:

```text
Updated state or method definitions are not backwards compatible.
Consider reverting backwards incompatible changes or, if you don't
care about backwards compatibility, using `expunge` to clear all
data from this app to begin with a clean slate.
```

followed by a list of the specific incompatible changes (e.g.
`` Method `close` was deleted from servicer type `account.Account`  ``).

This gate is identical everywhere state persists: `rbt dev run`
(when persistence is on via `--application-name=...`), `rbt serve`,
and Reboot Cloud. Only the recovery options differ — see "Recovering
From a Rejected Deploy" below. This is a safety net, not an
obstacle: it stops a deploy that would have corrupted or orphaned
live data, before any damage is done.

## What's Allowed vs. Forbidden

| Change                                                          | Compatible?                |
| --------------------------------------------------------------- | -------------------------- |
| Add a new state `Type`                                          | yes                        |
| Add a new method to an existing `Type`                          | yes                        |
| Add a field with a (zero-value) default                         | yes                        |
| Rename a field, keeping its `tag`                               | yes (data is keyed by tag) |
| Rename a request/response `Model` class                         | yes (names are internal)   |
| Change a method between `Writer` and `Transaction`              | yes                        |
| Add or remove declared `errors=`                                | yes                        |
| Change `mcp=` options (add/remove/modify `Tool()`)              | yes                        |
| Delete a state `Type`                                           | **NO**                     |
| Rename a state `Type`                                           | **NO** (a delete + an add) |
| Delete a method                                                 | **NO**                     |
| Rename a method                                                 | **NO** (a delete + an add) |
| Delete a field                                                  | **NO**                     |
| Change a field's `tag`                                          | **NO** (a delete + an add) |
| Change a field's type                                           | **NO**                     |
| Change `list[T]` ↔ scalar                                       | **NO**                     |
| Add a field without a default, or remove a default from a field | **NO**                     |
| Any other method-kind change (e.g. `Writer` → `Workflow`)       | **NO**                     |

Notes on the subtle rows:

- **Renames are deletes.** States are matched by name and methods
  are matched by name, so renaming either one looks to the
  validator — and to persisted data, scheduled tasks, and deployed
  clients — like deleting the old one and adding a new one. Fields,
  by contrast, are matched by `tag`, so renaming a field while
  keeping its `tag` preserves all persisted data.
- **`Writer` ↔ `Transaction` is the only legal kind change**, and
  only when the other options on the method (e.g. `factory=True`)
  stay the same. Changing a `Reader` to a `Writer`, a `Writer` to a
  `Workflow`, etc. is rejected.
- **Field deletion is rejected everywhere** — in state models _and_
  in request/response models — and there is no escape hatch short
  of `expunge`.
- **A field's required-ness can't change in either direction**:
  removing a field's default (making it required) and adding a
  default to a previously-required field are both rejected.
- **Request and response models follow the same field rules** as
  state models: fields may be added (with defaults) but not removed
  or changed. The class names you pass to `request=` / `response=`
  are internal and may change freely; the generated names come from
  the method name.

## Why Deletion Is Forbidden

Durable state can hold data in any field that was ever written.
Scheduled tasks and in-flight workflows persist across deploys and
reference methods by name; deployed clients (browsers, MCP hosts,
other services) may still call any method that was ever exposed.
Deleting any of these strands data or breaks callers, so Reboot
rejects the deploy instead.

## Evolving Safely: the Additive Playbook

Plan APIs knowing that **deployment is a one-way door**: anything
shipped to an application with live data stays in the schema until
the data is expunged. When you need to "change" something:

**Change a method's signature or semantics** — add a new method and
migrate callers; keep the old method as a delegating shim. For
example, suppose `deposit` takes `amount: float` (dollars) and you
want integer cents to avoid rounding errors. Changing the type of
`amount` in `DepositRequest` would be rejected, so the new shape
gets a new method instead:

```python
api = API(
    Account=Type(
        state=AccountState,
        methods=Methods(
            # Old method (`amount: float`, dollars): kept, since
            # removal — or making `amount` optional in favor of a
            # new `cents: int` field on the same request — would
            # be rejected. Its servicer implementation now
            # converts and delegates to the logic behind
            # `deposit_cents`.
            deposit=Writer(
                request=DepositRequest, response=None, mcp=None,
            ),
            # New method with the corrected request shape
            # (`amount_cents: int`).
            deposit_cents=Writer(
                request=DepositCentsRequest, response=None,
                mcp=None,
            ),
        ),
    ),
)
```

**Change a field's type or shape** — add a new field with a new
`tag`, and migrate lazily inside writers: when a writer touches an
actor that still has data only in the old field, copy it into the
new field. The old field stays declared (reads as its zero value
once unused) — that is expected and harmless.

```python
class CartState(Model):
    # Old shape: kept; no longer written.
    item_names: list[str] = Field(tag=1, default_factory=list)
    # New shape.
    items: list[CartItem] = Field(tag=2, default_factory=list)
```

**Restructure state across types** — add the new `Type` alongside
the old one and migrate actors on access (or via a `Workflow` that
walks them). Don't delete the old `Type`; once empty and unused it
is inert.

## Recovering From a Rejected Deploy

The new application version exits at boot listing each incompatible
change (under `rbt dev run` and `rbt serve` the process exits with
code 13). The **running version keeps serving on Reboot Cloud** —
a rejected `rbt cloud up` does not take the live app down. Choose
one:

1. **Revert the incompatible change** (the default, and the only
   option that preserves data): restore the deleted/renamed
   method/field/type, then apply the additive playbook above
   instead.
2. **Expunge** — irreversibly delete _all_ of the application's
   state and start from a clean schema. Only acceptable in
   development or when the data is disposable. **Never expunge a
   production application without explicit human confirmation.**
   - `rbt dev run`: the default `--on-backwards-incompatibility=ask`
     prompts — press `x` to expunge, or fix the code and it reloads.
     Set `=expunge` to wipe automatically or `=fail` to never
     prompt. Outside a running session:
     `rbt dev expunge --application-name=<app>`.
   - `rbt serve`: delete the application's data under the directory
     passed as `--state-directory`.
   - Reboot Cloud: `rbt cloud down --api-key=...` (brings the
     application down **and expunges its state**), then
     `rbt cloud up` the new version.

## Checklist Before Changing a Deployed API

- [ ] Am I only _adding_ states, methods, and (defaulted) fields?
- [ ] Did I avoid renaming any state type or method? (Field renames
      are fine if the `tag` is unchanged.)
- [ ] Did every existing field keep its `tag`, type, and
      list-vs-scalar shape?
- [ ] Did every method keep its kind (`Writer` ↔ `Transaction`
      excepted), `factory=` setting, and request/response structure?
- [ ] If I need a breaking change anyway: did I use the additive
      playbook, or get explicit confirmation that expunging all data
      is acceptable?
