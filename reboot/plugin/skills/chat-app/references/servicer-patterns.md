---
title: Servicer Patterns — User Front Door, Workflow Magic, Scheduling
impact: CRITICAL
impactDescription: Three chat-app-specific servicer patterns layered on top of `python`'s Servicer rules. The User-side `create_<X>` Transaction is the front door for every application-type instance; Workflow methods need `MyType.ref()` (no-arg) magic instead of `cls.ref()` or `self.ref()`; workflows kicked off from a Transaction must be `.schedule()`-d, not awaited.
tags: servicer, user, transaction, workflow, ref, schedule, classmethod, inline-writer, per_workflow, per_iteration, always
---

## Servicer Patterns — User Front Door, Workflow Magic, Scheduling

The base Servicer pattern, context types, and core trips
(`self.ref().state_id` not `self.state_id`, kwargs not Request
wrappers, raise typed `<Method>Aborted`) are in
`python/references/servicer-*.md`, `rpc-refs.md`, `rpc-calls.md`,
`api-errors.md`. What's _MCP-Chat-App-specific_:

- One Servicer class per type — `UserServicer` plus one per
  application type.
- The User Servicer's `create_<X>` Transaction calls
  `<X>.create(context)` and returns the `state_id` in a response.
- Workflow Servicers use `MyType.ref()` (no args, picks up `state_id`
  from `WorkflowContext`) — see Gotcha #11 below; `cls.ref()` and
  `self.ref()` are both wrong.
- Workflows that should run after a User-side `create_<X>`
  Transaction must be **scheduled** (`.schedule().workflow_method()`),
  not awaited directly — see Gotcha #12.

## Simple Servicer (Counter)

```python
from ai_chat_counter.v1.counter_rbt import Counter, User
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)


class UserServicer(User.Servicer):

    async def create_counter(
        self,
        context: TransactionContext,
    ) -> User.CreateCounterResponse:
        """Create a new Counter and return its ID."""
        # Factory create: pass request fields as keyword args directly
        # — do NOT wrap in a Request object.
        # No-args:    Counter.create(context)
        # With args:  Counter.create(context, title="...", count=0)
        counter, _ = await Counter.create(context)
        return User.CreateCounterResponse(
            counter_id=counter.state_id,
        )


class CounterServicer(Counter.Servicer):

    async def create(self, context) -> None:
        # State is initialized with zero defaults; nothing to do.
        pass

    async def increment(
        self,
        context: WriterContext,
        request: Counter.IncrementRequest,
    ) -> None:
        self.state.value += request.amount

    async def decrement(
        self,
        context: WriterContext,
        request: Counter.DecrementRequest,
    ) -> None:
        self.state.value -= request.amount

    async def get(
        self,
        context: ReaderContext,
    ) -> Counter.GetResponse:
        return Counter.GetResponse(value=self.state.value)
```

## Workflow Servicer (`MyType.ref()` magic)

Workflow methods are `@classmethod` — no `self`, no `self.state`. To
call back into the current instance, use the **state class** imported
from `<name>_rbt` (e.g. `MyType.ref()`), NOT `cls`. Inside a Workflow,
calling `<StateClass>.ref()` with no arguments is special: it picks
up the current `state_id` from `WorkflowContext` automatically, so
`MyType.ref()` resolves to a ref to the running workflow's own
instance.

```python
from datetime import timedelta
from reboot.aio.contexts import WorkflowContext
# Import the state class — this is what `.ref()` is called on, NOT
# `cls`. `cls` inside the classmethod is `MyTypeBaseServicer`.
from <pkg>.v1.<name>_rbt import MyType


class MyTypeServicer(MyType.Servicer):

    @classmethod
    async def do_ping_periodically(
        cls,
        context: WorkflowContext,
        request: MyType.DoPingPeriodicallyRequest,
    ) -> MyType.DoPingPeriodicallyResponse:
        async for iteration in context.loop(
            "Ping periodically",
            interval=timedelta(seconds=request.period_seconds),
        ):
            # `MyType.ref()` with no args is Workflow-only magic: it
            # reads `state_id` from `WorkflowContext`, returning a
            # ref to this workflow's own instance. Do NOT write
            # `cls.ref()` or `self.ref()` here — see Gotcha #11.
            await MyType.ref().do_ping(context)
            pings_sent = iteration + 1  # iteration starts at 0.
            if pings_sent >= request.num_pings:
                break

        # `.read()` is only valid on the workflow's own no-arg ref;
        # a foreign-state read like `OtherType.ref(id).read(context)`
        # raises a "only supported within workflows" RuntimeError.
        # Call a Reader method on the foreign type instead — see
        # Gotcha #15.
        state = await MyType.ref().read(context)
        return MyType.DoPingPeriodicallyResponse(
            num_pings=state.num_pings,
        )
```

