---
name: mcp-app
description: Build complete Reboot MCP Apps for ChatGPT, Claude, VSCode, Goose, and other MCP hosts. Layers on top of the python skill for backend mechanics; covers what's specific to MCP Apps — the User-type front door, MCP tool exposure, the UI() method type, and the full React/Vite scaffolding.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# mcp-app — Build Reboot MCP Apps

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

Build complete Reboot MCP Apps from a user description.

> **Reads from `python`.** This skill is the MCP App + React
> layer on top of the Reboot Python framework. Anything about
> Servicers, Reboot contexts, refs, scheduling primitives,
> backend LLM / agent calls, error types, the testing harness,
> the `.rbtrc` shape, or pydantic API defaults belongs in
> `python` — load those references for those concerns. This
> skill covers what's _specific_ to MCP Chat
> Apps: the `User`-type front door, MCP tool exposure, the `UI()`
> method type, the React/Vite scaffolding, and the cross-cutting
> rules unique to that layer.

> **Dual-frontend apps are supported.** A single app can serve both
> an MCP front door _and_ a standalone browser SPA from the same
> backend; they share `oauth=...`, the same `User` per upstream
> identity, and the same servicer code. For the standalone SPA
> piece, also load the
> [web-app skill](../web-app/SKILL.md). A user who signs in on
> one frontend is signed in on both (cross-frontend SSO): the OAuth
> server's `/authorize` short-circuits when the browser already
> carries a session cookie, and `/callback` sets that cookie
> on every flow.

## Installation

Install the plugin (works for both Claude Code and Codex):

```bash
curl -fsSL https://reboot.dev/install.sh | bash
```

This installs the skills for whichever of Claude Code / Codex you
have, then restart your agent so the skills load. See the plugin
README for the manual install, team auto-enable, and the Codex
`skill-installer` routes.

## When to Use

- Building a new Reboot MCP App from a description
- Adding features, state, or UI to an existing Reboot MCP App
- Modifying state model, methods, or React UI in a Reboot MCP App
- Running an existing Reboot MCP App — e.g. at the start of a
  new session. This needs no design or build phase: load the
  [`run` skill](../run/SKILL.md), which detects the app type,
  starts the backend and frontend, and opens the setup wizard (from
  which the user can launch MCPJam on demand).

## Which References to Read, and When

The backend mechanics live in the `python` skill's references,
including the MCP App's API, servicer and sign-in references; the
React references live in the `frontend` skill. Neither set is
restated inline below.

Everything you read stays in the conversation and is re-sent on
every later turn, so **read each reference at the step that needs
it** — not all of them up front — and read each one **once**. The
groups below are in build order, and each reference appears in
exactly one of them — the step that needs it.

> **Never read `frontend/references/react-client.md` for an MCP App.** It covers
> the standalone browser SPA — the `frontend/web/` SPA, the
> `VITE_REBOOT_URL` backend URL, `<RebootClientProvider>`,
> browser sign-in buttons — none of which apply to the nested
> `frontend/mcp/<name>/` bundles an MCP host loads. The MCP App
> equivalents are
> [`frontend/references/react-mcp-scaffolding.md`](../frontend/references/react-mcp-scaffolding.md)
> and [`frontend/references/react-app-tsx.md`](../frontend/references/react-app-tsx.md).

**Before the project shell** (`.python-version`, `pyproject.toml`,
`.rbtrc`, `.mypy.ini`, `main.py`):

- [`python/references/lifecycle-mcp-app-shell.md`](../python/references/lifecycle-mcp-app-shell.md) —
  `.python-version`, `.rbtrc` deltas (the `portless`, `ports` and `dist` configs),
  `pyproject.toml` extras, `main.py` shape, the `example_prompts.py`
  module wired into `Application(example_prompts=...)`,
  durable-state setup.
- `python/references/lifecycle-{project-setup,rbtrc,application-entry,initialize-hook}.md` — the canonical layout, the CLI flags, the
  `Application(...)` constructor, the `initialize` hook.

**Before the API definition:**

