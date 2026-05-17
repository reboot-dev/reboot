---
name: chat-app
description: Build complete Reboot AI Chat Apps (MCP Apps) for ChatGPT, Claude, VSCode, Goose, and other MCP hosts. Layers on top of the python skill for backend mechanics; covers what's specific to MCP Chat Apps — the User-type front door, MCP tool exposure, the UI() method type, and the full React/Vite scaffolding.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# /chat-app — Build Reboot AI Chat Apps

Build complete Reboot AI Chat Apps from a user description.

> **Reads from `python`.** This skill is the MCP-App + React
> layer on top of the Reboot Python framework. Anything about
> Servicers, Reboot contexts, refs, scheduling primitives, error
> types, the testing harness, the `.rbtrc` shape, or pydantic API
> defaults belongs in `python` — load those references for
> those concerns. This skill covers what's _specific_ to MCP Chat
> Apps: the `User`-type front door, MCP tool exposure, the `UI()`
> method type, the React/Vite scaffolding, and the cross-cutting
> rules unique to that layer.

## Installation

### From GitHub

```bash
# 1. Add the marketplace (one-time).
claude plugin marketplace add reboot-dev/reboot-plugin

# 2. Install the plugin.
claude plugin install reboot@reboot-plugin
```

If you install the plugin within `claude` with `/plugin`, restart for
the configuration and skill to load.

Add to your project's `.claude/settings.json` so teammates are
automatically offered the plugin:

```json
{
  "extraKnownMarketplaces": {
    "reboot-plugin": {
      "source": { "source": "github", "repo": "reboot-dev/reboot-plugin" }
    }
  },
  "enabledPlugins": {
    "reboot@reboot-plugin": true
  }
}
```

### Local (repo checked out)

```bash
claude --plugin-dir /path/to/reboot-plugin
```

## When to Use

- Building a new Reboot AI Chat App from a description
- Adding features, state, or UI to an existing Reboot AI Chat App
- Modifying state model, methods, or React UI in a Reboot AI Chat App

## Read These From `python` First

Before scaffolding, load the references that cover the backend
mechanics. The patterns in this skill assume you've read them and just
show the chat-app-specific shape on top.

**Always relevant:**

- `python` references/`patterns-common-gotchas.md` — recurring
  trips (`self.ref().state_id`, kwargs convention, `--name` vs.
  `--application-name`, etc.).