### Inline Writers for Workflow-Only State Changes

When a mutation is only ever performed by this workflow, _don't_
add a separate `store_xxx` Writer to the API just so the workflow
can call it. Pass an `async (state) -> ...` function to a scoped
inline writer:
`.per_workflow("alias").write(context, fn)` (once for the entire
workflow), `.per_iteration("alias").write(context, fn)` (once per
`context.loop` iteration), or `.always().write(context, fn)` (on
every replay).

```python
async def increment_count(state):
    state.num_pings += 1

# Once for the whole workflow lifetime — captures the outcome and
# replays return the memoized no-op.
await MyType.ref().per_workflow(
    "Increment ping count",
).write(context, increment_count)
```

The alias is a human-readable string that survives workflow
restarts — `.per_workflow("X")` runs the writer at most once per
alias for the workflow lifetime; `.per_iteration("X")` runs it
once per loop iteration. Reserve declared Writers in the API for
operations also called from outside the workflow.

For "run every time" (e.g. re-fetching a remote value on each
loop iteration), use `.always().write(context, fn)`.

**Never** wrap an inline writer in `at_least_once` / `at_most_once`
/ `.idempotently("alias")`. Inline writers are Reboot-internal and
already durable — scope is the only knob. See
`python/references/servicer-workflow.md`.

The inline writer's parameter must be named **`state`** — the
runtime calls the callback as `writer(state=typed_state)`, so
`async def make_move(s):` raises
`TypeError: ... got an unexpected keyword argument 'state'`. See
also `python/references/servicer-workflow.md`.

## Scheduling a Workflow from a Transaction

A workflow can only be `await`-ed directly from an `ExternalContext`
(e.g. a bootstrap script) or from another `WorkflowContext`. In **any**
other context — most commonly a `TransactionContext` kicking off a
workflow on a state it just created — the workflow must be
**scheduled**, not awaited directly. Use `.schedule()` to
fire-and-forget from a transaction:

```python
class UserServicer(User.Servicer):

    async def create_game(
        self,
        context: TransactionContext,
        request: User.CreateGameRequest,
    ) -> User.CreateGameResponse:
        game, _ = await Game.create(context, ...)
        # GOOD — schedule the workflow from the transaction.
        # Empty request: just pass `context`.
        await Game.ref(game.state_id).schedule().autoplay(context)
        # Workflow with fields: pass them as kwargs.
        await Game.ref(game.state_id).schedule().do_ping_periodically(
            context,
            num_pings=10,
            period_seconds=1.0,
        )
        # BAD — wrapping in `request=` raises
        # `TypeError: ... got an unexpected keyword argument 'request'`:
        # await Game.ref(game.state_id).schedule().autoplay(
        #     context, request=Game.AutoplayRequest()
        # )
        # BAD — awaiting a workflow directly from a Transaction raises
        # `TypeError: ... '<Method>' is a workflow and must be
        # scheduled from a 'TransactionContext' via
        # `await [...].schedule([...]).<Method>(context, [...])`:
        # await Game.ref(game.state_id).autoplay(context)
        return User.CreateGameResponse(game_id=game.state_id)
```

`.schedule(when=timedelta(...))` delays the workflow by a duration.
`.schedule()` with no argument starts it as soon as the transaction
commits.

Same rule from a `WriterContext` or `ReaderContext`: use
`.schedule()`. Only `ExternalContext` and `WorkflowContext` can await
a workflow directly.
