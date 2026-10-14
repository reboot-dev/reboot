---
title: Calls Carry `context.auth` Through the Application
impact: HIGH
impactDescription: Nested calls carry who is acting, so writers can record it and owner rules still match; readers must not depend on it
tags: auth, context.auth, propagation, app_internal, audit, nested, reader, cache
---

## Calls Carry `context.auth` Through the Application

> **Critical:** a call made from inside a servicer method carries the
> caller's `context.auth` to the callee, and the call is still
> app-internal. So a nested writer or constructor can record who
> acted, and both an owner rule and `is_app_internal` match it. What
> is **not** carried: the bearer token, and anything into a scheduled
> call. Keep `context.auth` out of reader bodies: a reader's answer
> must depend on state and request only.

When a method calls another servicer — `Service.ref(id).method(context)`,
`Service.create(context, id)`, `self.ref().method(context)` — the callee
gets:

| On the callee's `context`     | Value                                                     |
| ----------------------------- | --------------------------------------------------------- |
| `context.auth`                | The caller's `context.auth`, however deep the call goes.  |
| `context.app_internal`        | `True` — the call comes from inside the same application. |
| `context.caller_bearer_token` | `None` — the token itself is never passed on.             |

No `context.auth` on the caller (an unauthenticated external call, a
scheduled call) means none on the callee.

## Record Who Acted in Writers and Transactions

Because the identity follows the call, a nested writer or constructor
can record it, so every mutation in a chain is attributable to the
signed-in person who started it:

```python
from reboot.aio.contexts import TransactionContext, WriterContext


class BankServicer(Bank.Servicer):

    async def sign_up(
        self,
        context: TransactionContext,
        request: Bank.SignUpRequest,
    ) -> None:
        # Verified at the edge as the signed-in person. `Account.open`
        # sees the same `context.auth`, and no bearer token.
        await Account.open(context, request.account_id)


class AccountServicer(Account.Servicer):

    async def open(
        self,
        context: WriterContext,
        request: Account.OpenRequest,
    ) -> None:
        if context.constructor:
            self.state.balance = 0
            # Audit: the person `sign_up` ran for, not "the bank".
            self.state.opened_by = (
                context.auth.user_id if context.auth is not None else None
            )

    async def deposit(
        self,
        context: WriterContext,
        request: Account.DepositRequest,
    ) -> None:
        self.state.balance += request.amount
        if context.auth is not None:
            self.state.last_modified_by = context.auth.user_id
```

Keep the `context.auth is not None` check where the method can also be
reached with no identity, such as from a scheduled call (below); let
the authorizer, not an `assert` in the body, decide whether such a
caller is admitted.

## Authorizers See the Carried Identity

Rules are evaluated against the callee's `context.auth`, so:

- `has_verified_token` and owner-style predicates (`state_id_is_user_id`,
  a custom `is_owner`) pass for a nested call made on behalf of a
  signed-in person. `allow_if(all=[has_verified_token])` admits such a
  call; it rejects only internal calls made with no identity.
- `is_app_internal` passes for every nested call; carrying an identity
  does not make a call external.
- `allow_if(any=[state_id_is_user_id, is_app_internal])` stays the
  canonical rule for user-owned actors with background work
  (`auth-built-in-predicates.md`).

## What Is Not Carried

- **The bearer token.** `context.caller_bearer_token` is `None` one hop
  in. The identity is a snapshot from the hop that verified the token;
  a nested call neither re-verifies nor forwards it.
- **Into scheduled calls.** `self.ref().schedule().method(context)` and
  a scheduled `Workflow` run later with **no** `context.auth`, even when
  the scheduling transaction had one. Persist whatever identity the
  later work needs in state at scheduling time (e.g. `requested_by`).
- **Past an explicit bearer token.** Setting a token on the call
  (`Options(bearer_token=...)`, `Service.ref(id, bearer_token=...)`)
  makes the callee verify _that_ token instead; the caller's
  `context.auth` is not sent alongside it. Do this only to act _as_
  somebody in particular.

## Keep `context.auth` Out of Reader Bodies

A reader's response must be a function of the actor's state and the
request only. Do not compute anything from `context.auth` inside a
reader body:

**Incorrect (per-caller answer):**

```python
async def summary(
    self,
    context: ReaderContext,
) -> Doc.SummaryResponse:
    return Doc.SummaryResponse(
        text=self.state.text,
        # WRONG: ties the answer to this one caller.
        can_edit=context.auth.user_id == self.state.owner_id,
    )
```

**Correct (the authorizer decides who may read; the body answers the same for all of them):**

```python
class DocServicer(Doc.Servicer):

    def authorizer(self):
        return allow_if(all=[has_verified_token, is_member])

    async def summary(
        self,
        context: ReaderContext,
    ) -> Doc.SummaryResponse:
        # Every admitted caller gets this; a caller knows who they
        # are and can compare against `owner_id` themselves.
        return Doc.SummaryResponse(
            text=self.state.text,
            owner_id=self.state.owner_id,
        )
```

Why: Reboot will cache reader results and serve one result to every
caller the authorizer admits. A reader whose body reads
`context.auth` is either uncacheable or cacheable only per caller,
which is of little use. Put "who may see this" in the authorizer and
"what was recorded for whom" in state written by a writer. Reading
`context.auth` in an **authorizer** or in a **writer / transaction /
workflow** is fine; the audit pattern above depends on it.

## See Also

- `auth-built-in-predicates.md` — `has_verified_token`,
  `is_app_internal`, `state_id_is_user_id`, and why self-scheduled
  workflows need `is_app_internal`.
- `auth-custom-predicates.md` — owner-style predicates that read
  `context.auth.user_id`.
- `servicer-reader.md` — reader semantics.
- `auth-external-api-calls.md` — a bearer token set on purpose: calling
  out as the user with their provider token.
