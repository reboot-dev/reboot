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
> Servicers, Reboot contexts, refs, scheduling primitives,
> backend LLM / agent calls, error types, the testing harness,
> the `.rbtrc` shape, or pydantic API defaults belongs in
> `python` — load those references for those concerns. This
> skill covers what's _specific_ to MCP Chat
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
- Running an existing Reboot AI Chat App — e.g. at the start of a
  new session. This needs no Plan or Build phase: load the
  [`run` skill](../run/SKILL.md), which detects the app type and
  starts the backend, frontend, and MCPJam inspector.

## Read These From `python` First

Before scaffolding, load the references that cover the backend
mechanics. The patterns in this skill assume you've read them and just
show the chat-app-specific shape on top.

**Always relevant:**

- `python/references/patterns-common-gotchas.md` — recurring trips
  (`self.ref().state_id`, kwargs convention, `--name` vs.
  `--application-name`, etc.).
- `python/references/api-pydantic.md` — pydantic API rules (every
  Field needs a zero-value default; non-Optional `Model`-typed
  fields can't take defaults).

**Defining the API:**

- `python/references/api-methods.md` — factory → context type
  mapping (Reader/Writer/Transaction/Workflow).
- `python/references/api-errors.md` — typed errors.
- `python/references/state-collections.md` — **always read when
  the app has any "list of X" concept.** Decides whether each X
  should be its own state `Type` (most of the time, yes) and picks
  between in-state `list[Sub]`, in-state `list[str]` of foreign
  IDs, or an `OrderedMap` of foreign IDs. The trap is
  defaulting to `list[Person]`/`list[Post]`/`list[Task]` on `User`
  for entity collections — see Step 1 of that reference.
- `python/references/state-nested-models.md` — the same rule from
  the nested-`Model` angle.

**Implementing Servicers:**

- `python/references/servicer-{reader,writer,transaction,constructor,authorizer}.md` — one per context type.
- `python/references/rpc-refs.md` — `self.ref().state_id` (never
  `self.state_id`); `self.ref().schedule(...)`.
- `python/references/rpc-calls.md` — kwargs not Request wrappers.
- `python/references/rpc-constructor-calls.md` —
  `Service.create(context, id)` semantics.

**Auth (write rules from day one — see "Auth" under Key Framework Concepts):**

- `python/references/auth-allow-if.md`,
  `python/references/auth-built-in-predicates.md`,
  `python/references/auth-custom-predicates.md` — the predicate
  machinery. Chat apps use `oauth=` for identity, so real rules are
  viable immediately.
- `python/references/auth-allow-deny.md` — narrow uses of
  unconditional rules; specifically, when **not** to reach for
  `allow()`.

**Workflows:**

- `python/references/workflow-method.md` (start here — has the
  When-to-Pick decision table for the rest), then the specific
  primitive references for `at_most_once` / `at_least_once` / `until` /
  `until_changes` / `loop` / `state-write` / `idempotency-scopes`.

**Project shell:**

- `python/references/lifecycle-{project-setup,rbtrc,application-entry,initialize-hook}.md` — the canonical layout,
  the CLI flags, the `Application(...)` constructor, the
  `initialize` hook.

## This Skill's References

Chat-app–specific topics, organized by layer. Read them on demand
the same way you would any other skill reference — the patterns
they cover aren't restated inline below.

| Reference                                                                  | What's in it                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`references/project-shell.md`](references/project-shell.md)               | `.python-version`, `.rbtrc` deltas (HMR + dist configs), `pyproject.toml` extras, `main.py` shape, durable-state setup.                                                                                                                                                                                                                                                              |
| [`references/api-method-types.md`](references/api-method-types.md)         | The pydantic API file. `User`-type front door, `mcp=Tool()` / `mcp=None`, `UI()` (including parameterized UI props), `factory=True` on `create`, `Workflow(...)` declaration shape. Full Counter API example.                                                                                                                                                                        |
| [`references/api-state-shapes.md`](references/api-state-shapes.md)         | Two recurring state shapes: `list[Item]` with `default_factory=list`; single nested `Model` sub-objects as `Optional[X] = Field(tag=N, default=None)` hydrated in factory `create` (Gotcha #13). The state-inside-state regression and how to compose state actors via string ID + `ref(id)`.                                                                                        |
| [`references/servicer-patterns.md`](references/servicer-patterns.md)       | Servicer-side patterns: `UserServicer` calling `<X>.create(context)`, Workflow Servicer with `MyType.ref()` (no-arg) magic, inline writers via `.idempotently("alias").write(context, fn)` / `.always().write(...)`, scheduling a workflow from a Transaction with `.schedule()`.                                                                                                    |
| [`references/react-scaffolding.md`](references/react-scaffolding.md)       | The `web/` shell: `package.json` (per-UI `build:<name>` scripts, no auto-discovery wrappers), `vite.config.ts` (load-bearing — copy exactly), `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`, `index.css` theme variables, `ui/<name>/index.html`, `ui/<name>/main.tsx`.                                                                                               |
| [`references/react-app-tsx.md`](references/react-app-tsx.md)               | `App.tsx` — generated `use<Type>()` hook usage (reader subscriptions + mutation calls), Python-snake → TypeScript-camel field naming, Zod-validated request/response types. Full Counter `App.tsx` + `App.module.css` example.                                                                                                                                                       |
| [`references/gotchas.md`](references/gotchas.md)                           | The numbered MCP-Chat-App–specific trip list (1–19): `mcp=Tool()`/`mcp=None` required, `factory=True` on app-type `create`, `MyType.ref()` not `cls.ref()`/`self.ref()` in workflows, `.schedule()` from a Transaction, Optional+`default=None` for nested Models, `.read()` only on no-arg ref inside a workflow, method-name PascalCase → generated `<Type>.<Method>Request`, etc. |
| [`references/auth-oauth-providers.md`](references/auth-oauth-providers.md) | Upgrading `Application(oauth=...)` from `Anonymous()` to `Google` / `GitHub` before going to production. The one-line code swap, where credentials come from, and the user-ID-namespace gotcha that makes post-launch migrations infeasible — lean hard on doing this **before** real users have state.                                                                              |

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

### Writing the Plan for Human Review

The plan is read by a **human who has not read the skill files**.
They are evaluating the design — entities, collections, methods,
auth — not verifying that you followed the skill. Write so the
plan stands on its own.

**Don't quote skill-internal terms** when presenting the plan.
They mean nothing outside this skill:

- `Shape A` / `Shape B` / `Shape C` — name the actual data
  structure: `list[Sub]` of inline sub-records, `list[str]` of
  foreign state IDs, `OrderedMap` of foreign state IDs.
- "non-state `Model`" — say "a flat sub-record that lives and
  dies with the parent" or "no identity of its own", in domain
  terms.
- `Gotcha #N` and filenames like `state-collections.md` /
  `api-state-shapes.md` / `gotchas.md` — drop the citation; if
  the rule matters to the design, explain it inline.
- `factory=True`, `Field(tag=N)`, raw pydantic spellings — fine
  to mention briefly when the spelling itself is the design
  decision, but never as the explanation.

**For every design choice, give the what + the why.** The _what_
is the concrete data structure or method type. The _why_ is a
one-clause reason rooted in the user's domain ("grows without
bound, so we need pagination"; "no methods or auth of its own,
so it lives inline").

**Examples.**

Collection shape — BAD:

> `people_index_id: str` — ID of an OrderedMap actor that
> holds this user's Persons (Shape C from state-collections.md
> — unbounded; PRM is explicitly called out as a Shape C case).

Collection shape — GOOD:

> `people_index_id: str` — points to an OrderedMap that holds
> this user's Persons. An OrderedMap (rather than an inline
> list) because a PRM grows without bound and the UI will
> paginate / sort by recency.

