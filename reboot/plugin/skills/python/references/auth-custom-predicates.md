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

## Annotate Predicates, or `mypy` Fails

The examples above are unannotated for brevity, but a project that
runs `mypy` needs the annotations — without them `allow_if` reports
`Argument "any" ... has incompatible type "list[function]"; expected "Sequence[AuthorizerCallable[...]]"`, and a helper that returns a
rule reports `Need type annotation`. The shapes that type-check:

Annotate `state` with the **pydantic state model from your API
definition** — the same `<X>State` class you declared in
`api/<pkg>/v1/<name>.py`. That is what the runtime passes: in a
pydantic app a predicate receives `<pkg>.v1.<name>.TaskListState`.

> **Not** `<Type>Authorizer.StateType` / `.RequestTypes`. The
> generated `<Type>Authorizer` class does expose those aliases, but
> they name the **protobuf** types (`<name>_pb2.TaskList`), which is
> not what a pydantic app's predicate is handed. They type-check —
> protobuf and pydantic carry the same field names — while
> describing the wrong class, which is worse than `Any`.

```python
from typing import Any

import rbt.v1alpha1.errors_pb2 as errors
from reboot.aio.auth.authorizers import (
    Authorizer,
    AuthorizerRule,
    allow_if,
    is_app_internal,
)
from reboot.aio.contexts import ReaderContext
from <pkg>.v1.<name> import TaskListState


def is_owner_or_member(
    *,
    context: ReaderContext,
    state: TaskListState | None = None,
    **kwargs: Any,
) -> Authorizer.Decision:
    if context.auth is None or context.auth.user_id is None:
        return errors.Unauthenticated()
    if state is not None and state.owner_id == context.auth.user_id:
        return errors.Ok()
    return errors.PermissionDenied()


# A helper that returns a rule needs its return type spelled out.
def owner_or_member() -> AuthorizerRule[TaskListState, Any]:
    return allow_if(any=[is_owner_or_member, is_app_internal])
```

**Declare only the arguments the body reads.** The runtime passes
`context`, `state`, and `request` by keyword; a predicate that never
looks at `request` simply omits it and lets `**kwargs: Any` absorb
it. That is also why `**kwargs` is mandatory — it is what keeps the
predicate working when the runtime starts passing something new.

When the body _does_ read `request`, declare it. One rule covers
every method on the Servicer, so what arrives is a union of all of
their request models — which is common, because restricting the
internal-only methods means telling the methods apart:

```python
def task_list_access(
    *,
    context: ReaderContext,
    state: TaskListState | None = None,
    request: Any = None,
    **kwargs: Any,
) -> Authorizer.Decision:
    # Methods only app-internal code may call.
    if isinstance(request, (CreateRequest, AcceptTaskRequest)):
        return errors.Ok() if context.app_internal else errors.PermissionDenied()
    ...
```

Annotate it `Any` and narrow with `isinstance`, or spell out the
union of the request models it actually distinguishes.

**Check that the annotation is actually doing something.** These
types only bite if mypy can resolve the API package: `mypy_path`
must include the project-root `api/`, and the "don't check generated
code" stanza must name `<pkg>.v1.<name>_rbt` rather than
`<pkg>.v1.*` — a blanket ignore silences your own API module, and
then `TaskListState` is `Any` and a misspelled field passes a green
mypy run. See `lifecycle-project-setup.md`.

## Predicate Signatures

The runtime invokes a predicate with at minimum these keyword args:
`context` (always a `ReaderContext`), `state` (the actor state, possibly
`None`), and `request` (the request message, possibly `None`). Declare
the ones the body reads, keyword-only, and always include `**kwargs`
so the arguments you didn't declare — and any the runtime adds later
— land there harmlessly.

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

## The Error Types a Predicate Returns

They come from `rbt.v1alpha1.errors_pb2`; a predicate only ever
returns `Ok`, `Unauthenticated`, or `PermissionDenied`. The module
also carries the framework errors a call can abort with, which is
what a typed error union widens to:

```
Ok  Unauthenticated  PermissionDenied  NotFound  AlreadyExists
InvalidArgument  FailedPrecondition  OutOfRange  ResourceExhausted
DeadlineExceeded  Cancelled  Unavailable  Unimplemented  Internal
Unknown  DataLoss  Aborted  StateNotConstructed
StateAlreadyConstructed  UnknownService  UnknownTask  InvalidMethod
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
