---
title: Give the Agent Tools with `@agent.tool` and `@agent.tool_plain`
impact: HIGH
impactDescription: Tools are how an LLM agent reads and mutates Reboot state; the wrong signature won't receive the `WorkflowContext`
tags: agent, llm, tools, pydantic-ai, workflow
---

## Give the Agent Tools with `@agent.tool` and `@agent.tool_plain`

> **Critical:** an `@agent.tool` function takes a **`WorkflowContext`
> first** and a pydantic_ai `RunContext[Deps]` **second**, then its
> own arguments — that is how a tool reaches Reboot actors (call
> `Service.ref(id).method(context, ...)` with the `WorkflowContext`).
> Use `@agent.tool_plain` for a pure tool that touches no Reboot
> state. Every tool call is memoized via `at_least_once`, so a
> workflow replay returns the cached result instead of re-running
> the tool.

Tools let the LLM read and mutate your application's state during a
run. Register them on a Reboot `Agent` exactly as you would on a
`pydantic_ai.Agent` — except an `@agent.tool` function gets the
durable `WorkflowContext` as its **first** parameter.

**Incorrect (raw pydantic_ai tool signature — no `WorkflowContext`,
so it cannot call Reboot actors):**

```python
@agent.tool
async def get_page(run: RunContext[Deps], page_id: str) -> dict:
    # No `WorkflowContext` — there is no way to call `Page.ref(...)`.
    ...
```

**Correct (`WorkflowContext` first, `RunContext` second):**

```python
from pydantic_ai import RunContext
from reboot.agents.pydantic_ai import Agent
from reboot.aio.contexts import WorkflowContext

agent = Agent("anthropic:claude-sonnet-4-6", name="librarian")


@agent.tool
async def get_page(
    context: WorkflowContext,
    run: RunContext[Deps],
    page_id: str,
) -> dict:
    """Read a page's title and content."""
    # The `WorkflowContext` is what lets the tool reach a Reboot
    # actor — calls flow through the same durable envelope.
    state = await Page.ref(page_id).get(context)
    return {"title": state.title, "content": state.content}
```

## `@agent.tool_plain` for State-Free Tools

A tool that needs neither a `WorkflowContext` nor a `RunContext`
(no Reboot actors, no agent deps) uses `@agent.tool_plain`:

```python
@agent.tool_plain
async def add(x: int, y: int) -> int:
    return x + y
```

It still flows through Reboot's memoization envelope — the function
body just runs unchanged.

## Registering Tools at Construction

Tools can also be passed when constructing the agent. `tools=` takes
plain tool functions; `toolsets=` takes pydantic_ai toolsets
(including `MCPServer` instances):

```python
agent = Agent(
    "anthropic:claude-sonnet-4-6",
    name="librarian",
    tools=[some_tool],
    toolsets=[some_function_toolset],
)
```

Tools registered via `@agent.tool` / `@agent.tool_plain` **after**
`Agent.wrap(...)` are also picked up — no need to register them on
the wrapped agent.

## Tool Calls Are Memoized

Like model calls, every tool call is wrapped in `at_least_once`
(see `servicer-workflow.md`). On a workflow replay a
previously-completed tool returns its **cached** result — the tool
body does not run again. Two consequences:

- A tool's return value must be picklable.
- A tool that depends on the agent's `deps` should pull them from
  `run.deps` (the `RunContext`), and any per-run `toolsets=` you
  pass to `agent.run(...)` must reference module-scope functions —
  local closures cannot be pickled and raise `UserError`.

## Related

- `agent-pydantic-ai.md` — constructing and running the `Agent`.
- `rpc-calls.md` — calling actor methods (`await ref.method( context, ...)`) from inside a tool.
- `servicer-workflow.md` — the memoization primitive behind
  every tool call.
