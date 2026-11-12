---
name: app
description: Build a Reboot application from a user description — an MCP App for ChatGPT, Claude, VSCode or Goose, a standalone web app at a URL, or both on one backend sharing one User per identity via `oauth=...`. Settles the front end first, committing only when the prompt names it verbatim (MCP/Claude/ChatGPT for an MCP App; a URL/SPA/"website" for a web app; an explicit conjunction for both) and otherwise asking; the `web-app` and `mcp-app` skills start here with the answer given. Then runs the whole build — design, feature files, project files, API, servicers, frontend, scenarios, and running the app — reading the `python` skill for the backend and the `frontend` skill for the React side at the step that needs each. Does NOT infer the front end from the app's domain (CRM, todo, dashboard, blog, …) — those describe what the app does, not where it lives.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# app — Build a Reboot Application

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

Build a complete Reboot application from a user description. This
skill is the process: it settles which front end the app has, then
builds it step by step. What it builds with lives in two other
skills, read at the step that needs them:

- the [`python` skill](../python/SKILL.md) for the backend: the API,
  servicers, state, sign-in, and the MCP App's front door and tools;
- the [`frontend` skill](../frontend/SKILL.md) for the React side: the
  generated client, the web app, and the MCP App UIs.

## Step 0 — Settle the Front End

**Before anything else, settle which front end the app has.** If the
build started from `/reboot:web-app` or `/reboot:mcp-app`, it is
settled: go on to "When to Use". Otherwise read
[`references/choosing-the-front-end.md`](references/choosing-the-front-end.md)
and do what it says: commit to a front end only when the user's own words name the
front end, and otherwise ask. Write no file until the front end is
settled. This holds in auto mode too.

## When to Use

- Building a new Reboot app from a description.
- Adding features, state, or UI to an existing Reboot app (the Update
  Flow below).
- Modifying the state model, methods, or React UI of a Reboot app.
- Running an existing Reboot app — e.g. at the start of a new
  session. This needs no design or build phase: load the
  [`run` skill](../run/SKILL.md), which detects the app type, starts
  the backend and frontend, and for an MCP App opens the setup wizard
  (from which the user can launch MCPJam on demand).
- Putting a finished app in production — load the
  [`deploy` skill](../deploy/SKILL.md): one container on Reboot
  Cloud that runs the backend and serves the built MCP Apps and web
  app from it.

## What Each Front End Adds

Every app goes through the same steps below. An MCP App and a web
app each add their own work at some of those steps, and that guidance
lives in the `python` skill or the `frontend` skill. The table lists,
for each step, which section to read for each front end. An app with
both front ends reads both columns.

| Step | MCP App | Web app |
| --- | --- | --- |
| Design | "Designing an MCP App" in [`python/references/mcp-app-concepts.md`](../python/references/mcp-app-concepts.md) | "Designing a web app" in the [`frontend` skill](../frontend/SKILL.md), and "Who Signs In" in [`python/references/auth-web-apps.md`](../python/references/auth-web-apps.md) |
| Project files, API, servicers, `main.py`, authorizers, scenarios, updates | "Building an MCP App" in the [`python` skill](../python/SKILL.md) | "Building a web app" in the [`python` skill](../python/SKILL.md) |
| Frontend scaffold and build, browser scenarios, updates | "Building MCP App UIs" in the [`frontend` skill](../frontend/SKILL.md) | "Building a web app" in the [`frontend` skill](../frontend/SKILL.md) |
| Both front ends in one `frontend/` | "Building both" in the [`frontend` skill](../frontend/SKILL.md) | |

## Which References to Read, and When

