---
title: API Definition — Method Types and Tool Exposure
impact: CRITICAL
impactDescription: The pydantic API file is the source of truth for both Reboot codegen AND MCP tool surface. `UI()` is chat-app-only; every method (including `User`'s) requires explicit `mcp=`; application types need `factory=True` on their `create` Writer.
tags: api, pydantic, ui, tool, mcp, reader, writer, transaction, workflow, factory, user
---

## API Definition — Method Types and Tool Exposure

The pydantic API rules — zero-value defaults, `Optional[<Model>]` +
`default=None` for nested Models — are in
`python/references/api-pydantic.md`. The marker → context type mapping is
in `api-methods.md`.

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

## UI Placement: On the Entity Type, Not on `User`

**A UI that shows or edits a specific entity belongs on that
entity's `Type` — not on `User`.**

The rule:

- **Per-entity UI** ("show this Person", "edit this Task",
  "view this Document") → `UI()` on the entity's `Type`. The
  actor ID is the tool call's target, implicit — no `request=`
  needed.
- **User-scoped UI** ("show my dashboard", "browse all my
  Persons") → `UI()` on `User`. The actor is the user itself.

**Why the entity-Type placement works.** When a `UI()` lives
on a `Type`, the generated MCP tool takes that Type's state ID
as its argument and the generated `use<Type>()`
React hook used in the UI's component auto-resolves its target with
no arguments needed. The actor reference is end-to-end implicit:
the AI calls `person_show(person_id=...)`, the React UI
materializes for that exact `Person`, no props plumbing, no risk
of mixing up which entity ID goes where. (Mechanism documented
in [`react-app-tsx.md`](react-app-tsx.md).)

**Why the `User`-placement anti-pattern fails.** If you put
`show_person=UI(request=ShowPersonProps)` on `User`, where
`ShowPersonProps` carries a `person_id: str` field, you are
re-implementing a worse version of the entity-Type pattern:
the AI now has to plumb the entity ID through a request Model,
the React component receives it as a prop and must call
`usePerson({ id: personId })` explicitly, and every other
per-Person operation already lives on `Person` — so the UI is
the one method that doesn't fit. The framing of "the User is
the front door" is for **creating and locating** entity
instances. Once the AI has an entity's ID, _everything_
specific to that entity — Readers, Writers, UIs — belongs on
that entity's `Type`.

**Decision shortcut.** For each UI, ask: "is the AI passing me
an entity ID for this UI to operate on?" If yes, the UI goes
on that entity's `Type` (with `request=None`). If the answer
is "no, the UI is parameterized by free-form config the AI
fills in" (e.g. a personalization string, a dashboard layout
hint), use `request=<Model>` on whichever Type the UI conceptually
belongs to. Entity IDs are **never** the right thing to put in
a `request=<Model>` field.

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
            # `show_clicker` lives on `Counter` (not `User`)
            # because it shows ONE specific Counter. The AI calls
            # the generated `counter_show_clicker` tool with the
            # target Counter's state ID; the React hook resolves
            # that ID automatically. See the "UI Placement"
            # section above for the full rule.
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

## Parameterized UI Example — Free-Form Config Only

`request=<Model>` is for **free-form configuration the AI fills
in at call time** — a personalisation string, a dashboard
layout hint, a temperature for a generated greeting. It is
**not** the mechanism for "which entity is this UI about"; see
the "UI Placement" section above for that case.

A legitimate parameterized-UI use case: the AI greets the user
with a contextual message it composes on the fly.

```python
class DashboardConfig(Model):
    """Configuration the AI provides when opening the dashboard."""
    personalized_message: str = Field(tag=1, default="")


# On `Counter`: still operates on one specific Counter (placement
# rule unchanged) — `request=DashboardConfig` only carries the
# personalization string, NOT a Counter ID. The Counter ID is
# still the tool-call target, implicit.
show_dashboard=UI(
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
  // No `id` argument — the Counter ID is auto-resolved from
  // the tool-call target. See `react-app-tsx.md`.
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

### Anti-Pattern: Entity ID in `request=<Model>`

Do **not** use `request=<Model>` to pass an entity ID into a
UI. If you find yourself writing this:

```python
# BAD — `User` should not have a UI that operates on one Person.
class ShowPersonProps(Model):
    person_id: str = Field(tag=1, default="")

User=Type(
    state=UserState,
    methods=Methods(
        show_person=UI(
            request=ShowPersonProps,
            path="web/ui/person",
            ...
        ),
    ),
),
```

…stop, and move the UI to the entity's `Type` instead:

```python
# GOOD — UI lives on `Person`, no `request=` needed. The AI
# calls `person_show(person_id=...)`; the React `usePerson()`
# hook auto-resolves from the tool-call target.
Person=Type(
    state=PersonState,
    methods=Methods(
        show=UI(
            request=None,
            path="web/ui/person",
            title="Person",
            description="Open the visual UI for this Person.",
        ),
        ...
    ),
),
```

The "BAD" shape forces props plumbing, leaves the entity ID
sitting in a tool-input field where the AI can confuse it with
another entity's ID, and de-co-locates per-Person operations
(`get`, `set_bio`, etc. already live on `Person`). The "GOOD"
shape matches every other per-entity tool the AI already calls.

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

Use `Workflow` for periodic or long-running operations, or for external
calls (outside Reboot, including to LLMs). The declaration is similar to
other Reboot methods; the body's primitives (`at_most_once`,
`at_least_once`, `until`, `until_changes`, `context.loop`,
`MyType.ref().write(context, fn)`) are all in `python` workflow-\*
references — load them before writing the body.

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
The full rule is in `python/references/api-pydantic.md`.
