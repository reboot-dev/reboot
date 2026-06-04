---
title: Building Durable Workflows
impact: CRITICAL
impactDescription: Workflows are durable, restartable functions; the wrong shape breaks replay, and the wrong call primitive double-charges users, poisons workflows forever, or stalls progress on transient errors
tags: workflow, WorkflowContext, classmethod, durable, replay, decision, at_least_once, at_most_once, per_workflow, per_iteration, always, loop, until, until_changes, state, external
---

# Building Durable Workflows

This is the single, comprehensive reference for Reboot workflows.
Read it top to bottom before writing a workflow body — the sections
build on each other, and the call-classification model in
[Classify every `await`](#classify-every-await) is the spine of
everything below it.

A workflow is a long-running, durable function attached to an actor.
The runtime persists progress so the workflow can resume after a
restart from where it left off — it can run for seconds, hours, or
days. The runtime checkpoints progress at every memoized primitive
(`at_least_once`, `at_most_once`, `until`, `until_changes`) and at
every `context.loop` iteration boundary, so a restart resumes from
the most recent checkpoint instead of starting over.

Because the body can **re-execute on replay**, two rules dominate
everything in this file:

1. A workflow method is a **`@classmethod`** — there is no `self`,
   no `self.state`. See [Declaring a workflow](#declaring-a-workflow).
2. Every `await` in the body must use the **right primitive** for
   what it calls, so replays don't re-run side effects, double-charge
   users, or diverge. See [Classify every `await`](#classify-every-await).

## Declaring a Workflow

> **Critical:** workflow Servicer methods are **`@classmethod`** —
> there is no `self`, no `self.state`. Read state via
> `Service.ref().read(context)`, mutate via
> `Service.ref().write(context, fn)`. The body can re-execute on
> replay; the primitives below memoize across replays.

Declare the method with `Workflow(...)` in the API file, and
implement it as a `@classmethod` on the Servicer that takes a
`WorkflowContext`.

**Incorrect (instance method, regular Servicer signature):**

```python
async def control_loop(
    self,
    context: WriterContext,  # WRONG — workflows need WorkflowContext
    request: Chatbot.ControlLoopRequest,
) -> None:
    ...
```

**Correct (canonical workflow shape):**

`api/chatbot/v1/chatbot.py`:

```python
control_loop=Workflow(
    request=ControlLoopRequest,
    response=None,
    mcp=None,
),
```

`chatbot_servicer.py`:

```python
from chatbot.v1.chatbot_rbt import Chatbot
from reboot.aio.contexts import WorkflowContext


class ChatbotServicer(Chatbot.Servicer):

    @classmethod
    async def control_loop(
        cls,
        context: WorkflowContext,
        request: Chatbot.ControlLoopRequest,
    ) -> None:
        # Workflow body — durable, restartable, can run for hours.
        ...
```

### Why `@classmethod`?

Workflows can re-execute (replay) after a restart. The runtime can't
carry instance attributes across replays, so the workflow method must
not depend on `self`. Marking it `@classmethod` makes that explicit
and enforced. Read state inside a workflow via
`Service.ref().read(context)` (returns the `self.state`-equivalent);
mutate it via `Service.ref().write(context, callback)` (see
[Mutating this actor's state](#mutating-this-actors-state)).

### Workflows Often Have No Response

`Workflow(... response=None ...)` is common — workflows are usually
fire-and-forget durable functions whose effects are observed via
state changes, not return values. The method's return type is then
`-> None` and the body has no `return` statement. See
`api-pydantic.md` for the cross-method rule.

## Starting a Workflow

Workflows are typically kicked off from a `transaction` or `writer`
via the schedule API:

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

### Workflows Cannot Be Factories — Schedule From a Constructor

`factory=True` is **not supported on Workflow** — `rbt generate`
rejects it with
`Message type "rbt.v1alpha1.WorkflowMethodOptions" has no field named "constructor"`. (`factory: bool` on the base class is permissive at
type-check time but the codegen rejects the bad shape.)

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

Caller-side: `await Greeter.Hello(ctx, "alice", name="alice")` both
creates the actor and (by virtue of the schedule call) kicks off
`run_hello`.

## Classify Every `await`

> **Critical:** which primitive to use depends first on **what you're
> calling**, not on how it feels. Reboot-internal calls (calls to
> another actor, calls to `Service.ref().write(context, fn)`) and
> external-system calls (HTTP, SMS, payment, LLM) have **different
> rule sets**. Get the category wrong and you'll pick from the wrong
> menu.

Everything a workflow does may be **re-run on replay** (after a
restart, or after a later step fails). So the underlying question for
any operation that has effects or side-effects is always: _given that
this may run again, is it safe to run more than once?_ If yes, you
want **at-least-once** semantics; if a second run would be harmful and
can't be made safe, you want **at-most-once** semantics. Concretely,
every operation that talks to something — another actor, this actor's
state, or an external system — falls into one of three buckets.
Classify before you write the call.

| What you're calling                                                                                                                                                             | Bucket                 | Primitives in play                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| `await SomeType.ref(id).method(context, ...)` — reader / writer / transaction / scheduled workflow on another (or this) actor                                                   | **Reboot-internal**    | `.per_workflow(alias)` / `.per_iteration(alias)` / `.always()` |
| `await Service.ref().write(context, fn)` — inline state mutation on this workflow's actor                                                                                       | **Reboot-internal**    | `.per_workflow(alias)` / `.per_iteration(alias)` / `.always()` |
| `await agent.run(context, prompt)` — Reboot `Agent` (LLM)                                                                                                                       | **Reboot-internal** \* | none — the `Agent` memoizes the model call for you             |
| `await client.get(url)`, `await stripe.PaymentIntent.create(...)`, `await twilio.messages.create(...)`, `await s3.put_object(...)` — anything that talks to a non-Reboot system | **External**           | `at_least_once(...)` (default), or `at_most_once(...)`         |
| `await until(...)`, `await until_changes(...)` — block the workflow until a callable derived from Reboot state goes truthy / changes                                            | **Reactive wait**      | `until(...)` / `until_changes(...)` (their own primitives)     |

\* The `Agent` itself is durable Reboot code — it wraps the underlying
HTTP call in `at_least_once` for you (see `agent-pydantic-ai.md`). At
the **caller** site (your workflow), you treat `agent.run(context, ...)`
as a Reboot-internal call.

### Quick Decision Aid

Before each `await` inside a workflow, classify the call:

- Calling another Reboot actor (reader/writer/transaction/schedule)
  or doing an inline state write? →
  `.per_workflow(alias)` / `.per_iteration(alias)` / `.always()`
  on the ref. **Never** `at_least_once` / `at_most_once` /
  `.idempotently("alias")` for Reboot calls. See
  [Bucket 1](#bucket-1--calling-reboot).
- External call that's **truly idempotent** — repeating it has the
  same effect as making it once (a GET, or a write guarded by a
  version / precondition check such as HTTP `If-Match` or a
  compare-and-set) → `at_least_once`, no idempotency key needed (for
  visibility and a stable, memoized result).
- External call that's non-idempotent but **the destination dedups
  by an idempotency key** (Stripe, AWS, modern payment / messaging
  APIs) → `at_least_once`, with the key generated **outside** the
  callable. See [Bucket 2](#bucket-2--calling-an-external-system).
- External call where **a duplicate is itself the failure mode**
  (wire transfer, SMS without dedup, raw chat post) →
  `at_most_once`, wrap the callable in try/except, and
  **stop to ask the developer** how failures should be handled.
- LLM / AI call → use the Reboot `Agent`
  (`reboot.agents.pydantic_ai.Agent`) — it memoizes for you (see
  `agent-pydantic-ai.md`).
- Wait until something is true → `until`. React every time a value
  flips → `until_changes` inside `context.loop`. See
  [Bucket 3](#bucket-3--reactive-waiting-on-reboot-state).
- Mutate this actor's state →
  `Service.ref().<scope>.write(context, fn)`. Mutate another actor's
  state → call its writer/transaction method with a scope.

### Naming Aliases

Every primitive that takes an `alias` — the scope chain
(`.per_workflow("...")` / `.per_iteration("...")`), `at_least_once`,
`at_most_once`, `until`, `until_changes` — uses that string as **both**
a memoization key and a human-readable label for the step. Two rules:

- **Stable.** The alias keys the memo, so for a given step it must be
  identical across replays. Never build it from values that differ
  between a run and its replay (wall-clock timestamps, fresh UUIDs,
  randomness), and don't rename it once a workflow has run — either
  invalidates progress tracking. Deterministic, replay-stable inputs
  are fine, and useful for telling iterations apart: the `iteration`
  value from `context.loop(...)` is safe to embed (e.g.
  `f"Process batch {iteration}"`), because the runtime resumes at the
  same iteration on replay.
- **Descriptive.** Treat the alias as a **title** for the step: it
  identifies that step in logs and tooling, and is intended to surface
  on dashboards, so make it specific enough to tell sibling steps
  apart. Prefer a verb + object — `"Charge customer"`,
  `"Fetch embeddings"`, `"Send login SMS"` — over a bare noun like
  `"Charge"` or `"Embeddings"`.

### Annotate Callable Return Types

Every memoizing primitive — `at_least_once`, `at_most_once`, `until`,
`until_changes` — must know the type its callable returns, so it can
type-check and (de)serialize the memoized value across replays.
**Always give the callable an explicit return annotation:**

```python
async def fetch() -> str:          # ← required: the return type
    response = await http_client.get(url)
    return response.text

payload = await at_least_once("Fetch payload", context, fetch)
```

Without an annotation (and without an explicit `type=`), the primitive
falls back to a default, and a return value that doesn't match it
**raises at runtime**:

- `at_least_once` / `at_most_once` assume the callable returns
  `None`. Any non-`None` return raises a type-mismatch error — and
  inside `at_most_once` that raise **poisons the alias forever** (see
  [`at_most_once`](#at_most_once--non-retryable-external-calls-and-stop-to-ask)),
  so a missing annotation permanently breaks the workflow.
- `until` / `until_changes` assume `bool`. Returning a non-bool (e.g.
  the settled object you were waiting for) raises unless annotated.

Use the `type=` keyword **only** when an annotation isn't possible or
expressive enough — a `lambda`, or a dynamically-typed result:

```python
embeddings = await at_least_once(
    "Fetch embeddings", context, fetch_embeddings, type=list[Vector],
)
```

Prefer a nested `async def` with a return annotation over a `lambda` +
`type=`: it's clearer and the annotation flows everywhere it's needed.

## Bucket 1 — Calling Reboot

> **Never** wrap a Reboot-internal call in `at_least_once(...)`,
> `at_most_once(...)`, or `.idempotently("...")`. Reboot calls are
> already durable: a writer/transaction either commits or rolls back
> atomically, a workflow-scheduled call is idempotent on the
> scheduling key, and inline writes are checkpointed with the
> surrounding workflow step. Wrapping them adds an extra
> memoization layer that is at best redundant and at worst (in the
> case of `at_most_once`) introduces a poison-the-alias footgun
> over a call that didn't need one.

The only thing left to decide for a Reboot call is **scope** — how
often the call should run across workflow replays and loop
iterations. Three choices:

- **`.per_workflow(alias)`** — run once for the entire workflow
  lifetime. The result is memoized; replays after the call
  succeeded return the cached value. This is the default outside a
  loop. Use for: one-shot setup, recording a decision once,
  scheduling a child workflow once.
- **`.per_iteration(alias)`** — run once per `context.loop`
  iteration. Each iteration is a fresh memoization scope. Default
  inside a loop. Use for: per-tick work that should re-run every
  iteration but be replay-safe within an iteration.
- **`.always()`** — never memoize; run on every replay attempt.
  Use for: live reads where you want the freshest value
  every time the workflow is woken, regardless of replay scope.

All three forms are available both on actor refs (for method calls
and scheduling) and on the workflow's own `.ref()` (for inline
`write(context, fn)`). They are **the canonical surface** for
expressing call intent inside a workflow.

```python
from reboot.aio.contexts import WorkflowContext


@classmethod
async def control_loop(
    cls, context: WorkflowContext, request: ControlLoopRequest,
) -> None:
    # One-shot: send the welcome notification once for this workflow.
    await Notifier.ref(request.user_id).per_workflow(
        "Welcome notification",
    ).notify_signup(context, name=request.name)

    # Inline state seed, once per workflow lifetime.
    async def seed(state):
        state.owner = request.name

    await MyType.ref().per_workflow("Seed state").write(context, seed)

    async for iteration in context.loop("Process"):
        # Per-iteration: a fresh scope each tick.
        batch = await Queue.ref(queue_id).per_iteration(
            "Dequeue batch",
        ).dequeue(context, bulk=True)

        # `.always()` — re-read the live config every iteration,
        # never cache.
        config = await ConfigService.ref().always().read(context)
        # ... do work ...
```

### Scope Semantics and Defaults

The same three scope names underlie the framework enum
(`PER_WORKFLOW`, `PER_ITERATION`, `ALWAYS`), which is also accepted
by the external-call primitives `at_least_once` / `at_most_once` /
`until` — passing `("alias", PER_WORKFLOW)` as the alias to those
functions has the same effect as the chain methods. Prefer the
chain methods at call sites; the enum form is only useful inside the
`at_least_once`/`at_most_once` callable layer.

If you omit the scope (or use `.idempotently("alias")` without
`how=`), the default depends on whether you're inside a
`context.loop`:

| Primitive / surface                              | Default outside a loop | Default inside a loop |
| ------------------------------------------------ | ---------------------- | --------------------- |
| `MyType.ref().idempotently("alias").<call>`      | `PER_WORKFLOW`         | `PER_ITERATION`       |
| `MyType.ref().idempotently("alias").write(...)`  | `PER_WORKFLOW`         | `PER_ITERATION`       |
| `at_least_once("alias", context, fn)` (external) | `PER_WORKFLOW`         | `PER_ITERATION`       |
| `at_most_once("alias", context, fn)` (external)  | `PER_WORKFLOW`         | `PER_ITERATION`       |
| `until("alias", context, fn)`                    | `PER_WORKFLOW`         | `PER_ITERATION`       |
| `until_changes(...)`                             | (loop-only)            | `PER_ITERATION`       |

When in doubt, use the explicit chain method (`.per_workflow(...)`,
`.per_iteration(...)`, `.always()`) instead of `.idempotently(...)` —
the name spells out the scope and reads correctly regardless of
loop nesting.

Picking a scope:

- **One-time bootstrap inside the workflow** (load embeddings, seed
  state, schedule a child workflow) → `per_workflow`.
- **Per-iteration work inside a loop** (process this iteration's
  batch, increment a tick counter, dequeue a chunk) →
  `per_iteration`.
- **Reactive freshness** (re-read config every wake-up; live health
  check that flips back and forth) → `always`.

### `.idempotently("alias")` Is the Older Sibling

`.idempotently("alias")` is the older sibling of
`.per_workflow("alias")` (same semantics by default —
`how=PER_WORKFLOW`). It is **not deprecated**, but the scope-named
forms are clearer for new code: the verb names the scope axis
explicitly, matches the mental model of "how often does this run?",
and stays parallel across all three options. The migration is
mechanical:

```python
# Old surface.
await MyType.ref().idempotently("Increment").write(context, fn)
await Other.ref(id).idempotently("Step").do(context)

# Preferred surface.
await MyType.ref().per_workflow("Increment").write(context, fn)
await Other.ref(id).per_workflow("Step").do(context)
```

Replace `.idempotently("X")` with `.per_workflow("X")` outside a
loop, `.per_iteration("X")` inside a loop, or `.always()` when no
memoization is wanted.

This "prefer the scope sugar" advice is **for workflow bodies only**.
The scope chain is workflow-centric — `.per_iteration()` is in fact
rejected outside a workflow — so when you need an idempotent call from
the `initialize` hook (which re-runs on every app start),
`.idempotently("alias")` is the right and primary tool. See
`lifecycle-initialize-hook.md`.

### Mutating This Actor's State

> **Critical:** workflow methods are `@classmethod` — there is **no
> `self.state`**. Mutate via
> `Service.ref().<scope>.write(context, fn)`. The callback signature
> is `(state) -> None` and the parameter **must** be named `state`.
> Reads use the same scope chain:
> `await Service.ref().<scope>.read(context)`. Both commit atomically
> with the surrounding workflow checkpoint.

**Incorrect (assigning `self.state` from a workflow):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    # WRONG — workflow methods are classmethods; there is no `self.state`.
    self.state.posts_for_approval.append(...)
```

**Correct (inline writer with `per_workflow` scope):**

```python
from chatbot.v1.chatbot_rbt import Chatbot, Post


@classmethod
async def control_loop(
    cls, context: WorkflowContext, request: ControlLoopRequest,
):
    # ... compute `text` via the Reboot Agent ...

    async def add_post_for_approval(state):
        state.posts_for_approval.append(
            Post(id=str(uuid4()), author=request.name, text=text),
        )

    # Run this mutation exactly once for the workflow lifetime.
    await Chatbot.ref().per_workflow(
        "Add post for approval",
    ).write(context, add_post_for_approval)
```

The callback receives mutable state: mutate it directly (assignments,
list appends, etc.) — the runtime captures the change and persists
it. The callback **may** return a value, and `.write(...)` returns it
to the caller — useful for the atomic check-and-update pattern (read
state, decide, mutate, and report the decision in one atomic step;
see [Atomic wait-and-update](#atomic-wait-and-update)). A callback
that only mutates can simply return `None`.

**The parameter must be named `state`.** The runtime calls the
callback with a keyword argument: `writer(state=typed_state)`. So
the parameter has to be named `state` — renaming it to `s`, `st`,
`current`, etc. raises:

```text
TypeError: <Servicer>.<workflow>.<locals>.<callback>() got an
unexpected keyword argument 'state'
```

```python
async def make_move(s):                # WRONG — must be `state`
    s.score += 1
await Game.ref().per_workflow("Move 17").write(context, make_move)

async def make_move(state):            # RIGHT
    state.score += 1
await Game.ref().per_workflow("Move 17").write(context, make_move)
```

`write` is **atomic with workflow progress**: the mutation commits
as part of the workflow's checkpoint. If the workflow restarts
before the next checkpoint, the write is replayed deterministically
with the same arguments — the scope decides whether the replay
re-fires the write or returns the cached no-op.

**Reading state** uses the same scope chain. The plain
`await Service.ref().read(context)` is shorthand for
`.per_workflow(<auto-alias>).read(context)` (or `.per_iteration`
inside a loop) — fine for one-shot reads. Use the explicit scope
when intent matters:

```python
# Default scope — captured once for the workflow lifetime.
state = await Chatbot.ref().read(context)

# Re-read live every iteration.
async for iteration in context.loop("Watch"):
    live = await Chatbot.ref().always().read(context)
    if live.human_in_the_loop:
        ...
```

For mutations of **other** actors, call their declared `Writer` /
`Transaction` method with a scope (e.g.
`await Service.ref(id).per_workflow("Step").method(context, ...)`);
use `.write(context, fn)` only to mutate **this** workflow actor's
state directly.

## Iterating with `context.loop(...)`

> **Critical:** the loop name is a stable replay-correlation key —
> pick it once and don't rename. Each iteration is a checkpoint; on
> restart the workflow resumes at the **next** iteration, not back at
> the start. Setup code before the `async for` runs once per workflow
> lifetime.

A workflow that should run a body repeatedly uses
`context.loop(name)` — an async iterator that checkpoints each
iteration.

**Incorrect (`while True` inside a workflow):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    while True:
        # No iteration boundary — replay re-runs all iterations from the
        # start, not from the latest one.
        await do_work(context)
```

**Correct (control loop pattern):**

```python
@classmethod
async def control_loop(
    cls,
    context: WorkflowContext,
    request: ControlLoopRequest,
):
    channel = Channel.ref(request.channel_id)
    pub_sub = PubSub.ref(f"{request.channel_id}-pub-sub")
    queue = Queue.ref(f"{context.state_id}-messages-queue")

    await pub_sub.subscribe(
        context, topic="messages", queue_id=queue.state_id,
    )

    async for iteration in context.loop("Control loop"):
        dequeue = await queue.dequeue(context, bulk=True)

        message_ids = [as_str(item.value) for item in dequeue.items]
        # ... process this iteration's batch ...
```

- **Each iteration is a checkpoint.** The runtime persists progress
  at the boundary of each `async for` iteration. After a restart,
  the workflow resumes at the next iteration — not back at the
  start. Long-running poll/work loops should always use
  `context.loop`.
- **Setup code outside the loop runs once.** Lines before
  `async for iteration in context.loop(...)` run once per workflow
  instance (and again only if the workflow restarts before any
  iteration completed). Use them for one-shot setup like subscribing
  to a PubSub topic, as above.
- **Loop names must be stable.** The string passed to
  `context.loop("...")` is used for replay correlation; renaming it
  after work has started invalidates progress tracking.
- **Use `iteration` for per-iteration idempotency.** The `iteration`
  value is the iteration index. Combined with the `per_iteration`
  scope, it lets each iteration's calls replay independently.

## Bucket 2 — Calling an External System

External calls are the one place inside a workflow where you reach
for `at_least_once` / `at_most_once`. **Wrap every external call in
`at_least_once`** — even a naturally idempotent one — so the call
is a visible, memoized workflow step rather than a plain `await`.
What's left to decide is the idempotency key and whether the rare
`at_most_once` exception applies.

### Decision Tree

```
External call from workflow
└── Could a duplicate of this call cause harm the destination
    can't dedup away?
    ├── No → `at_least_once`. Idempotent call → no key needed;
    │        non-idempotent but the destination dedups by key →
    │        generate the key **outside** the callable so replays
    │        reuse it.
    │
    └── Yes → Is a duplicate effect worse than maybe never
              running the call at all?
        ├── No (a duplicate is tolerable) → `at_least_once`, with
        │       a comment explaining the trade-off.
        └── Yes (SMS racing a TOTP rotation, a wire transfer that
                 posts twice, a raw chat post — a duplicate is
                 itself the failure mode) → STOP. Wrap in
                 `at_most_once` **and** in try/except, then ASK
                 THE DEVELOPER how to handle errors.
```

### `at_least_once` — the Default for Every External Call

`at_least_once(alias, context, callable)` runs `callable` and
memoizes the first successful result. Wrapping a call — even an
idempotent one — buys three things over a plain `await`:

- the result is **memoized** (a stable value across workflow
  replays),
- a failure is **retried** — when the callable raises, the exception
  propagates and the runtime replays the workflow from its last
  checkpoint; on replay, every already-memoized step returns its
  cached result instead of re-running, so the workflow makes its way
  back to this step and tries it again rather than redoing completed
  work, and
- the call becomes a **visible, named** workflow step.

The wrapper also closes a replay hazard: a plain `await` to an
external call re-runs on every replay and can return a moving value
(a counter, a timestamp, a randomized response), so any state
derived from it diverges across replays. `at_least_once` memoizes
the first result, so every replay observes the **same** value.

This applies to **any** non-deterministic read, not just network
calls — wall-clock time and randomness included. There is no
`context.now_ms` / clock on the context; to capture "now" (or a
random value) deterministically, read it inside an `at_least_once`
so the first result is memoized and every replay reuses it:

```python
import time
from reboot.aio.workflows import at_least_once


async def _now_ms() -> int:
    return int(time.time() * 1000)


# Captured once; stable across every later replay.
started_at_ms = await at_least_once("Capture start time", context, _now_ms)
```

**Naturally idempotent calls — still wrap them, no key needed.**
There's no idempotency key to manage — the call is safe to repeat
by definition — but the wrapper still makes the step visible,
memoizes a stable result, and lets the workflow retry the step
across replays without redoing completed work:

```python
from reboot.aio.workflows import at_least_once


@classmethod
async def fetch_latest(
    cls, context: WorkflowContext, request: FetchRequest,
) -> None:
    async def fetch() -> str:
        # GET is idempotent — safe to repeat. Wrapping it memoizes
        # the payload so later replays reuse the same value.
        response = await http_client.get(
            f"https://api.example.com/items/{request.item_id}",
        )
        response.raise_for_status()
        return response.text

    payload = await at_least_once("Fetch latest", context, fetch)

    async def store(state):
        state.last_payload = payload

    await Fetcher.ref().per_workflow("Store payload").write(context, store)
```

**Non-idempotent calls the destination dedups by key.** When the
destination dedups retries on a key (Stripe `Idempotency-Key`, AWS
request-id, Twilio with `MessagingServiceSid` + `Idempotency-Key`),
the idempotency key is what makes the call safe to retry. **Generate
it outside the callable** so every replay uses the same key —
derive it from the workflow's `state_id` (or a similar stable
input), never `uuid.uuid4()` inside the callable:

```python
from reboot.aio.workflows import at_least_once


@classmethod
async def charge(
    cls, context: WorkflowContext, request: ChargeRequest,
) -> None:
    # Stable across replays because it's derived from stable inputs.
    # If the FIRST attempt fails before completing, the SAME key
    # must be reused on retry — so don't call `uuid.uuid4()` here.
    key = f"charge:{context.state_id}:{request.invoice_id}"

    async def do_charge() -> ChargeResult:
        return await stripe_client.payment_intents.create(
            amount=request.amount,
            currency="usd",
            idempotency_key=key,
        )

    result = await at_least_once("Charge customer", context, do_charge)
```

**Anti-pattern — a fresh key on each attempt inside the effecting
callable:**

```python
async def do_charge() -> ChargeResult:
    # WRONG — uuid4() is regenerated every time `do_charge` runs, so
    # the destination sees a different key on each retry and cannot
    # dedup; retries actually charge twice.
    return await stripe_client.payment_intents.create(
        ...,
        idempotency_key=str(uuid.uuid4()),
    )
```

**No stable inputs? Memoize a generated key in its own
`at_least_once`.** When you can't derive a key from `state_id` /
request fields, generating one with `uuid.uuid4()` is fine **as long
as it's memoized** — put the generation in its own `at_least_once` so
the key is computed once and every replay (including a retry of the
effecting call) reuses the same value:

```python
import uuid
from reboot.aio.workflows import at_least_once


@classmethod
async def charge(
    cls, context: WorkflowContext, request: ChargeRequest,
) -> None:
    async def make_key() -> str:
        return str(uuid.uuid4())

    # Computed once and memoized — stable across all later replays.
    key = await at_least_once("Generate charge key", context, make_key)

    async def do_charge() -> ChargeResult:
        return await stripe_client.payment_intents.create(
            amount=request.amount,
            currency="usd",
            idempotency_key=key,
        )

    result = await at_least_once("Charge customer", context, do_charge)
```

The distinction from the anti-pattern is _where_ `uuid4()` runs:
inside the effecting callable it regenerates on every attempt; inside
its own `at_least_once` it's captured once.

**Failures retry via workflow replay.** When `callable` raises, the
exception propagates and the runtime replays the workflow from its
last checkpoint; the step is attempted again on each replay until it
succeeds, at which point the result is memoized. There's no built-in
retry-budget or backoff configuration on the call itself; if you need
bounded retries, catch failures inside `callable` and return them as
data (a `Result`-style object), then inspect the result in the
workflow body. To **terminate** the workflow on a business-logic
failure that
should not be retried, raise a declared abort from the body — see
[How a workflow exits](#how-a-workflow-exits).

**Aliases.** The alias is the memoization key _and_ the step's
title — keep it stable and descriptive, unique per logical step (see
[Naming aliases](#naming-aliases)).

**Return type.** `at_least_once` infers the result type from
`callable`'s return annotation, so annotate it (or pass `type=`) —
see [Annotate callable return types](#annotate-callable-return-types).

`at_least_once_per_workflow(alias, context, callable)` is shorthand
for `at_least_once((alias, PER_WORKFLOW), context, callable)`. The
plain form without an explicit scope defaults to `PER_ITERATION`
when called inside a `context.loop` (see
[Scope semantics and defaults](#scope-semantics-and-defaults)).

### `at_most_once` — Non-Retryable External Calls, and STOP to Ask

> **Critical:** `at_most_once` is **only** for external (non-Reboot)
> calls where **a duplicate is itself the failure mode** and the
> destination cannot dedup it — a wire transfer without idempotency
> key, an SMS the destination won't dedup, a chat post with no dedup
> support. If `callable` raises — or if the machine reboots while it
> is running — the alias is **poisoned**: every later attempt raises
> `AtMostOnceFailedBeforeCompleting` until the application's durable
> state is expunged, or the workflow is cancelled. Three
> non-negotiables: (1) wrap the callable body in `try/except` and
> surface failures as **return values**; (2) **also** wrap the
> `await at_most_once(...)` call itself in `try/except` for
> `AtMostOnceFailedBeforeCompleting`, because a mid-callable machine
> reboot can't be caught _inside_ the callable; (3) **stop and ask
> the developer how these failures should be handled** before writing
> the code.

`at_most_once(alias, context, callable)` runs `callable` and
memoizes its result. On replay the memoized value is returned and
`callable` is **not** invoked again — that's the "at most once"
guarantee. Because the destination cannot deduplicate a second
attempt, the primitive treats **any** raised exception as a terminal
failure for that alias. There is no transient-error escape hatch: a
network blip, a 5xx, a timeout, an OOM — all terminal. There is no
built-in recovery.

That cost is only worth paying for a narrow set of calls — if you
find yourself reaching for `at_most_once`, first re-confirm via the
[decision tree](#decision-tree) that none of the `at_least_once`
cases apply.

**Non-negotiable 1 — wrap the callable in `try/except` and return
failures as data.** A raised exception from inside `callable`
poisons the alias, so the callable must catch every exception it
can survive and convert it into a return value the surrounding
workflow can inspect:

```python
from reboot.aio.workflows import at_most_once, AtMostOnceFailedBeforeCompleting


@classmethod
async def send_login_sms(
    cls, context: WorkflowContext, request: SendLoginSmsRequest,
) -> None:
    async def do_send() -> SmsResult:
        try:
            response = await sms_client.send(
                to=request.phone,
                body=f"Your code: {request.code}",
            )
            return SmsResult(ok=True, message_id=response.id)
        except sms_client.TransientError as e:
            # MUST be data, not raise — a raise poisons the alias.
            return SmsResult(ok=False, reason=f"transient: {e}")
        except sms_client.PermanentError as e:
            return SmsResult(ok=False, reason=f"permanent: {e}")

    try:
        outcome = await at_most_once("Login SMS", context, do_send)
    except AtMostOnceFailedBeforeCompleting:
        # The callable started but never completed — almost always a
        # machine reboot mid-`do_send`, which no `try/except` *inside*
        # the callable could catch. The SMS may or may not have been
        # sent; treat it as an indeterminate failure per the
        # developer's chosen handling (see non-negotiable 3).
        outcome = SmsResult(ok=False, reason="interrupted before completing")

    if not outcome.ok:
        # Developer-specified handling lives here — see below. If the
        # answer is "fail this workflow without retrying", raise a
        # **declared** `<Type>.<Workflow>Aborted` (see "How a workflow
        # exits"); any **undeclared** exception causes the workflow to
        # retry from its last checkpoint instead of stopping.
        raise User.SendLoginSmsAborted(
            SmsDelivery(reason=outcome.reason),
        )
```

This callable returns a non-`None` value, so it **must** carry a
return annotation (`async def do_send() -> SmsResult:`) or be given
`type=SmsResult` — see
[Annotate callable return types](#annotate-callable-return-types). It
bites hardest here: a callable with no discoverable type fails the
runtime type check with `TypeError: Result of type '<X>' ... is not None but no type= argument was passed`, and that raise
**itself poisons the alias** — so a missing annotation permanently
breaks the workflow.

**Non-negotiable 2 — also wrap the `at_most_once` call itself in
`try/except`.** The inner `try/except` only covers exceptions the
callable raises _while running_. It cannot cover the case where the
process or machine reboots **partway through** the callable: the
operation started, never recorded a result, and on the next replay
`at_most_once` raises `AtMostOnceFailedBeforeCompleting` rather than
re-running the callable (re-running could perform the side effect a
second time — exactly what `at_most_once` exists to prevent). That
exception surfaces at the **call site**, so you must catch it around
the `await at_most_once(...)` (as in the example above). For many
calls a mid-flight reboot and an in-callable failure collapse to the
same thing — "it didn't complete" — and you can map both to one
`ok=False` outcome; only split them apart when the recovery differs.

**Non-negotiable 3 — stop and ask the developer how failures should
be handled.** There is no safe default for "the wire transfer
returned `ok=False`" or "the SMS provider failed permanently".
Possible handlings include:

- Record the failure in state and continue the workflow.
- Record the failure, alert ops, and pause until intervention.
- Try a different rail / provider.
- Treat the workflow as failed and stop.

Each is correct in some setting, and picking the wrong one either
silently loses money or stalls a queue. So: write the call (with the
`try/except` shape above), **stop**, and ask the developer — e.g.
"This call uses `at_most_once` because a duplicate [explain why a
duplicate would be bad]. If `do_send` returns `ok=False` (transient
or permanent), how should the workflow proceed? Options I can
implement: record-and-continue, record-and-pause,
switch-to-fallback-rail, mark-failed-and-stop." Implement whichever
option the developer picks **outside** the callable. Do not invent
handling unsupervised.

Here is the wire-transfer shape end to end, including a declared
abort as one possible developer-chosen handling:

```python
from reboot.aio.workflows import at_most_once


@classmethod
async def wire(
    cls, context: WorkflowContext, request: WireRequest,
) -> None:
    # NOTE: do NOT extend this without asking the developer how
    # transient failures should surface — at_most_once poisons
    # the alias on raise.
    async def do_wire() -> WireResult:
        try:
            confirmation = await bank_client.wire_transfer(
                from_account=request.from_id,
                to_account=request.to_id,
                amount_cents=request.amount_cents,
            )
            return WireResult(ok=True, confirmation_id=confirmation.id)
        except bank_client.TransientError as e:
            # MUST surface as data, not raise.
            return WireResult(ok=False, reason=f"transient: {e}")
        except bank_client.PermanentError as e:
            return WireResult(ok=False, reason=f"permanent: {e}")

    outcome = await at_most_once("Wire transfer", context, do_wire)
    if not outcome.ok:
        # Developer-specified handling — recorded in state, alerts ops, etc.
        async def record(state):
            state.last_wire_error = outcome.reason
        await Account.ref(request.from_id).per_workflow(
            "Record wire failure",
        ).write(context, record)
        # If the chosen handling is "fail this workflow without
        # retrying", raise a **declared** abort — only declared
        # errors stop the workflow. See "How a workflow exits".
        raise Account.WireAborted(
            WireFailed(reason=outcome.reason),
        )
```

When in doubt about which bucket the destination falls into, **ask
the developer**. Wrong-bucket choices are the difference between
"transient blip retries automatically" and "wire transfer fires
twice".

## Bucket 3 — Reactive Waiting on Reboot State

> **Critical:** `until` and `until_changes` work **only with Reboot
> types** — the callable they take must derive its answer from a
> Reboot `Service.ref(...).read()` or a stdlib actor. **Never put
> an external API call (HTTP poll, SDK status check, filesystem
> read) inside the callable.** The runtime detects "the answer
> might have changed" by tracking Reboot-state dependencies; an
> external value is invisible to it. Misusing this primitive on an
> external call either hangs the workflow forever (the callable
> ran once, returned false, and nothing in Reboot ever changes to
> wake it up) or, inside a tight `context.loop`, busy-polls the
> external system.

`until` and `until_changes` don't call out to anything — they
**block the workflow until a Reboot-state condition is met**. The
runtime suspends the workflow between reactive wake-ups, so this is
not a polling loop; there's no interval to tune. The callable runs
when there's a chance the answer might have changed — which the
runtime can only infer from Reboot-state reads.

### `until` — Wait for a Condition to Become Truthy

`until(alias, context, callable)` reactively re-runs `callable` until
it returns a truthy value, then memoizes that value and resolves.
Use it whenever a workflow needs to wait for a Reboot-state
condition: an approval to land in the actor's state, a stdlib value
to flip, state to reach a particular shape.

**Incorrect (busy-waiting with sleep):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    while True:
        state = await Order.ref(request.order_id).read(context)
        if state.approved:
            break
        await asyncio.sleep(5)  # naive poll — burns ticks, not durable
```

**Correct (use `until`):**

```python
from reboot.aio.workflows import until


@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    async def is_approved() -> bool:
        state = await Order.ref(request.order_id).read(context)
        return state.approved

    await until("Order approval", context, is_approved)
    # Execution resumes here only after `is_approved()` returns True.
```

**`until` returns the truthy value.** If `callable` returns a value
other than `True` (e.g. a settled `Order` object), `until` returns
that value. The conventional shape is
`Callable[[], Awaitable[bool]]`, but anything truthy works:

```python
async def get_settled() -> Optional[Order]:
    order = await Order.ref(request.order_id).read(context)
    return order if order.settled else None  # None is falsy

settled_order = await until("Settlement", context, get_settled)
# settled_order is the populated Order, not just True.
```

`until` resolves once and memoizes; subsequent replays see the
memoized value without re-running the callable. To wait again on a
fresh condition, use a different alias. (With `always` scope the
result is never cached — the runtime keeps invoking `fn` every
reactive wake-up, so a condition that flips back to false is
observed.)

#### Atomic Wait-and-Update

A plain `until` that _reads_ state and then _writes_ in a separate
step has a gap: between the read resolving and the write landing,
another caller can change the same state (claim the same slot, flip
the same flag). To make "wait until X, then act on X" a single atomic
step, put the check **and** the mutation in an inline writer and let
`until` wait on the writer's return value. Because the inline writer
runs as one atomic operation on the actor, the read-decide-mutate
can't be interleaved:

```python
@classmethod
async def claim_slot(
    cls, context: WorkflowContext, request: ClaimRequest,
) -> None:
    def try_claim(state) -> bool:
        # Runs as a single atomic writer: read, decide, mutate.
        if state.ready and not state.claimed:
            state.claimed = True
            return True  # the writer's return value resolves `until`.
        return False

    # `until` re-runs the writer reactively until it returns truthy;
    # the actor guarantees no other caller claims the slot first.
    await until(
        "Claim slot",
        context,
        lambda: Worker.ref(request.worker_id).write(context, try_claim),
    )
```

This works because an inline `write(context, fn)` callback may return
a value and `.write(...)` propagates it (see
[Mutating this actor's state](#mutating-this-actors-state)) — so the
truthy return both performs the claim and satisfies the wait.

### `until_changes` — React Every Time a Value Moves

> **Critical:** only meaningful **inside** a `context.loop`. Equality
> defaults to `==`; pass `equals=` for non-scalar return types where
> `==` is wrong. First iteration returns immediately (no previous
> value to compare against).

`until_changes(alias, context, callable)` runs `callable` each
iteration of a `context.loop` and returns when the result differs
from the previous iteration's result.

**Incorrect (polling state and self-comparing manually):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    last_seen = None
    async for iteration in context.loop("Watch order"):
        state = await Order.ref(request.order_id).read(context)
        if state.status == last_seen:
            continue
        last_seen = state.status
        # ... handle change ...
```

**Correct (use `until_changes`):**

```python
from reboot.aio.workflows import until_changes


@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    async def order_status() -> str:
        state = await Order.ref(request.order_id).read(context)
        return state.status

    async for iteration in context.loop("Watch order"):
        new_status = await until_changes(
            "Order status", context, order_status,
        )
        # `new_status` is guaranteed different from the previous iteration.
        # ... handle the new status ...
```

For non-scalar return types where `==` is too strict (or too loose),
pass an `equals=` callback:

```python
from typing import Set

async def tag_set() -> Set[str]:
    state = await Doc.ref(doc_id).read(context)
    return set(state.tags)

new_tags = await until_changes(
    "Doc tags",
    context,
    tag_set,
    equals=lambda prev, curr: prev == curr,  # the default; shown for clarity
)
```

On the first iteration there's no previous value to compare against,
so `until_changes` returns the result of the first run as soon as
it's available.

**When to use which:**

- **`until`** — "do not proceed until X is true" (idle most of the
  time).
- **`until_changes`** — "iterate every time X changes" (process per
  change, e.g. drive a state-machine reaction).

### Waiting on External Work

To wait on an external system, **mirror its status into Reboot
state** and `until` on that state. Putting the external poll inside
the callable is the most common misuse:

```python
# WRONG — external HTTP poll inside an `until` callable. The
# runtime can't observe `external_job.status` changing, so this
# hangs forever (or busy-polls if inside a tight loop).
async def job_done() -> bool:
    response = await http_client.get(f"/jobs/{job_id}")
    return response.json()["status"] == "done"

await until("Job done", context, job_done)
```

Two ways to flip the Reboot state instead:

1. **Webhook / callback** — the external system POSTs to a Reboot
   `Writer` (or `Transaction`) that updates the actor's state. The
   right pattern when the external system supports callbacks.
2. **Poll from inside a `context.loop`** — call an `at_least_once`
   that hits the external API and writes the result into Reboot
   state; an `until` in a parallel workflow reacts to the resulting
   state change.

```python
# RIGHT — poll the external job from an at_least_once inside a
# loop, write the result into Reboot state, and `until` on that
# state.
async for iteration in context.loop("Poll job"):
    async def fetch_status() -> str:
        response = await http_client.get(f"/jobs/{job_id}")
        return response.json()["status"]

    status = await at_least_once(
        "Job status", context, fetch_status,
    )

    async def record(state):
        state.job_status = status
    await JobTracker.ref().per_iteration(
        "Record status",
    ).write(context, record)

    if status == "done":
        break

# Or, in a parallel workflow, `until` on the Reboot state being flipped:
async def is_done() -> bool:
    state = await JobTracker.ref().read(context)
    return state.job_status == "done"

await until("Job done", context, is_done)
```

## How a Workflow Exits

> **Critical:** to **stop** a workflow without further retries,
> raise a **declared** `<Type>.<Workflow>Aborted(<DeclaredError>(...))`.
> Any **undeclared** exception (a plain `Exception`, a `ValueError`,
> a transient HTTP error, a bug) **propagates and causes the
> runtime to retry the workflow from its last checkpoint**.
> The two paths exit the workflow on opposite trajectories — pick
> deliberately.

A running workflow has exactly three outcomes:

1. **Returns normally** — the workflow is done. Any `response=...`
   value is recorded; callers observing via `.read()` see the
   final state.
2. **Raises a declared `<Type>.<Workflow>Aborted(<Error>(...))`** —
   the workflow **terminates**. It is not retried. The declared
   error becomes the workflow's recorded failure; callers can
   inspect it the same way they would a writer/transaction abort
   (see `api-errors.md`).
3. **Raises any other exception (undeclared)** — the runtime treats
   this as a transient failure. The workflow is **replayed** from the
   most recent checkpoint, and the body re-executes from that point.
   This is how transient network errors, restarts, and bugs get
   retried automatically — but it also means a bug-induced exception
   retries forever until you ship a fix or expunge the workflow.

### Declare the Errors You Plan to Raise

`Workflow(...)` takes the same `errors=[...]` keyword as the other
method factories. Every error class you might `raise` from the
workflow body — to signal a non-retryable terminal failure — must be
listed there.

```python
class PaymentDeclined(Model):
    reason: str = Field(tag=1, default="")


class CustomerSuspended(Model):
    pass


api = API(
    Order=Type(
        state=OrderState,
        methods=Methods(
            fulfill=Workflow(
                request=FulfillRequest,
                response=None,
                errors=[PaymentDeclined, CustomerSuspended],
                mcp=None,
            ),
        ),
    ),
)
```

### Terminate the Workflow with a Declared Abort

```python
from reboot.aio.contexts import WorkflowContext
from reboot.aio.workflows import at_most_once
from <pkg>.v1.order_rbt import Order


class OrderServicer(Order.Servicer):

    @classmethod
    async def fulfill(
        cls, context: WorkflowContext, request: Order.FulfillRequest,
    ) -> None:
        async def do_charge() -> ChargeResult:
            try:
                response = await stripe.PaymentIntent.create(
                    amount=request.amount,
                    idempotency_key=f"order:{context.state_id}",
                )
                return ChargeResult(ok=True, charge_id=response.id)
            except stripe.error.CardError as e:
                # Permanent — surface as data so the alias isn't poisoned.
                return ChargeResult(ok=False, reason=str(e))

        outcome = await at_most_once("Charge", context, do_charge)
        if not outcome.ok:
            # Declared error → workflow stops, not retried.
            raise Order.FulfillAborted(
                PaymentDeclined(reason=outcome.reason),
            )

        async def mark_paid(state):
            state.charge_id = outcome.charge_id
            state.status = "paid"

        await Order.ref().per_workflow(
            "Mark paid",
        ).write(context, mark_paid)
```

### Don't Let Undeclared Errors Escape Where You Mean "Stop"

If your code can raise something like `ValueError("bad config")` and
you actually want the workflow to **stop** on that input (because
retrying will never succeed), declare a typed error and convert
before raising:

```python
# WRONG — undeclared `ValueError` causes the workflow to retry
# forever (the bad input will always be bad).
if request.amount <= 0:
    raise ValueError("amount must be positive")

# RIGHT — declared abort → workflow terminates.
if request.amount <= 0:
    raise Order.FulfillAborted(
        InvalidRequest(field="amount", reason="must be positive"),
    )
```

The inverse also matters: if you genuinely want the workflow to
retry (a transient external blip), let the error propagate unwrapped
— don't catch it and convert it to a declared abort, or you'll mark
the workflow failed on the first transient hiccup.

### Inside an `at_most_once` / `at_least_once` Callable, Never `raise` to Signal "Stop"

A `raise` inside an `at_most_once` callable **poisons the alias
forever**. A `raise` inside an `at_least_once` callable causes the
runtime to **retry that callable indefinitely**. Neither is "stop
the workflow". Surface the failure as **data** from the callable
(the `try/except` shape used throughout
[Bucket 2](#bucket-2--calling-an-external-system)), then decide
**after** the call what the workflow should do:

- **Stop and don't retry** → raise a declared
  `<Type>.<Workflow>Aborted(<Error>(...))`.
- **Continue with degraded state** → record the failure in state
  (inline writer with a scope) and proceed.
- **Try a fallback path** → call a different actor/method.
- **Retry the whole workflow** → let an undeclared exception
  propagate (rare; usually you'd want the `at_least_once` callable to
  handle the retry instead).

```python
outcome = await at_most_once("Wire", context, do_wire)
if outcome.permanent_failure:
    raise Order.FulfillAborted(
        PaymentDeclined(reason=outcome.reason),
    )
# Transient failures stay as data; the workflow body can record
# them in state and try a fallback rail, etc.
```

Picking the wrong exit is how workflows either retry forever on bad
input (undeclared exception escaped) or terminate on a transient
blip (declared abort raised too eagerly). See `api-errors.md` and
`patterns-error-handling.md` for the typed-error contract.

## LLM / AI Calls

Backend LLM calls — chat completions, AI agents, tool-using
assistants — go through the durable `reboot.agents.pydantic_ai.Agent`,
**never** a raw `anthropic` / `openai` SDK or a bare
`pydantic_ai.Agent` (a raw call re-hits and re-bills the provider on
every workflow replay). At the caller site you treat
`agent.run(context, ...)` as a Reboot-internal call — the `Agent`
wraps the underlying model call in `at_least_once` for you. The
`Agent` runs only inside a `WorkflowContext`. See
`agent-pydantic-ai.md` and `agent-tools.md`.

## Related

- `agent-pydantic-ai.md` / `agent-tools.md` — backend LLM calls and
  AI agents via the durable Reboot `Agent`.
- `api-methods.md` — the `Workflow(...)` factory and `errors=[...]`.
- `api-errors.md` / `patterns-error-handling.md` — the typed-error
  contract behind declared aborts.
- `stdlib-queue.md` / `stdlib-pubsub.md` — the stdlib actors most
  often driven from a workflow control loop.
