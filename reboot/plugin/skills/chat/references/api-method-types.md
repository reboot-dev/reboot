---
title: API Definition — Method Types and Tool Exposure
impact: CRITICAL
impactDescription: The pydantic API file is the source of truth for both Reboot codegen AND MCP tool surface. `UI()` is chat-app-only; every method (including `User`'s) requires explicit `mcp=`; application types need `factory=True` on their `create` Writer.
tags: api, pydantic, ui, tool, mcp, reader, writer, transaction, workflow, factory, user
---

## API Definition — Method Types and Tool Exposure

The pydantic API rules — zero-value defaults, `list[<Model>]` not
supported, `Optional[<Model>]` + `default=None` for nested Models —
are in `python` references/`api-pydantic.md`. The marker →
context type mapping is in `api-methods.md`.

What's _MCP-Chat-App-specific_ about these files:

- A `User` type with empty (or near-empty) state and `Transaction`
  methods that create application-type instances.
- `factory=True` on each application type's `create` Writer.
- The `UI()` method type for opening React UIs (MCP-only — no plain
  `python` analogue).
- Every method declares `mcp=Tool()` or `mcp=None`.
- `api = API(User=Type(...), <AppType>=Type(...))` registers the
  whole tree.

## Tool Exposure: `mcp=Tool()` vs `mcp=None`

Every method must explicitly declare its MCP exposure:

- **`mcp=Tool()`** — expose the method as an AI-callable tool.
  Required on every method (including `User` methods) the AI should
  be able to call.
- **`mcp=None`** — hide the method from the AI. Use for human-only
  actions or to reduce context bloat.
- **`Tool(name="...", title="...")`** — override the default tool
  name or add a human-readable title.

`Workflow(...)` requires `mcp=` like every other method factory;
usually `None` since workflows are rarely AI-callable tools
directly. Omitting `mcp=` raises at codegen with
`1 validation error for Workflow / mcp / Field required`.

## `UI()` — React Surface

`UI()` opens a React UI in the AI chat interface. Takes
`request=` (config type or `None`), `path=` (web dir relative to
project root), `title=`, `description=`. **No servicer
implementation needed** — the React app _is_ the implementation.
When `request=` is a `Model`, its fields become props on the
React component.

`factory=True` on an application type's `create` Writer is the
chat-app spelling of a constructor (see `python`'s
`servicer-constructor.md` for the underlying mechanic).

## Simple Example (Counter)

```python
from reboot.api import (
    API,
    UI,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
    Writer,
)


# -- User models. --


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1, default="")


class UserState(Model):
    pass


# -- Counter models. --


class CounterState(Model):
    value: int = Field(tag=1, default=0)
    description: str = Field(tag=2, default="")


class ValueResponse(Model):
    value: int = Field(tag=1, default=0)


class AmountRequest(Model):
    """Request with an amount parameter."""
    amount: int = Field(tag=1, default=0)


api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            create_counter=Transaction(
                request=None,
                response=CreateCounterResponse,
                description="Create a new Counter. Returns the ID of "
                "the new counter. That ID is not human-readable; "
                "pass it to future tool calls where needed, but no "
                "need to tell the human what it is.",
                mcp=Tool(),
            ),
        ),
    ),
    Counter=Type(
        state=CounterState,
        methods=Methods(
            show_clicker=UI(
                request=None,
                path="web/ui/clicker",
                title="Counter Clicker",
                description="Interactive clicker UI for the counter.",
            ),
            create=Writer(
                request=None,
                response=None,
                factory=True,
                mcp=None,
            ),
            get=Reader(
                request=None,
                response=ValueResponse,
                description="Get the current counter value.",
                mcp=Tool(),
            ),
            increment=Writer(
                request=AmountRequest,
                response=None,
                description="Increment the counter by the specified amount.",
                mcp=Tool(),
            ),
            decrement=Writer(
                request=AmountRequest,
                response=None,
                description="Decrement the counter by the specified amount.",
                mcp=Tool(),
            ),
        ),
    ),
)
```

## Parameterized UI Example

When the AI should pass parameters to a React UI (e.g. a personalized
message or configuration), use `request=` with a Model type. The
fields become React component props:

```python
class DashboardConfig(Model):
    """Configuration passed by the AI."""
    personalized_message: str = Field(tag=1, default="")


# In the application type's Methods():
show_dashboard=UI(
    # The AI provides a DashboardConfig when opening this UI.
    # The fields are passed to the React component as props.
    request=DashboardConfig,
    path="web/ui/dashboard",
    title="Counter Dashboard",
    description="Dashboard UI. Use `personalized_message` to impart "
    "wisdom on the topic of counting things.",
),
```

The React component receives the config fields as props:

```tsx
import {
  type DashboardConfig,
  useCounter,
} from "@api/<pkg>/v1/<name>_rbt_react";

export const DashboardApp: FC<DashboardConfig> = ({ personalizedMessage }) => {
  const counter = useCounter();
  const { response } = counter.useGet();
  // personalizedMessage is available as a prop.
  return (
    <div>
      {personalizedMessage}: {response?.value ?? 0}
    </div>
  );
};
```

## `mcp=None` Example

Hide a method from the AI (e.g. for human-only actions):

```python
# In an application type's Methods():
# Only callable from the React UI, not by the AI.
confirm_dangerous_action=Writer(
    request=ConfirmRequest,
    response=None,
    description="Confirm a dangerous action.",
    mcp=None,
),
```

## Workflow Declaration

Use `Workflow` for periodic or long-running operations. The
declaration is chat-app boilerplate; the body's primitives
(`at_most_once`, `at_least_once`, `until`, `until_changes`,
`context.loop`, `MyType.ref().write(context, fn)`) are all in
`python` workflow-\* references — load them before writing the
body.

```python
from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Tool,
    Type,
    Workflow,
)


class DoPingPeriodicallyRequest(Model):
    num_pings: int = Field(tag=1, default=0)
    period_seconds: float = Field(tag=2, default=0.0)


class DoPingPeriodicallyResponse(Model):
    num_pings: int = Field(tag=1, default=0)


# In an application type's Methods():
do_ping_periodically=Workflow(
    request=DoPingPeriodicallyRequest,
    response=DoPingPeriodicallyResponse,
    # `Workflow` requires `mcp=` like every other factory; usually `None`
    # since workflows are rarely AI-callable tools directly.
    mcp=None,
)
```

## Generated Request/Response Names

Bound source classes (whatever you pass to `request=` /
`response=`) get exposed on the `Type` as
`<Type>.<MethodPascalCase>Request` and
`<Type>.<MethodPascalCase>Response`. A method
`create_checkers_game` is always
`User.CreateCheckersGameRequest` /
`User.CreateCheckersGameResponse`, even if you named your `Model`
class something else. Mismatching the method PascalCase raises
`AttributeError: type object '<Type>' has no attribute '<WrongName>'`.
The full rule is in `python` references/`api-pydantic.md`.
