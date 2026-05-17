---
title: Declare and Implement Workflow Methods
impact: HIGH
impactDescription: Workflows are durable, restartable functions; the wrong shape breaks replay
tags: workflow, WorkflowContext, classmethod, durable, replay
---

## Declare and Implement Workflow Methods

> **Critical:** workflow Servicer methods are **`@classmethod`** —
> there is no `self`, no `self.state`. Read state via
> `Service.ref().read(context)`, mutate via
> `Service.ref().write(context, fn)`. The body can re-execute on
> replay; primitives below memoize across replays.

A workflow is a long-running, durable function attached to an actor. The
runtime persists progress so the workflow can resume after a restart from
where it left off. Mark the method with `workflow: {}` in proto (or
`Workflow(...)` in pydantic), and implement it as a `@classmethod` on the
Servicer that takes a `WorkflowContext`.

**Incorrect (instance method, regular Servicer signature):**

```python
async def control_loop(
    self,
    context: WriterContext,  # WRONG — workflows need WorkflowContext
    request: ControlLoopRequest,
) -> ControlLoopResponse:
    ...
```

**Correct (canonical workflow shape):**

`chatbot.proto`:

```proto
rpc ControlLoop(ControlLoopRequest) returns (ControlLoopResponse) {
  option (rbt.v1alpha1.method) = {
    workflow: {},
  };
}
```

`chatbot.py`:

```python
from chatbot.v1.chatbot_rbt import (
    Chatbot, ControlLoopRequest, ControlLoopResponse,
)
from reboot.aio.contexts import WorkflowContext


class ChatbotServicer(Chatbot.Servicer):

    @classmethod
    async def control_loop(
        cls,
        context: WorkflowContext,
        request: ControlLoopRequest,
    ):
        # Workflow body — durable, restartable, can run for hours.
        ...
```

## Why `@classmethod`?

Workflows can re-execute (replay) after a restart. The runtime can't carry
instance attributes across replays, so the workflow method must not depend
on `self`. Marking it `@classmethod` makes that explicit and enforced.

Read state inside a workflow via `Service.ref().read(context)` (returns
`self.state`-equivalent); mutate state via
`Service.ref().write(context, callback)` (see `workflow-state-write.md`).

## Workflows Are Long-Lived

A workflow can run for seconds, hours, or days. The runtime checkpoints
progress at every memoized primitive (`at_most_once`, `at_least_once`,
`until`, `until_changes`) and at every `context.loop` iteration boundary,
so a restart resumes from the most recent checkpoint instead of starting
over.

## Schedule a Workflow Like Any Other Method

Workflows are typically kicked off from a `transaction` or `writer` via
the schedule API or directly:

```python
async def create(
    self, context: TransactionContext, request: CreateRequest,
) -> CreateResponse:
    self.state.channel_id = request.channel_id
    # Schedule the workflow to start.
    await self.ref().schedule().control_loop(
        context,
        name=request.name,
        channel_id=request.channel_id,
        prompt=request.prompt,
        human_in_the_loop=request.human_in_the_loop,
    )
    return CreateResponse()
```

`schedule()` (with no `when=`) fires immediately.

## Workflows Cannot Be Factories — Schedule From a Constructor

`factory=True` is **not supported on Workflow** —
`WorkflowMethodOptions` has no `constructor` field in the proto
schema, and `rbt generate` rejects the proto with
`Message type "rbt.v1alpha1.WorkflowMethodOptions" has no field named "constructor"`. (Pydantic's `factory: bool` on the base
class is permissive at type-check time but the proto codegen
rejects it.)

To make actor creation kick off a workflow, use a
`Writer(factory=True)` or `Transaction(factory=True)` constructor
that schedules the workflow as its last step:

```python
class GreeterServicer(Greeter.Servicer):

    async def hello(
        self,
        context: TransactionContext,
        request: Greeter.HelloRequest,
    ) -> None:
        # `hello` is `Transaction(factory=True)` — creates the actor.
        # Schedule the workflow to run after this transaction commits.
        await self.ref().schedule().run_hello(context, name=request.name)

    @classmethod
    async def run_hello(
        cls,
        context: WorkflowContext,
        request: Greeter.RunHelloRequest,
    ) -> None:
        # The actual durable workflow — runs after `hello` commits.
        async def set_greeting(state):
            state.greeting = f"hello, {request.name}"
        await Greeter.ref().write(context, set_greeting)
```

Caller-side: `await Greeter.Hello(ctx, "alice", name="alice")`
both creates the actor and (by virtue of the schedule call)
kicks off `run_hello`.

## Pydantic Workflows Often Have No Response

In pydantic API definitions, `Workflow(... response=None ...)` is
common — workflows are usually fire-and-forget durable functions
whose effects are observed via state changes, not return values.
The method's return type is then `-> None` and the body has no
`return` statement. See `api-pydantic.md` for the cross-method
rule.

## Read These Next If You're Building a Workflow

The declaration is only the wrapper. Each of these references covers
one primitive you'll likely need inside the workflow body — read them
all before writing the body, not after the first runtime error.

| Reference                                                          | Use it for                                              | Critical to know                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`workflow-loop.md`](workflow-loop.md)                             | Iteration that checkpoints per round                    | `async for iteration in context.loop("name")` — loop name must be stable                       |
| [`workflow-at-least-once.md`](workflow-at-least-once.md)           | Retryable idempotent work (default choice)              | Alias must be stable; result memoized after first success                                      |
| [`workflow-at-most-once.md`](workflow-at-most-once.md)             | Non-retryable side effects (charges, emails, LLM calls) | Failure poisons the alias forever — surface failures as **return values**, never as exceptions |
| [`workflow-until.md`](workflow-until.md)                           | Wait reactively for a condition                         | Returns the truthy value, not just `True`                                                      |
| [`workflow-until-changes.md`](workflow-until-changes.md)           | React per-change inside a loop                          | Returns when the value differs from the previous iteration                                     |
| [`workflow-idempotency-scopes.md`](workflow-idempotency-scopes.md) | Pick `PER_WORKFLOW` vs `PER_ITERATION` vs `ALWAYS`      | Default scope flips depending on whether the call is inside a `context.loop`                   |
| [`workflow-state-write.md`](workflow-state-write.md)               | Mutate this actor's state from inside a workflow        | Use `Service.ref().write(context, fn)` — workflows have no `self.state`                        |

### Quick Decision Aid

- Cross-actor / external side effect that **must not repeat** (charge,
  email, LLM call) → `at_most_once` (and read its file — failure
  handling is non-obvious).
- Idempotent call that's safe to retry → `at_least_once` (default).
- Wait until something is true → `until`.
- React every time a value flips → `until_changes` inside `context.loop`.
- Mutate this actor's state → `Service.ref().write(context, fn)`.
- Mutate another actor's state → just call its writer/transaction
  method like normal (workflows can call any context-typed method).
