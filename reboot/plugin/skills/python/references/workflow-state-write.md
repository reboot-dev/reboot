---
title: Mutate State from a Workflow with `ref().write(context, fn)`
impact: HIGH
impactDescription: Direct `self.state` writes inside a workflow are wrong; `write` is the correct path
tags: workflow, state, write, callback, mutation
---

## Mutate State from a Workflow with `ref().write(context, fn)`

> **Critical:** workflow methods are `@classmethod` — there is **no
> `self.state`**. Mutate via `Service.ref().write(context, fn)` where
> `fn(state)` modifies state in place and returns `None`. Read via
> `Service.ref().read(context)`. Both commit atomically with the
> surrounding workflow checkpoint.

Workflows are `@classmethod`s — they don't have `self.state`. To mutate
state, call `Service.ref(...).write(context, fn)` where `fn` is a
callback that receives the state and modifies it in place. The runtime
applies the mutation as a single writer-style operation, atomic with the
surrounding workflow's progress.

**Incorrect (assigning `self.state` from a workflow):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    # WRONG — workflow methods are classmethods; there is no `self.state`.
    self.state.posts_for_approval.append(...)
```

**Correct (state-write callback pattern):**

```python
from chatbot.v1.chatbot_rbt import Chatbot, Post


@classmethod
async def control_loop(
    cls, context: WorkflowContext, request: ControlLoopRequest,
):
    # ... compute `text` via at_most_once / generate ...

    async def add_post_for_approval(state):
        state.posts_for_approval.append(
            Post(id=str(uuid4()), author=request.name, text=text),
        )

    await Chatbot.ref().write(context, add_post_for_approval)
```

## The Callback Receives Mutable State

The callback signature is `(state) -> None`. Inside the callback, mutate
state directly (assignments, list appends, etc.) — the runtime captures
the change and persists it. Don't return anything from the callback.

### The Parameter **Must** Be Named `state`

The runtime calls the callback with a keyword argument:
`writer(state=typed_state)`. So the parameter has to be named `state`
— renaming it to `s`, `st`, `current`, etc. raises:

```text
TypeError: <Servicer>.<workflow>.<locals>.<callback>() got an
unexpected keyword argument 'state'
```

**Incorrect (renamed parameter):**

```python
async def make_move(s):                # WRONG — must be `state`
    s.score += 1
await Game.ref().write(context, make_move)
```

**Correct:**

```python
async def make_move(state):
    state.score += 1
await Game.ref().write(context, make_move)
```

Same rule for inline writers wrapped in `.idempotently("alias")` /
`.always()` from a workflow:

```python
async def make_move(state):
    ...
await Game.ref().idempotently("Move 17").write(context, make_move)
```

## `write` Is Atomic with Workflow Progress

The mutation commits as part of the workflow's checkpoint. If the
workflow restarts before the next checkpoint, the write is replayed
deterministically with the same arguments.

## Reading State from a Workflow

Reading is symmetric: `await Service.ref().read(context)` returns the
current state snapshot. Use it to decide what work to schedule next.

```python
state = await Chatbot.ref().read(context)
if state.human_in_the_loop:
    ...
```

## Calling Other Actor Methods Still Works

Workflows can call other actors' readers/writers/transactions just like
any other context — `await Service.ref(id).method(context, ...)`. Use
`write(context, fn)` only when you need to mutate **this** workflow
actor's state directly inside a workflow body.