- `python` references/`api-pydantic.md` — pydantic API rules
  (every Field needs a zero-value default; non-Optional `Model`-typed
  fields can't take defaults).

**Defining the API:**

- `python` references/`api-methods.md` — marker → context type
  mapping (Reader/Writer/Transaction/Workflow).
- `python` references/`api-errors.md` — typed errors.

**Implementing Servicers:**

- `python` references/`servicer-{reader,writer,transaction, constructor,authorizer}.md` — one per context type.
- `python` references/`rpc-refs.md` — `self.ref().state_id`
  (never `self.state_id`); `self.ref().schedule(...)`.
- `python` references/`rpc-calls.md` — kwargs not Request
  wrappers.
- `python` references/`rpc-constructor-calls.md` —
  `Service.create(context, id)` semantics.

**Workflows:**

- `python` references/`workflow-method.md` (start here — has
  the When-to-Pick decision table for the rest), then the specific
  primitive references for `at_most_once` / `at_least_once` / `until` /
  `until_changes` / `loop` / `state-write` / `idempotency-scopes`.

**Project shell:**

- `python` references/`lifecycle-{project-setup,rbtrc, application-entry,initialize-hook}.md` — the canonical layout, the
  CLI flags, the `Application(...)` constructor, the `initialize` hook.

## This Skill's References

Chat-app–specific topics, organized by layer. Read them on demand
the same way you would any other skill reference — the patterns
they cover aren't restated inline below.

| Reference                                                            | What's in it                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`references/project-shell.md`](references/project-shell.md)         | `.python-version`, `.rbtrc` deltas (HMR + dist configs), `pyproject.toml` extras, `main.py` shape, durable-state setup.                                                                                                                                                                                                                                                              |
| [`references/api-method-types.md`](references/api-method-types.md)   | The pydantic API file. `User`-type front door, `mcp=Tool()` / `mcp=None`, `UI()` (including parameterized UI props), `factory=True` on `create`, `Workflow(...)` declaration shape. Full Counter API example.                                                                                                                                                                        |
| [`references/api-state-shapes.md`](references/api-state-shapes.md)   | Two recurring state shapes: `list[Item]` with `default_factory=list`; single nested `Model` sub-objects as `Optional[X] = Field(tag=N, default=None)` hydrated in factory `create` (Gotcha #13). The state-inside-state regression and how to compose state actors via string ID + `ref(id)`.                                                                                        |
| [`references/servicer-patterns.md`](references/servicer-patterns.md) | Servicer-side patterns: `UserServicer` calling `<X>.create(context)`, Workflow Servicer with `MyType.ref()` (no-arg) magic, inline writers via `.idempotently("alias").write(context, fn)` / `.always().write(...)`, scheduling a workflow from a Transaction with `.schedule()`.                                                                                                    |
| [`references/react-scaffolding.md`](references/react-scaffolding.md) | The `web/` shell: `package.json` (per-UI `build:<name>` scripts, no auto-discovery wrappers), `vite.config.ts` (load-bearing — copy exactly), `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`, `index.css` theme variables, `ui/<name>/index.html`, `ui/<name>/main.tsx`.                                                                                               |
| [`references/react-app-tsx.md`](references/react-app-tsx.md)         | `App.tsx` — generated `use<Type>()` hook usage (reader subscriptions + mutation calls), Python-snake → TypeScript-camel field naming, Zod-validated request/response types. Full Counter `App.tsx` + `App.module.css` example.                                                                                                                                                       |
| [`references/gotchas.md`](references/gotchas.md)                     | The numbered MCP-Chat-App–specific trip list (1–19): `mcp=Tool()`/`mcp=None` required, `factory=True` on app-type `create`, `MyType.ref()` not `cls.ref()`/`self.ref()` in workflows, `.schedule()` from a Transaction, Optional+`default=None` for nested Models, `.read()` only on no-arg ref inside a workflow, method-name PascalCase → generated `<Type>.<Method>Request`, etc. |

## Workflow: Plan First, Then Build

**Always enter plan mode before writing code.** The state model is the
foundation — getting entities, field types, or method types wrong
means regenerating everything across 12+ files.

### Plan Phase

1. Analyze the user's description using the State Model Assessment
   below.
2. Enter plan mode (`EnterPlanMode`).
3. Present the proposed design:
   - `User` type and its methods (the MCP front door for creating new
     application-type instances and locating existing ones).
   - Application types: state shape (fields, types, tags).
   - Method map: which operations, which method type
     (Reader/Writer/Transaction/Workflow), which get `UI()`.
   - Tool surface: what the AI will see as callable tools.
4. Get user approval before writing any files.
5. Then execute the Step-by-Step Build Flow.

For updates to existing apps, still plan: read current state, propose
changes, confirm, then modify.

## State Model Assessment

Before writing code, analyze the user's request:

1. **Application types**: What primary things is the user managing?
   (counter, inventory, chat thread, etc.) Each becomes its own `Type`
   with its own state.
2. **User methods**: How does the AI create instances of application
   types? Each gets a `Transaction` on `User` that calls
   `<Type>.create(context)`.
3. **State shape**: Fields, types — lists, nested objects, primitives.
   Each gets `Field(tag=N)`. **Nested `Model` sub-objects** owned 1:1
   by a parent state must be `Optional[X] = Field(tag=N, default=None)`
   and hydrated in the parent's factory `create` Writer (Gotcha #13);
   non-Optional `Model`-typed fields reject `default=` /
   `default_factory=`. For collections, prefer `list[Item]` with
   `default_factory=list`. Full rules + examples in
   [`references/api-state-shapes.md`](references/api-state-shapes.md).
4. **Operations**: Map to the right method type:
   - `Reader` — read-only queries.
   - `Writer` — single-state mutations.
   - `Transaction` — multi-state atomic operations (e.g. transfer
     between two accounts, or User creating an application-type
     instance).
   - `Workflow` — long-running control flows with loops, scheduling,
     and idempotency helpers.
5. **Tool surface**: Which operations need UIs (`UI()`)? Which need
   explicit tool exposure (`mcp=Tool()`)?
6. **Identity**: Single default instance vs. multiple instances?
7. **Cross-state coordination**: Does any operation touch multiple
   state instances? If yes, use `Transaction`.

## Key Framework Concepts (MCP Chat App–specific)

### `User` and Application Types

Every AI Chat App has a `User` type and one or more application types:

- **`User`** is auto-constructed for each authenticated user. Its
  state is typically empty. Its methods are `Transaction`s that create
  instances of application types, or `Reader`s that find the IDs of
  existing application-type instances in indexes that have well-known
  IDs of their own.
- **Application types** (e.g. `Counter`) hold the actual state. They
  need a `create` Writer with `factory=True` for construction.

Full pydantic shape in
[`references/api-method-types.md`](references/api-method-types.md);
the `UserServicer` + `<X>.create(context)` pattern in
[`references/servicer-patterns.md`](references/servicer-patterns.md).

### Tool Exposure Control

Every method must explicitly declare its MCP exposure:

- **`mcp=Tool()`** — expose the method as an AI-callable tool.
  Required on every method (including `User` methods) the AI should
  be able to call.
- **`mcp=None`** — hide the method from the AI. Use for human-only
  actions or to reduce context bloat.
- **`Tool(name="...", title="...")`** — override the default tool
  name or add a human-readable title.

### Method Types

The `Reader` / `Writer` / `Transaction` / `Workflow` markers come from
`reboot.api` and behave exactly as `python`'s `api-methods.md`
describes (each fixes the Servicer's context type). The MCP Chat App
adds one more:

- **`UI()`** — opens a React UI in the AI chat interface. Takes
  `request=` (config type or `None`), `path=` (web dir relative to
  project root), `title=`, `description=`. **No servicer
  implementation needed** — the React app _is_ the implementation.
  When `request=` is a `Model`, its fields become props on the React
  component.

`factory=True` on an application type's `create` Writer is the
chat-app spelling of a constructor (see `python`'s
`servicer-constructor.md` for the underlying mechanic).

### Declarative, Not Decorator

All MCP surface is defined in the API file. `main.py` is minimal. No
`@mcp.tool()` decorators.

### State Is Durable

State survives restarts. `dev run --application-name=<name>` in
`.rbtrc` (see [`references/project-shell.md`](references/project-shell.md))
is what makes that work.

## Project Structure

```
<project>/
├── .python-version          # "3.10"
├── .rbtrc                   # Line-based config (NOT YAML!)
├── pyproject.toml           # Python deps (uv)
├── api/
│   └── <pkg>/v1/
│       └── <name>.py        # API definition
├── backend/
│   └── src/
│       ├── main.py          # Application entrypoint
│       └── servicers/
│           └── <name>.py    # Servicer implementation
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── index.css            # Theme variables
    └── ui/
        └── <ui-name>/
            ├── index.html
            ├── main.tsx     # RebootClientProvider entry
            ├── App.tsx      # React component
            └── App.module.css
```

## Step-by-Step Build Flow

**Only execute after plan approval. All commands run from the
application directory.**

1. Create `.python-version`, `pyproject.toml`, `.rbtrc` — see
   [`references/project-shell.md`](references/project-shell.md).
2. `uv sync`.
3. Write API definition (`api/<pkg>/v1/<name>.py`) — see
   [`references/api-method-types.md`](references/api-method-types.md)
   and [`references/api-state-shapes.md`](references/api-state-shapes.md);
   field-level pydantic rules in `python`
   references/`api-pydantic.md`.
4. `uv run rbt generate`.
5. Write servicer (`backend/src/servicers/<name>.py`) — see
   [`references/servicer-patterns.md`](references/servicer-patterns.md);
   context-type rules in `python` references/`servicer-*.md`.
6. Write `main.py` — see
   [`references/project-shell.md`](references/project-shell.md) and
   `python` references/`lifecycle-application-entry.md`.
7. `npm create @reboot-dev/ui`.
8. `cd web && npm install`.
9. `uv run rbt generate` (React bindings need `node_modules`).
10. Customize React UIs — see
    [`references/react-scaffolding.md`](references/react-scaffolding.md)
    for the `web/` shell and
    [`references/react-app-tsx.md`](references/react-app-tsx.md) for
    `App.tsx` patterns.
11. `cd web && npm run build`.
12. Create `mcp_servers.json` with
    `{"mcpServers":{"<name>":{"url":"http://localhost:9991/mcp","useOAuth":true}}}`.
13. Run the app, by doing each of the following in a separate shell in the background:
    - run the backend: `uv run rbt dev run --no-chaos` - FYI, the `--no-chaos`
      disables the Chaos Monkey, which is a useful feature to catch bugs but
      would be confusing to developers that don't themselves see the terminal
      with the information that Chaos Monkey is running.
    - serve the frontend with hot module reloading: `cd web && npm run dev`
14. Check the logs of the backend and frontend to validate that they are up and
    running. Wait until the backend logs indicate that a health check has passed,
    at which point it must have printed the URL of its inspect page.
15. Run the MCPJam inspector:
    `npx @mcpjam/inspector@2.4.0 --config mcp_servers.json --server <name>`
    Replace `<name>` with the actual server name from `mcp_servers.json`.
16. Give the user the URLs for the application's own inspect page, and for the MCPJam inspector.
17. suggest a first prompt the user can try in the inspector (e.g., "Create a new todo list and show it to me").

## Update Flow

When modifying an existing app:

1. Read `.rbtrc`, API definition, servicer, `main.py`.
2. Assess state model changes.
3. Update API definition → re-run `uv run rbt generate`.
4. Update servicer methods.
5. Update React components.

Specific patterns and file shapes live in the references above —
read them on demand based on what's changing.