Nested model — BAD:

> Relationship and Event are non-state Models — Shape A.

Nested model — GOOD:

> Relationship and Event live inline on Person as
> `list[Relationship]` / `list[Event]`. They don't get their
> own state actors because they have no lifecycle, methods, or
> auth independent of the Person they belong to.

**Escape hatch.** When the precise type name _is_ what the user
needs to see ("I'm proposing `OrderedMap` here, not `list[str]`"),
name the type — but pair it with the plain-English reason in the
same sentence. The rule is "no bare jargon", not "no technical
terms".

## State Model Assessment

Before writing code, analyze the user's request:

1. **Application types — decompose aggressively.** List every
   distinct entity the user is going to add / edit / list / find
   over time (people, posts, tasks, events, documents, accounts,
   …). **Each entity becomes its own `Type` with its own state**,
   even when "each User only has a few of them". Anything you can
   imagine the user `add`-ing / `remove`-ing / `find`-ing by name
   has its own identity and belongs in its own actor. The default
   wrong move is packing everything into `User`'s state as
   `list[Person]` (or `list[Post]`, `list[Task]`, …) — that
   flattens N actors into one, prevents per-entity auth/methods,
   and forces a full rewrite when the collection grows. See
   `python/references/state-collections.md` Step 1 for the full
   decomposition signal list.
