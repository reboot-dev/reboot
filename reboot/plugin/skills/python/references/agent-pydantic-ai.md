---
title: Call LLMs via the Reboot `Agent`, Never a Raw SDK
impact: HIGH
impactDescription: A raw LLM call re-hits the provider on every workflow replay — wasteful, non-deterministic, double-billed
tags: agent, llm, pydantic-ai, workflow, memoize, durable
---

## Call LLMs via the Reboot `Agent`, Never a Raw SDK

> **Critical:** backend LLM calls go through
> `reboot.agents.pydantic_ai.Agent` — a durable, drop-in wrapper
> over `pydantic_ai.Agent`. It runs **only inside a
> `WorkflowContext`**, requires a unique stable `name=`, and takes
> the `WorkflowContext` as the **first positional argument** to
> `run` / `iter` / `run_stream` / `run_stream_events` (raw
> pydantic_ai takes the prompt first). Each model call — and each
> tool call — is memoized via `at_least_once`, so a workflow
> replay returns the cached response instead of re-hitting (and
> re-billing) the provider.

When a Reboot app needs to talk to an LLM, do **not** reach for the
`anthropic` / `openai` SDK or a bare `pydantic_ai.Agent`. Workflows
re-execute (replay) after a restart; a raw LLM call inside one runs
again on every replay — wasteful, non-deterministic, and billed
twice. The Reboot `Agent` wraps each model call in `at_least_once`
so a completed call returns its memoized `ModelResponse` on replay.

**Incorrect (raw LLM call inside a workflow — re-runs on replay):**

```python
import anthropic

@classmethod
async def summarize(cls, context: WorkflowContext) -> None:
    # Re-hits Anthropic — and re-bills — every time the workflow
    # replays. The response also varies run to run, breaking
    # deterministic replay.
    client = anthropic.Anthropic()
    response = client.messages.create(model="...", messages=[...])
```

**Correct (durable Reboot `Agent`):**

```python
from reboot.agents.pydantic_ai import Agent
from reboot.aio.contexts import WorkflowContext

# Define the agent once, at module scope — not per request.
# Pydantic AI reads the provider key from the standard env var
# (`ANTHROPIC_API_KEY`); see `lifecycle-secrets.md`.
summarizer = Agent(
    "anthropic:claude-sonnet-4-6",
    name="summarizer",
    system_prompt="You write concise summaries.",
)


@classmethod
async def summarize(cls, context: WorkflowContext) -> None:
    # `context` first, then the prompt. The model call is memoized:
    # a replay returns the cached response, no second API hit.
    result = await summarizer.run(context, "Summarize today's news.")
    summary = result.output
```

## Constructing the Agent

Two ways to build one, both at **module scope**:

```python
from reboot.agents.pydantic_ai import Agent

# Directly — same arguments as `pydantic_ai.Agent`, plus `name=`.
agent = Agent("anthropic:claude-sonnet-4-6", name="librarian")

# Or adopt an already-built `pydantic_ai.Agent`.
import pydantic_ai
agent = Agent.wrap(pydantic_ai.Agent(..., name="librarian"))
```

`name=` is **required** and must be unique and stable: it scopes
every memoization key for the agent's model and tool calls.
Constructing without it raises `UserError`; the `name` setter
raises after construction — changing it would silently shift the
keys and break replay. To rename, construct a new `Agent`.

## Running the Agent

The agent runs **only inside a `WorkflowContext`** — a `Workflow(...)`
method (see `servicer-workflow.md`). It is not usable from a reader,
writer, or transaction. All four entry points take `context` first:

```python
result = await agent.run(context, "prompt")          # one-shot
async with agent.iter(context, "prompt") as run: ...  # node-by-node
async with agent.run_stream(context, "prompt") as s: ...
async for event in agent.run_stream_events(context, "prompt"): ...
```

- Passing the prompt first (the raw-pydantic_ai habit) raises a
  `UserError` naming the fix.
- `run_sync` / `run_stream_sync` raise — Reboot is async-only; use
  `await agent.run(...)`.
- **Nested runs are rejected**: you cannot start an `agent.run`
  while another is already active (e.g. from inside a tool).

## Distinguish Repeated Runs with `variant=`

Within one workflow method — or one control-loop iteration — every
`agent.run` must be uniquely identifiable by its `(user_prompt, variant, message_history)`. Two indistinguishable calls raise
`UserError: Duplicate agent run`. Pass a distinct `variant=` to
differentiate repeated or parallel calls:

```python
first = await agent.run(context, "Draft a title.")
# Same prompt again in the same scope — needs a `variant`.
second = await agent.run(context, "Draft a title.", variant="retry")
```

Identical calls in **different** loop iterations are fine — each
iteration is a fresh scope.

## Streaming Is Drained, Not Token-by-Token

`run_stream`, `run_stream_events`, and `iter` work, but the
underlying model call is fully drained and memoized inside
`at_least_once`: events/chunks arrive in a single batch once the
model finishes, not token-by-token. True incremental streaming is
incompatible with deterministic replay.

## Replay-Safety Notes

- `parallel_execution_mode` defaults to the replay-safe
  `parallel_ordered_events`. The pydantic_ai default `'parallel'`
  is rejected at construction — its completion-order events are
  non-deterministic across replays.
- On replay the agent compares a snapshot of its configuration
  (instructions, model, per-run kwargs) against the original run
  and logs a `*** POSSIBLE NON-DETERMINISM! ***` warning if
  anything changed — a hint that memoized responses may be stale.
- Per-run `toolsets=` / `output_type=` must be picklable: define
  any tool functions and output classes at **module scope**, not
  as local closures.

## Dependency

Add the Pydantic AI package with the provider extra to the
project's `pyproject.toml` (see `lifecycle-project-setup.md`):

```toml
dependencies = [
    "pydantic-ai-slim[anthropic]==1.87.0",
    # ...
]
```

## Related

- `agent-tools.md` — give the agent tools with `@agent.tool` /
  `@agent.tool_plain` so it can read and mutate Reboot state.
- `servicer-workflow.md` — the `WorkflowContext` method the agent
  runs inside, and the `at_least_once` primitive it memoizes every
  model and tool call with.
- `lifecycle-secrets.md` — managing the provider API key.