- `python/references/patterns-common-gotchas.md` — recurring trips
  (`self.ref().state_id`, kwargs convention, a `ref()` belongs to
  one context, the auto-constructed `User` type, `--name` vs.
  `--application-name`).
- `python/references/api-pydantic.md` — pydantic API rules (every
  Field needs a zero-value default; non-Optional `Model`-typed
  fields can't take defaults).
- `python/references/api-methods.md` — factory → context type
  mapping (Reader/Writer/Transaction/Workflow).
- `python/references/api-errors.md` — typed errors, when the API
  declares any.
- `python/references/state-collections.md` — **always read when the
  app has any "list of X" concept.** Decides whether each X should
  be its own state `Type` (most of the time, yes) and picks between
  in-state `list[Sub]`, in-state `list[str]` of foreign IDs, or an
  `OrderedMap` of foreign IDs. The trap is defaulting to
  `list[Person]`/`list[Post]`/`list[Task]` on `User` for entity
  collections — see Step 1 of that reference. A second trap: a
  collection **synced or scraped from an external system** (a
  repo's issues, a mailbox, an RSS feed) is unbounded by
  definition — model it as an `OrderedMap`; a size cap never makes
  it bounded.
- `python/references/state-nested-models.md` — the same rule from
  the nested-`Model` angle.
- `python/references/state-actor-decomposition.md` — the orthogonal
  decomposition: when one state `Type` has accreted multiple
  unrelated concerns (auth/session, persona, background-engine,
  transient cache), split each into its own `Type`. Critical for the
  `User` front door, which otherwise turns into a God actor and
  serializes unrelated writers.
- [`python/references/api-method-types.md`](../python/references/api-method-types.md)
  — the pydantic API file for an MCP App: `User`-type front door,
  `mcp=Tool()` / `mcp=None`, `UI()` (including parameterized UI
  props), `factory=True` on `create`, the `Workflow(...)`
  declaration shape. Full Counter API example.
- [`python/references/api-state-shapes.md`](../python/references/api-state-shapes.md)
  — two recurring state shapes: `list[Item]` with
  `default_factory=list`; single nested `Model` sub-objects as
  `Optional[X] = Field(tag=N, default=None)` hydrated in factory
  `create` (the gotcha "Nested `Model` fields can't take
  `default_factory` or `default`" in `patterns-mcp-app-gotchas.md`).
  The state-inside-state regression and how to compose state actors
  via string ID + `ref(id)`.
- [`python/references/patterns-mcp-app-gotchas.md`](../python/references/patterns-mcp-app-gotchas.md)
  — the MCP App's backend gotchas: `mcp=Tool()`/`mcp=None` required,
  `factory=True` on app-type `create`, `MyType.ref()` not
  `cls.ref()`/`self.ref()` in workflows, `.schedule()` from a
  Transaction, Optional+`default=None` for nested Models, `.read()`
  only on a no-arg ref inside a workflow, method-name PascalCase →
  generated `<Type>.<Method>Request`. The React side's list is
  [`frontend/references/gotchas-mcp-app.md`](../frontend/references/gotchas-mcp-app.md).

**Before the servicer:**

- `python/references/servicer-{reader,writer,transaction,constructor}.md` — one per context type you actually declared.
- `python/references/rpc-refs.md` — `self.ref().state_id` (never
  `self.state_id`); `self.ref().schedule(...)`.
- `python/references/rpc-calls.md` — kwargs, not Request wrappers.
- `python/references/rpc-constructor-calls.md` —
  `Service.create(context, id)` semantics.
- `python/references/servicer-workflow.md` — only when you declared
  a `Workflow`, and then top to bottom: the `@classmethod` /
  `WorkflowContext` declaration shape, the call-classification
  decision tree (Reboot scopes vs. `at_least_once` vs.
  `at_most_once`), `context.loop`, inline state writes,
  `until` / `until_changes`, and workflow exit semantics.
- [`python/references/servicer-patterns.md`](../python/references/servicer-patterns.md)
  — the MCP App servicer shapes: `UserServicer` calling
  `<X>.create(context)`, a Workflow Servicer with `MyType.ref()`
  (no-arg) magic, inline writers via
  `.per_workflow("alias").write(context, fn)` /
  `.per_iteration("alias").write(...)` / `.always().write(...)`,
  scheduling a workflow from a Transaction with `.schedule()`.

**Before the authorizers** (write rules from day one — see "Auth" in
`python/references/mcp-app-concepts.md`):

- `python/references/servicer-authorizer.md`,
  `python/references/auth-allow-if.md`,
  `python/references/auth-built-in-predicates.md`,
  `python/references/auth-custom-predicates.md` — the predicate
  machinery. MCP Apps use `oauth=` for identity, so real rules are
  viable immediately.
- `python/references/auth-allow-deny.md` — narrow uses of
  unconditional rules; specifically, when **not** to reach for
  `allow()`.
- [`python/references/auth-oauth-providers.md`](../python/references/auth-oauth-providers.md)
  — choosing your `Application(oauth=...)` provider via
  `OAuthProviderByEnvironment(dev=..., prod=...)` (the recommended
  `dev=Development(), prod=Google(...)` shape; a selected `None` arm
  fails startup), the `Google` / `GitHub` / `Auth0` / `Development` /
  `Anonymous` providers and where credentials come from (incl. the
  `/__/oauth/callback` URL), and the user-ID-namespace gotcha that
  makes switching providers after launch infeasible — choose
  deliberately **before** real users have state.
- [`python/references/auth-custom-oauth-provider.md`](../python/references/auth-custom-oauth-provider.md)
  — **writing your own OAuth provider** when none of the shipped
  ones fits (self-hosted Keycloak, internal SSO, an IdP Auth0 can't
  broker): subclass `RegisteredOAuthProvider`, implement
  `authorization_url` + `exchange_code` → `ExchangeResult` (the user
  id must be **stable** — it becomes `context.auth.user_id`), the
  `validate()` / `mount_routes()` hooks, and `token_service_id` +
  `OAuthTokens` for `store_tokens=True` support.
- [`python/references/auth-store-tokens.md`](../python/references/auth-store-tokens.md)
  — **acting on the user's behalf** at an external service: when the
  API belongs to your `Application(oauth=...)` identity provider,
  add extra OAuth `scopes=[...]` + `store_tokens=True` (needs
  `oauth_library()` + `ciphertext_library()` +
  `ordered_map_library()`) and the server captures its tokens.
  Reboot stores **the provider's own tokens only** (an `Auth0`
  sign-in stores an Auth0 token, not the upstream Google token). The
  full host-agnostic recipe — custom OAuth endpoints for any _other_
  service, reading tokens back, calling the API **inside a
  `Workflow`**, refresh tokens, erasure — is
  [`python/references/auth-external-api-calls.md`](../python/references/auth-external-api-calls.md).

**Before the frontend:**

- [`frontend/references/react-mcp-scaffolding.md`](../frontend/references/react-mcp-scaffolding.md)
  — the `frontend/` shell: `package.json` and `build.mjs` (`npm run build` calls the package's `build()`, which builds every UI the
  plugin declares; a frontend with one UI could use plain `vite build`, as the web-only shell does),
  `vite.config.ts` (the stock Vite file plus `reboot()`),
  `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`,
  `index.css` theme variables, `mcp/<name>/index.html`,
  `mcp/<name>/main.tsx`.
- [`frontend/references/react-app-tsx.md`](../frontend/references/react-app-tsx.md) —
  `App.tsx` itself: what an MCP App component renders, and the full
  Counter `App.tsx` + `App.module.css` example.
- `frontend/references/react-generated-client.md` — what
  `rbt generate --react=` emits, identically for every frontend: the
  `use<Type>()` overloads, the three-field reader return, why
  mutations resolve to `{ response, aborted }` instead of throwing,
  the typed error classes, and the snake→camel naming rules.
- [`frontend/references/pop-out-to-web-app.md`](../frontend/references/pop-out-to-web-app.md)
  — only when a widget needs a "pop out into the web app" button:
  recover the bound entity ID with the generated hook's `state_id`,
  build a deep-link URL, and open it via the host's
  `useMcpApp().openLink({ url })` (the sandboxed iframe blocks
  `window.open`) with a `window.open` fallback. The web-app side
  reads the ID from the URL; a shared `rbt_session` keeps the user
  signed in across frontends.

**Before the tests:** `python/references/testing-project-setup.md`
and `python/references/testing-features.md` (the built-in steps'
spelling; always), plus `python/references/patterns-idempotency.md`
— it explains `IdempotencyUncertainError`, which is otherwise the
one runtime error whose cause is not in any reference you have
read. `python/references/testing-harness.md` and
`testing-external-context.md` are for custom steps;
`testing-failure-recovery.md` is the one to read whenever the app
has a spawned task, a `Workflow`, or `schedule()`d work: it covers
restarting the app under test and asserting that work survived.
The order of work around the feature files (agree in English, tag
`@wip`, iterate on scenarios) is the
[`feature` skill](../feature/SKILL.md).

**Before running the app:** the [`run` skill](../run/SKILL.md).

If you find yourself grepping the framework's installed source or a
generated file to answer a question, the next section is for you —
do not explore it in the main conversation.

## Never Read Generated or Installed Source in the Main Thread

`*_rbt.py`, `*_rbt_react.ts`, `site-packages/`, `node_modules/`,
and codegen templates run to tens of thousands of lines. Every one
you open is re-sent on every remaining turn, which makes reading
them the most expensive way in the system to learn a fact.

The generated surfaces you actually need are written out in these
references — the React client in
`frontend/references/react-generated-client.md`, the backend shapes in
the rest of `python/references/`. Use them.

If something genuinely isn't covered, bound the output hard: a
targeted `grep -n … | head -40`, or `sed -n '<start>,<end>p'` over
a known range. Never a whole generated file, never an unbounded
recursive grep.

## Workflow: Settle the Design, Then Build

**Always settle the design before writing code.** The state model
is the foundation — getting entities, field types, or method types
wrong means regenerating everything across 12+ files.

### Design Phase

1. Analyze the user's description using the State Model Assessment
   below.
2. State the design you are about to build:
   - `User` type and its methods (the MCP front door for creating new
     application-type instances and locating existing ones).
   - Application types: state shape (fields, types, tags).
   - Method map: which operations, which method type
     (Reader/Writer/Transaction/Workflow), which get `UI()`.
   - Tool surface: what the AI will see as callable tools.
   - Example prompts: the ~3 named chat scenarios the root-page
     wizard will offer, each a sequence of messages exercising a
     main user story — and most of them ending on a turn that
     renders a `UI()` component, not just a tool call (see
     "Example Prompts" in `python/references/mcp-app-concepts.md`).
3. Then execute the Step-by-Step Build Flow.

For updates to existing apps, still work the design first: read
current state, state the changes, then modify.

### Writing the Design for a Human Reader

The design is read by a **human who has not read the skill files**.
They are judging the design — entities, collections, methods,
auth — not verifying that you followed the skill. Write so it
stands on its own.

**Don't quote skill-internal terms** when presenting the design.
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

Collection shape reasoning — BAD, uses skill-internal terms:

> `people_index_id: str` — ID of an OrderedMap actor that
> holds this user's Persons (Shape C from state-collections.md
> — unbounded; PRM is explicitly called out as a Shape C case).

Collection shape reasoning — GOOD:

> `people_index_id: str` — points to an OrderedMap that holds
> this user's Persons. An OrderedMap (rather than an inline
> list) because a PRM grows without bound and the UI will
> paginate / sort by recency.