2. **Container shape for each collection.** Once an entity is its
   own `Type`, the parent (typically `User`) stores **references**,
   not objects. Three shapes (full table + worked PRM example in
   `python/references/state-collections.md`):
   - `list[Sub]` of non-state `Model`s — for bounded sub-records
     that genuinely belong with the parent (line items on an Order,
     tags on a Post). NOT for entity collections.
   - `list[str]` of foreign state IDs — when the collection of
     entity IDs is bounded (low hundreds, occasionally low
     thousands) and you always read it whole.
   - `OrderedMap` of foreign state IDs — when the collection
     grows without bound, needs pagination, range queries, or
     ordered iteration. The default choice for any "list of
     things the user keeps adding to" (people in a PRM, posts
     on a blog, messages in a thread).
3. **User methods**: How does the AI create instances of application
   types? Each gets a `Transaction` on `User` that calls
   `<Type>.create(context)`, then registers the new ID in the
   appropriate container (Shape B or C above).
4. **State shape (per type)**: Fields, types — lists, nested
   objects, primitives. Each gets `Field(tag=N)`. **Nested `Model`
   sub-objects** owned 1:1 by a parent state must be
   `Optional[X] = Field(tag=N, default=None)` and hydrated in the
   parent's factory `create` Writer (Gotcha #13); non-Optional
   `Model`-typed fields reject `default=` / `default_factory=`.
   Full rules + examples in
   [`references/api-state-shapes.md`](references/api-state-shapes.md).
5. **Operations**: Map to the right method type:
   - `Reader` — read-only queries.
   - `Writer` — single-state mutations.
   - `Transaction` — multi-state atomic operations (e.g. transfer
     between two accounts, or User creating an application-type
     instance).
   - `Workflow` — long-running control flows with loops, scheduling,
     and idempotency helpers.
6. **Tool surface**: Which operations need UIs (`UI()`)? Which need
   explicit tool exposure (`mcp=Tool()`)?
7. **Identity**: Single default instance vs. multiple instances?
8. **Cross-state coordination**: Does any operation touch multiple
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

### Auth: `oauth=Anonymous()` and Real Authorizers from Day One

MCP Chat Apps wire identity via `Application(oauth=...)` — typically
`oauth=Anonymous()` during early development. `Anonymous()` is a real
OAuth provider: every caller is issued a verified `anon-{ULID}`
`context.auth.user_id`, no external IdP or sign-in UI required. The
same `oauth=` slot later accepts Google / GitHub / etc. providers
without changing servicer-side code.

> **Before going to production: upgrade to a real provider.** See
> [`references/auth-oauth-providers.md`](references/auth-oauth-providers.md).
> The swap is one line, but `Anonymous()` and real providers issue
> identities in different namespaces — anything keyed on user ID is
> stranded after the swap. Migrating is rarely viable; do this
> **before** real users have state.

Consequences for authorizers:

- **Write `authorizer()` on every Servicer from day one.** Don't
  defer it "until prod." Identity is wired the same in dev and prod,
  so production-shaped rules (`allow_if(all=[state_id_is_user_id])`,
  `allow_if(all=[has_verified_token])`, etc.) work immediately.
- **Don't use `allow()` as a default.** It declares "this endpoint
  is public on the internet, no identity required" — not what you
  want for app-state methods.
- **`User`-type Servicers don't need a custom `authorizer()`.** The
  framework's default rule (`state_id_is_user_id` + `is_app_internal`)
  is production-worthy already.
- **Application-type Servicers (`Counter`, `TodoList`, …)** typically
  use `allow_if(all=[state_id_is_user_id])` when the state belongs to
  one user, or compose other predicates (`has_verified_token`,
  custom) when state is shared.

Backend mechanics — predicate composition, custom predicates, the
function-vs-instance footgun — live in `python/references/auth-*.md`
and `python/references/servicer-authorizer.md`. The chat-app delta
is just **which mode you're in**: `oauth=` + real rules from day one.

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
   field-level pydantic rules in
   `python/references/api-pydantic.md`.
4. `uv run rbt generate`.
5. Write servicer (`backend/src/servicers/<name>.py`) — see
   [`references/servicer-patterns.md`](references/servicer-patterns.md);
   context-type rules in `python/references/servicer-*.md`.
6. Write `main.py` — see
   [`references/project-shell.md`](references/project-shell.md) and
   `python/references/lifecycle-application-entry.md`.
7. `npm create @reboot-dev/ui`.
8. `cd web && npm install`.
9. `uv run rbt generate` (React bindings need `node_modules`).
10. Customize React UIs — see
    [`references/react-scaffolding.md`](references/react-scaffolding.md)
    for the `web/` shell and
    [`references/react-app-tsx.md`](references/react-app-tsx.md) for
    `App.tsx` patterns.
11. `cd web && npm run build`.
12. **Write and run backend unit tests covering each user-facing
    user story before handing the app off.** Enumerate the user
    stories from the plan — every action the user should be able
    to _do_ through the MCP tool surface (e.g. "create a new
    todo list", "add an item and see it listed", "rename a
    list"). Write one test method per user story in
    `backend/tests/<servicer>_test.py`, following the patterns
    in `python/references/testing-project-setup.md`,
    `python/references/testing-harness.md`, and
    `python/references/testing-external-context.md`. Use one
    `IsolatedAsyncioTestCase`, one external context per test
    (`name=f"test-{self.id()}"`), and
    `Service.ref(id).method(context, ...)` for all calls —
    never instantiate Servicers directly. If any servicer has a
    real `authorizer()`, use the permissive-subclass pattern
    from `testing-harness.md`. Run `cd backend && uv run pytest`
    and fix anything that fails. Do not proceed to the next
    step until every user-story test passes — these tests are
    the gate that catches contract bugs before the user sees
    them in MCPJam.
13. Create `mcp_servers.json` with
    `{"mcpServers":{"<name>":{"url":"http://localhost:9991/mcp","useOAuth":true}}}`.
14. Run the app — load the [`run` skill](../run/SKILL.md) and
    follow it. It is the single canonical "start the app"
    procedure: it detects the app type, makes sure dependencies
    and secrets are in place, and starts the backend, frontend,
    and MCPJam inspector.

## Update Flow

When modifying an existing app:

1. Read `.rbtrc`, API definition, servicer, `main.py`.
2. Assess state model changes.
3. Update API definition → re-run `uv run rbt generate`.
4. Update servicer methods.
5. Update React components.
6. If the app isn't already running, bring it up with the
   [`run` skill](../run/SKILL.md). If it is already running under
   `rbt dev run`, the `--watch` globs reload it automatically — no
   restart needed. Editing `.env` likewise triggers a restart, so
   a new or changed secret is re-read by `--env-file` without a
   manual relaunch.

Specific patterns and file shapes live in the references above —
read them on demand based on what's changing.