Everything you read stays in the conversation and is re-sent on
every later turn, so **read each reference at the step that needs
it** — not all of them up front — and read each one **once**. The
groups below are in build order, and each reference appears in
exactly one of them — the step that needs it. Each front end adds
references of its own at some steps; [What Each Front End Adds](#what-each-front-end-adds)
above says where they are listed.

**Before writing the project files** (`.python-version`, `pyproject.toml`,
`.rbtrc`, `.mypy.ini`, `main.py`):

- `python/references/lifecycle-{project-setup,rbtrc,application-entry,initialize-hook}.md` — the canonical layout, the CLI flags, the
  `Application(...)` constructor, the `initialize` hook.

**Before writing the API definition:**

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

**Before writing the servicer:**

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

**Before writing the authorizers** (avoid defaulting to `allow()`; sign-in
is in [`mcp-app-concepts.md`](../python/references/mcp-app-concepts.md#auth-oauth-provider-selection-and-real-authorizers-from-day-one)
for an MCP App and [`auth-web-apps.md`](../python/references/auth-web-apps.md)
for a web app):

- `python/references/servicer-authorizer.md` — **start here**.
  Explains `oauth=` (the default, with rules from day one) vs.
  `token_verifier=` (for identity providers the built-in ones don't
  cover, where rules may wait until the verifier is wired).
- `python/references/auth-allow-if.md`,
  `python/references/auth-built-in-predicates.md`,
  `python/references/auth-custom-predicates.md` — the predicate
  machinery. Both front ends sign users in with `oauth=`, even in dev
  (the `Development()` provider), so `context.auth.user_id` is set
  from the first run and `allow_if` rules work from the start; there
  is no reason for a placeholder `allow()`.
- `python/references/auth-allow-deny.md` — narrow uses of
  unconditional rules; specifically, when **not** to reach for
  `allow()`.
- [`python/references/auth-oauth-providers.md`](../python/references/auth-oauth-providers.md)
  — when you pick a real provider: choosing your
  `Application(oauth=...)` provider via
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

**Before writing the frontend:** the [`frontend` skill](../frontend/SKILL.md).
Its [Which page to read](../frontend/SKILL.md#which-page-to-read)
section names the page every app reads, the generated client, and then
the pages a web app or MCP App UIs add.

**Before writing the tests:** `python/references/testing-project-setup.md`
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
`python/references/`. Use them.

If something genuinely isn't covered, bound the output hard: a
targeted `grep -n … | head -40`, or `sed -n '<start>,<end>p'` over
a known range. Never a whole generated file, never an unbounded
recursive grep.

## Workflow: Settle the Design, Then Build

**Always settle the design before writing code.** The state model
is the foundation — getting entities, field types, or method types
wrong means regenerating everything across 12+ files.

### Design Phase

0. For each capability the app has, follow the
   [`feature` skill](../feature/SKILL.md): agree on it in plain
   English with the user, and write it down as a `@wip` feature
   file before the API exists. The design below is derived from
   those features.
1. Analyze the user's description using the State Model Assessment
   below.
2. State the design you are about to build:
   - Application types: state shape (fields, types, tags).
   - Method map: which operations, which method type
     (Reader/Writer/Transaction/Workflow).
   - The design items of each front end you build: see
     [What Each Front End Adds](#what-each-front-end-adds) above.
3. Then execute the Step-by-Step Build Flow.

For updates to existing apps, still work the design first: read
current state, state the changes, then modify.

### Writing the Design for a Human Reader

The design is read by a **human who has not read the skill files**.
They are judging the design — entities, collections, methods,
routes, auth — not verifying that you followed the skill. Write so
it stands on its own.

**Don't quote skill-internal terms** when presenting the design.
They mean nothing outside this skill:

- `Shape A` / `Shape B` / `Shape C` — name the actual data
  structure: `list[Sub]` of inline sub-records, `list[str]` of
  foreign state IDs, `OrderedMap` of foreign state IDs.
- "non-state `Model`" — say "a flat sub-record that lives and
  dies with the parent" or "no identity of its own", in domain
  terms.
- `Gotcha #N` and filenames like `state-collections.md` /
  `api-state-shapes.md` / `patterns-mcp-app-gotchas.md` — drop the
  citation; if the rule matters to the design, explain it inline.
- `factory=True`, `Field(tag=N)`, raw pydantic spellings — fine
  to mention briefly when the spelling itself is the design
  decision, but never as the explanation.

**For every design choice, give the what + the why.** The _what_
is the concrete data structure, method type, or route. The _why_
is a one-clause reason rooted in the user's domain ("grows
without bound, so we need pagination"; "no methods or auth of
its own, so it lives inline"; "logged-in users only, because the
document is per-account").

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
   over time (people, posts, tasks, todos, events, documents,
   accounts, …). **Each entity becomes its own `Type` with its own
   state**, even when "each User only has a few of them". Anything
   you can imagine the user `add`-ing / `remove`-ing / `find`-ing by
   name has its own identity and belongs in its own actor. The
   default wrong move is packing everything into one parent's state
   as `list[Person]` (or `list[Post]`, `list[Task]`, …) — that
   flattens N actors into one, prevents per-entity auth/methods,
   and forces a full rewrite when the collection grows. A
   collection your app **syncs or scrapes from an external
   system** (a GitHub repo's issues, a mailbox, an RSS feed) is an
   entity collection too — and unbounded by definition — even
   though the user never "adds" to it directly. See
   `python/references/state-collections.md` Step 1 for the full
   decomposition signal list.
2. **The `User` type.** Whether the app has one, and what it does,
   is among the front end's design items
   ([What Each Front End Adds](#what-each-front-end-adds)).
3. **Container shape for each collection.** Once an entity is its
   own `Type`, the parent (typically `User`) stores **references**,
   not objects. Three shapes (full table + worked PRM example in
   `python/references/state-collections.md`):

   - **Shape A**, `list[Sub]` of non-state `Model`s — for bounded sub-records
     that genuinely belong with the parent (line items on an Order,
     tags on a Post). NOT for entity collections.
   - **Shape B**, `list[str]` of foreign state IDs — when the collection of
     entity IDs is bounded (low hundreds, occasionally low
     thousands) and you always read it whole.
   - **Shape C**, `OrderedMap` of foreign state IDs — when the collection
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

4. **User methods**: How are instances of application types
   created? Each gets a `Transaction` on `User` that calls
   `<Type>.create(context)`, then registers the new ID in the
   appropriate container (Shape B or C, under **Container shape for
   each collection** above).
5. **State shape (per type)**: Fields, types — lists, nested
   objects, primitives. Each gets `Field(tag=N)`. **Nested `Model`
   sub-objects** owned 1:1 by a parent state must be
   `Optional[X] = Field(tag=N, default=None)` and hydrated in the
   parent's factory `create` Writer (the gotcha "Nested `Model`
   fields can't take `default_factory` or `default`"); non-Optional
   `Model`-typed fields reject `default=` / `default_factory=`.
   Full rules + examples in
   [`python/references/api-state-shapes.md`](../python/references/api-state-shapes.md)
   and `python/references/api-pydantic.md`.
6. **Operations**: Map to the right method type:
   - `Reader` — read-only queries.
   - `Writer` — single-state mutations.
   - `Transaction` — multi-state atomic operations (e.g. transfer
     between two accounts, or User creating an application-type
     instance).
   - `Workflow` — long-running control flows with loops, scheduling,
     and idempotency helpers.
7. **Auth**: Anonymous-only, public-read + authed-write, fully
   locked down, …? See `python/references/auth-*.md`.
8. **Identity**: Single default instance vs. multiple instances?
9. **Cross-state coordination**: Does any operation touch multiple
   state instances? If yes, use `Transaction`.
10. **Each front end's own items**, from the design section of its
    skill ([What Each Front End Adds](#what-each-front-end-adds)).

## When Correct Decomposition Fights the UI

The React references show **one `use<Type>()` subscription per
UI** — one hook, one actor, one live feed. That is the easy,
documented path, and it quietly pressures you to flatten an entity
collection into `list[Item]` on a single actor just so the dashboard
can read it in one subscription.

**Resolve the tension the other way: the data model wins.** When
a collection is its own entity type (Assessment step 1) or
unbounded (step 3, Shape C), keep it decomposed — one actor per
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

## Project Structure

The layout is the one every Reboot app has, `frontend/` included
(`python/references/lifecycle-project-setup.md`). What each front end
puts under `frontend/` is in its section of the
[`frontend` skill](../frontend/SKILL.md).

```
<project>/
├── .python-version
├── .rbtrc                   # Line-based config (NOT YAML!)
├── .mypy.ini                # Type-check config (python skill)
├── pyproject.toml           # Python deps (uv)
├── api/
│   └── <pkg>/v1/
│       └── <name>.py        # API definition (pydantic)
├── pytest.ini               # testpaths: tests; pythonpath: backend/src backend/api api
├── backend/
│   └── src/
│       ├── main.py          # Application entrypoint
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
    ├── vite.config.ts       # The stock Vite file plus `reboot({...})`
    └── api/                 # Generated TypeScript client
                             # (output of `rbt generate --react=`)
```

## Step-by-Step Build Flow

**All commands run from the application directory.** At each step,
also do what your front end adds to it: the table in
[What Each Front End Adds](#what-each-front-end-adds) names the step each addition belongs to.

1. Create `.python-version`, `pyproject.toml`, `.rbtrc`, and
   `.mypy.ini` — same shape as in
   `python/references/lifecycle-{project-setup,rbtrc}.md`; the
   `.mypy.ini` template lives in
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
4. Write the API definition (`api/<pkg>/v1/<name>.py`). Pydantic
   rules live in `python/references/api-pydantic.md`; method
   marker → context-type rules in
   `python/references/api-methods.md`.
5. `uv run rbt generate`. Don't read what it wrote: the signature
   your servicer must match is in `python/references/api-methods.md`
   ("The Servicer Signature Each Declaration Obliges").
6. Write the servicer (`backend/src/servicers/<name>.py`) —
   context-type patterns in `python/references/servicer-*.md`.
7. Write `main.py` — `python/references/lifecycle-application-entry.md`.
8. Scaffold the frontend at `frontend/`, as the
   [`frontend` skill](../frontend/SKILL.md) says for your front end.
9. `cd frontend && npm install`.
10. `uv run rbt generate` again — the React bindings need
    `node_modules` to resolve types correctly.
11. Build the frontend from the references the
    [`frontend` skill](../frontend/SKILL.md) lists for your front end.
    Write the calls from those references
    and do **not** open `frontend/api/**/*_rbt_react.ts` to check
    them — it is tens of thousands of lines that then ride along on
    every later turn.
12. `cd frontend && npm run build` (sanity check the bundle).
13. **Write and run the scenarios of every feature before handing
    the app off.** Each feature file from the design phase (the
    [`feature` skill](../feature/SKILL.md)) gets its scenarios now:
    every action the user should be able to _do_ is a scenario in
    the built-in steps of `python/references/testing-features.md`.
    Every step names who calls; a user who must be signed in is
    declared with `"alice" is an authenticated user`, which is how
    the real authorizers get exercised: register the **real**
    servicers and never subclass one to weaken its `authorizer()`.
    Let factories make ids up. Tag what cannot pass yet `@blocked`
    with its reason; leave `@wip` where work continues. When a
    scenario fails for a reason that looks like it is inside the
    framework, check `python/references/patterns-idempotency.md` and
    `patterns-common-gotchas.md` before reading `site-packages`.
    Run `uv run pytest` and fix anything that fails.
    Then type-check: run `uv run mypy backend/ tests/` from the project
    root and fix every error (config and rationale in
    `python/references/lifecycle-project-setup.md`). Do not
    proceed to the next step until every scenario passes (or is
    `@blocked` with a reason) and mypy is green — together they
    are what catches contract bugs before the user sees them. Point
    the user at the dashboard's Features page to review the features.
14. Run the app — load the [`run` skill](../run/SKILL.md) and
    follow it. It is the single canonical "start the app"
    procedure: it detects the app type, makes sure dependencies
    and secrets are in place, starts the backend and frontend,
    waits for them to come up, and hands the user the URLs.
    Required final hand-over: if you started the developer
    dashboard, include the `cloudflared` command and the Claude and
    ChatGPT connector instructions in your final response. This
    applies even when the user asked only for a standalone web app and
    never mentioned MCP. Do not omit them for brevity or perceived
    relevance. A dashboard URL, or instructions saved in a README, do
    not satisfy this requirement.
    The steps are the [`dashboard` skill](../dashboard/SKILL.md)'s
    [Required final hand-over: the connector](../dashboard/SKILL.md#step-6--required-final-hand-over-the-connector).
    What to hand over for each front end is the run skill's
    [Hand off](../run/SKILL.md#step-6--hand-off).
    Don't bypass the run skill by invoking `rbt dev run` /
    `npm run dev` by hand: those bare commands print only the
    API/MCP/inspect URLs, dropping the hand-over the user actually
    needs.

## Update Flow

When modifying an existing app (and at each step, what your front end
adds to it, as the table in [What Each Front End Adds](#what-each-front-end-adds) says):

1. Read `AGENTS.md`, `.rbtrc`, the API definition, servicer, and
   `main.py`.
2. Assess state model changes. If the app has persisted state or
   has been deployed, read
   `python/references/api-schema-evolution.md` to understand the
   rules you must follow for API schema evolution.
3. Agree on the changed or new feature in English and write it
   down first, per the [`feature` skill](../feature/SKILL.md):
   the feature file, tagged `@wip`, before the API changes.
4. Update the API definition (every new property with a
   `description=`) → re-run `uv run rbt generate`.
5. Update servicer methods.
6. Update React components.
7. Update the scenarios. Re-verify the backend: run
   `uv run mypy backend/ tests/` from the project root and
   `uv run pytest`; fix every error and failure before handing
   back, and ask before removing `@wip`.
8. If the app isn't already running, bring it up with the
   [`run` skill](../run/SKILL.md). If it is already running under
   `rbt dev run`, the `--watch` globs reload it automatically — no
   restart needed. Editing `.env` likewise triggers a restart, so
   a new or changed secret is re-read by `--env-file` without a
   manual relaunch.
9. If the change moved a file, added a state type, a page or a UI,
   changed a command, or taught a rule, update `AGENTS.md` in the
   same change ([`agents-md` skill](../agents-md/SKILL.md)).

Specific patterns and file shapes live in the references above —
read them on demand based on what's changing.