Nested model reasoning — BAD, uses skill-internal terms:

> Relationship and Event are non-state Models — Shape A.

Nested model reasoning — GOOD:

> Relationship and Event live inline on Person as
> `list[Relationship]` / `list[Event]`. They don't get their
> own state actors because they have no lifecycle, methods, or
> auth independent of the Person they belong to.

**Escape hatch.** When the precise type name _is_ what the reader
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
   and forces a full rewrite when the collection grows. A
   collection your app **syncs or scrapes from an external
   system** (a GitHub repo's issues, a mailbox, an RSS feed) is an
   entity collection too — and unbounded by definition — even
   though the user never "adds" to it directly. See
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
     on a blog, messages in a thread) and for anything synced
     from an external source (a repo's issues, a mailbox).

   **Boundedness is a domain fact, not a number you pick.** If you
   catch yourself adding a size cap (`MAX_ITEMS = 40`) so a
   collection counts as "bounded" and qualifies for `list[Sub]` or
   `list[str]`, it is unbounded — use `OrderedMap`. Externally-
   synced collections are always `OrderedMap`. The boundedness
   guard in `python/references/state-collections.md` has the full
   rule.

3. **User methods**: How does the AI create instances of application
   types? Each gets a `Transaction` on `User` that calls
   `<Type>.create(context)`, then registers the new ID in the
   appropriate container (Shape B or C above).
4. **State shape (per type)**: Fields, types — lists, nested
   objects, primitives. Each gets `Field(tag=N)`. **Nested `Model`
   sub-objects** owned 1:1 by a parent state must be
   `Optional[X] = Field(tag=N, default=None)` and hydrated in the
   parent's factory `create` Writer (the gotcha "Nested `Model`
   fields can't take `default_factory` or `default`"); non-Optional
   `Model`-typed fields reject `default=` / `default_factory=`.
   Full rules + examples in
   [`python/references/api-state-shapes.md`](../python/references/api-state-shapes.md).
5. **Operations**: Map to the right method type:
   - `Reader` — read-only queries.
   - `Writer` — single-state mutations.
   - `Transaction` — multi-state atomic operations (e.g. transfer
     between two accounts, or User creating an application-type
     instance).
   - `Workflow` — long-running control flows with loops, scheduling,
     and idempotency helpers.
6. **Tool surface**: Which operations need explicit tool exposure
   (`mcp=Tool()`)? Default Servicer methods to `mcp=Tool()` if the
   AI should call them, `mcp=None` otherwise.
7. **UI placement** — for each UI in the app: **is the AI passing
   in an entity ID for this UI to operate on, or is the UI about
   the user as a whole?** Per-entity UIs (`show_person`,
   `edit_task`, `view_document`) go on the entity's own `Type`
   with `request=None` — the AI's tool-call target becomes the
   actor ID automatically, and the generated `use<Type>()` hook
   resolves it with no arguments. User-scoped UIs (a dashboard,
   a global browser) go on `User`. Putting a per-entity UI on
   `User` with the entity ID inside a `request=<Model>` field is
   an antipattern; see "UI Placement" in
   [`python/references/api-method-types.md`](../python/references/api-method-types.md).
8. **Identity**: Single default instance vs. multiple instances?
9. **Cross-state coordination**: Does any operation touch multiple
   state instances? If yes, use `Transaction`.

## When Correct Decomposition Fights the UI

The React references in this skill show **one `use<Type>()`
subscription per UI** — one hook, one actor, one live feed. That
is the easy, documented path, and it quietly pressures you to
flatten an entity collection into `list[Item]` on a single actor
just so the dashboard can read it in one subscription.

**Resolve the tension the other way: the data model wins.** When
a collection is its own entity type (Assessment step 1) or
unbounded (step 2, Shape C), keep it decomposed — one actor per
item, an `OrderedMap` index on the parent — even though that is
more than one actor. Do **not** collapse the model to fit the
single-subscription pattern. A demo-correct `list[Item]` that
must be torn apart the moment a real data source is pointed at it
is the exact failure this skill exists to prevent.

The UI still gets its single subscription. Add a **composing
reader** on the front-door type: a `Reader` that ranges the
parent's `OrderedMap` for one page of IDs, reads each item actor,
and returns a page of fully-hydrated objects plus a `next_cursor`.
The React UI subscribes to that one reader and pages by cursor —
the fan-out across item actors happens server-side, inside the
reader. The composing-reader pattern (backend reader + React
subscription) is in
[`frontend/references/react-app-tsx.md`](../frontend/references/react-app-tsx.md);
Shape C is in `python/references/state-collections.md`.

## Key Framework Concepts (MCP App–specific)

The `User` front door, tool exposure with `mcp=`, the `UI()` method
type, sign-in with `oauth=` and authorizers from day one, and the
example prompts are in
[`python/references/mcp-app-concepts.md`](../python/references/mcp-app-concepts.md).
Read it before the design.

## Project Structure

```
<project>/
├── .python-version          # "3.10"
├── .rbtrc                   # Line-based config (NOT YAML!)
├── .mypy.ini                # Type-check config (python skill)
├── pyproject.toml           # Python deps (uv)
├── api/
│   └── <pkg>/v1/
│       └── <name>.py        # API definition
├── pytest.ini               # testpaths: tests; pythonpath: backend/src backend/api api
├── backend/
│   └── src/
│       ├── main.py          # Application entrypoint
│       ├── example_prompts.py  # Wizard example prompts
│       └── servicers/
│           └── <name>.py    # Servicer implementation
├── tests/
│   ├── <capability>.feature  # One feature per capability
│   └── <name>_test.py       # `application` fixture + `scenarios(...)`
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    ├── vite.config.ts       # defineConfig({ plugins: [react(), reboot({...})] })
    ├── api/                 # Generated React bindings (rbt generate)
    ├── mcp/
    │   └── <ui-name>/
    │       ├── index.html
    │       ├── index.css        # Theme variables
    │       ├── main.tsx         # RebootClientProvider entry
    │       ├── App.tsx          # React component
    │       └── App.module.css
    └── web/                 # Optional standalone browser SPA
        ├── index.html
        └── src/
            ├── main.tsx
            └── App.tsx
```

## Step-by-Step Build Flow

**All commands run from the application directory.**

1. Create `.python-version`, `pyproject.toml`, `.rbtrc`, and
   `.mypy.ini` — see
   [`python/references/lifecycle-mcp-app-shell.md`](../python/references/lifecycle-mcp-app-shell.md);
   the `.mypy.ini` template lives in
   `python/references/lifecycle-project-setup.md`. Then give the
   project its `AGENTS.md` and `CLAUDE.md` with the
   [`agents-md` skill](../agents-md/SKILL.md), naming the API and
   servicer files the design settled on.
2. `uv sync`.
3. Start the developer dashboard — load the
   [`dashboard` skill](../dashboard/SKILL.md) and follow it — so
   the user can watch the API take shape while you write it. If it
   fails to come up, say so in one sentence and keep building; do
   not stop to debug it.
4. Write API definition (`api/<pkg>/v1/<name>.py`) — see
   [`python/references/api-method-types.md`](../python/references/api-method-types.md)
   and [`python/references/api-state-shapes.md`](../python/references/api-state-shapes.md);
   field-level pydantic rules in
   `python/references/api-pydantic.md`.
5. `uv run rbt generate`. Don't read what it wrote: the signature
   your servicer must match is in `python/references/api-methods.md`
   ("The Servicer Signature Each Declaration Obliges").
6. Write servicer (`backend/src/servicers/<name>.py`) — see
   [`python/references/servicer-patterns.md`](../python/references/servicer-patterns.md);
   context-type rules in `python/references/servicer-*.md`.
7. Write `backend/src/example_prompts.py` (the wizard's example
   prompts) and `main.py` (which imports them and passes
   `example_prompts=` to `Application`) — see
   [`python/references/lifecycle-mcp-app-shell.md`](../python/references/lifecycle-mcp-app-shell.md) and
   `python/references/lifecycle-application-entry.md`.
8. `npm create @reboot-dev/ui`.
9. `cd frontend && npm install`.
10. `uv run rbt generate` (React bindings need `node_modules`).
11. Customize React UIs — see
    [`frontend/references/react-mcp-scaffolding.md`](../frontend/references/react-mcp-scaffolding.md)
    for the `frontend/` shell and
    [`frontend/references/react-app-tsx.md`](../frontend/references/react-app-tsx.md) for
    `App.tsx` patterns.
12. `cd frontend && npm run build`.
13. **Write and run the scenarios of every feature before handing
    the app off.** Each feature file from the design phase (the
    [`feature` skill](../feature/SKILL.md)) gets its scenarios now:
    every action the user should be able to _do_ through the MCP
    tool surface ("create a new todo list", "add an item and see it
    listed", "rename a list") is a scenario in the built-in steps
    of `python/references/testing-features.md`, calling the
    methods the tools call. Every step names who calls; a user is
    declared with `"alice" is an authenticated user`, which is how
    the real authorizers get exercised: register the **real**
    servicers and never subclass one to weaken its `authorizer()`.
    Let factories make ids up. Tag what cannot pass yet `@blocked`
    with its reason; leave `@wip` where work continues. Run
    `uv run pytest` and fix anything that fails.
    Then type-check: run `uv run mypy backend/ tests/` from the project
    root and fix every error (config and rationale in
    `python/references/lifecycle-project-setup.md`). Do not
    proceed to the next step until every scenario passes (or is
    `@blocked` with a reason) and mypy is green — together they
    are what catches contract bugs before the user sees them in
    MCPJam. Point the user at the dashboard's Features page to
    review the features.
14. Run the app — load the [`run` skill](../run/SKILL.md) and
    follow it. It is the single canonical "start the app"
    procedure: it detects the app type, makes sure dependencies
    and secrets are in place, and starts the backend and
    frontend. Required final hand-over: if you started the developer
    dashboard, include the `cloudflared` command and the Claude and
    ChatGPT connector instructions in your final response. This
    applies even when the user asked only for a standalone web app and
    never mentioned MCP. Do not omit them for brevity or perceived
    relevance. A dashboard URL, or instructions saved in a README, do
    not satisfy this requirement.
    The steps are the [`dashboard` skill](../dashboard/SKILL.md)'s
    step 6. **The handoff for an MCP App is the setup wizard,
    not the `/mcp` URL.** The backend serves an interactive
    **setup wizard at its root (`https://<app>.localhost` under
    portless, else `http://localhost:9991`)** — the
    page that connects an MCP client (Claude, ChatGPT, MCPJam, …)
    and completes OAuth. As the run skill directs, surface that
    URL to the user and open it once at first startup. Do **not**
    start the MCPJam inspector as part of running the app — it
    launches on demand, only if the user picks it in the wizard.
    Don't bypass the run skill by invoking `rbt dev run` /
    `npm run dev` by hand: those bare commands print only the
    API/MCP/inspect URLs, dropping the wizard hint the user
    actually needs.

## Update Flow

When modifying an existing app:

1. Read `AGENTS.md`, `.rbtrc`, API definition, servicer, `main.py`.
2. Assess state model changes. If the app has persisted state or
   has been deployed, read
   `python/references/api-schema-evolution.md` to understand the
   rules you must follow for API schema evolution.
3. Update API definition → re-run `uv run rbt generate`.
4. Update servicer methods.
5. Update React components.
6. When the change adds a new user-facing capability, add or update
   an example prompt in `backend/src/example_prompts.py` so the
   wizard surfaces the new flow.
7. Re-verify the backend: run `uv run mypy backend/ tests/` from the
   project root and `uv run pytest`; fix every
   error and failure before handing back.
8. If the app isn't already running, bring it up with the
   [`run` skill](../run/SKILL.md). If it is already running under
   `rbt dev run`, the `--watch` globs reload it automatically — no
   restart needed. Editing `.env` likewise triggers a restart, so
   a new or changed secret is re-read by `--env-file` without a
   manual relaunch.
9. If the change moved a file, added a state type or a UI, changed
   a command, or taught a rule, update `AGENTS.md` in the same
   change ([`agents-md` skill](../agents-md/SKILL.md)).

Specific patterns and file shapes live in the references above —
read them on demand based on what's changing.
