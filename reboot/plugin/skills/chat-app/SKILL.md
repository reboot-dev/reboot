---
name: chat-app
description: Build complete Reboot AI Chat Apps (MCP Apps) for ChatGPT, Claude, VSCode, Goose, and other MCP hosts. Layers on top of the python skill for backend mechanics; covers what's specific to MCP Chat Apps — the User-type front door, MCP tool exposure, the UI() method type, and the full React/Vite scaffolding.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# chat-app — Build Reboot AI Chat Apps

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

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

> **Dual-surface apps are supported.** A single app can serve both
> an MCP front door _and_ a standalone browser SPA from the same
> backend; they share `oauth=...`, the same `User` per upstream
> identity, and the same servicer code. For the standalone SPA
> piece, also load the
> [web-app skill](../web-app/SKILL.md). A user who signs in on
> one surface is signed in on both (cross-surface SSO): the OAuth
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

- Building a new Reboot AI Chat App from a description
- Adding features, state, or UI to an existing Reboot AI Chat App
- Modifying state model, methods, or React UI in a Reboot AI Chat App
- Running an existing Reboot AI Chat App — e.g. at the start of a
  new session. This needs no Plan or Build phase: load the
  [`run` skill](../run/SKILL.md), which detects the app type,
  starts the backend and frontend, and opens the setup wizard (from
  which the user can launch MCPJam on demand).

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
  for entity collections — see Step 1 of that reference. A second
  trap: a collection **synced or scraped from an external system**
  (a repo's issues, a mailbox, an RSS feed) is unbounded by
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

- `python/references/servicer-workflow.md` — the single,
  comprehensive workflow reference. Read it top to bottom: the
  `@classmethod` / `WorkflowContext` declaration shape, the
  call-classification decision tree (Reboot scopes vs.
  `at_least_once` vs. `at_most_once`), `context.loop`, inline state
  writes,
  `until` / `until_changes`, and workflow exit semantics.

**Project shell:**

- `python/references/lifecycle-{project-setup,rbtrc,application-entry,initialize-hook}.md` — the canonical layout,
  the CLI flags, the `Application(...)` constructor, the
  `initialize` hook.

## This Skill's References

Chat-app–specific topics, organized by layer. Read them on demand
the same way you would any other skill reference — the patterns
they cover aren't restated inline below.

| Reference                                                                              | What's in it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`references/project-shell.md`](references/project-shell.md)                           | `.python-version`, `.rbtrc` deltas (HMR + dist configs), `pyproject.toml` extras, `main.py` shape, the `example_prompts.py` module wired into `Application(example_prompts=...)`, durable-state setup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [`references/api-method-types.md`](references/api-method-types.md)                     | The pydantic API file. `User`-type front door, `mcp=Tool()` / `mcp=None`, `UI()` (including parameterized UI props), `factory=True` on `create`, `Workflow(...)` declaration shape. Full Counter API example.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [`references/api-state-shapes.md`](references/api-state-shapes.md)                     | Two recurring state shapes: `list[Item]` with `default_factory=list`; single nested `Model` sub-objects as `Optional[X] = Field(tag=N, default=None)` hydrated in factory `create` (Gotcha #13). The state-inside-state regression and how to compose state actors via string ID + `ref(id)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [`references/servicer-patterns.md`](references/servicer-patterns.md)                   | Servicer-side patterns: `UserServicer` calling `<X>.create(context)`, Workflow Servicer with `MyType.ref()` (no-arg) magic, inline writers via `.per_workflow("alias").write(context, fn)` / `.per_iteration("alias").write(...)` / `.always().write(...)`, scheduling a workflow from a Transaction with `.schedule()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [`references/react-scaffolding.md`](references/react-scaffolding.md)                   | The `frontend/` shell: `package.json` (`npm run build` runs `build.mjs`, which auto-discovers and builds every UI), `vite.config.ts` (load-bearing — copy exactly), `build.mjs`, `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`, `index.css` theme variables, `mcp/<name>/index.html`, `mcp/<name>/main.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [`references/react-app-tsx.md`](references/react-app-tsx.md)                           | `App.tsx` — generated `use<Type>()` hook usage (reader subscriptions + mutation calls), Python-snake → TypeScript-camel field naming, Zod-validated request/response types. Full Counter `App.tsx` + `App.module.css` example.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [`references/pop-out-to-web-app.md`](references/pop-out-to-web-app.md)                 | Adding a "pop out into the web app" button to a UI widget: recover the bound entity ID with the generated hook's `state_id`, build a deep-link URL, and open it via the host's `useMcpApp().openLink({ url })` (the sandboxed iframe blocks `window.open`) with a `window.open` fallback. The web-app side reads the ID from the URL; shared `rbt_session` keeps the user signed in across surfaces.                                                                                                                                                                                                                                                                                                                                                                                                            |
| [`references/gotchas.md`](references/gotchas.md)                                       | The numbered MCP-Chat-App–specific trip list (1–19): `mcp=Tool()`/`mcp=None` required, `factory=True` on app-type `create`, `MyType.ref()` not `cls.ref()`/`self.ref()` in workflows, `.schedule()` from a Transaction, Optional+`default=None` for nested Models, `.read()` only on no-arg ref inside a workflow, method-name PascalCase → generated `<Type>.<Method>Request`, etc.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [`references/auth-oauth-providers.md`](references/auth-oauth-providers.md)             | Choosing your `Application(oauth=...)` provider via `OAuthProviderByEnvironment(dev=..., prod=...)` (the recommended `dev=Development(), prod=Google(...)` shape; a selected `None` arm fails startup), the `Google` / `GitHub` / `Auth0` / `Development` / `Anonymous` providers and where credentials come from (incl. the `/__/oauth/callback` URL), and the user-ID-namespace gotcha that makes switching providers after launch infeasible — choose deliberately **before** real users have state.                                                                                                                                                                                                                                                                                                         |
| [`references/auth-custom-oauth-provider.md`](references/auth-custom-oauth-provider.md) | **Writing your own OAuth provider** when none of the shipped ones fits (self-hosted Keycloak, internal SSO, an IdP Auth0 can't broker): subclass `RegisteredOAuthProvider`, implement `authorization_url` + `exchange_code` → `ExchangeResult` (the user id must be **stable** — it becomes `context.auth.user_id`), the `validate()` / `mount_routes()` hooks, and `token_service_id` + `OAuthTokens` for `store_tokens=True` support.                                                                                                                                                                                                                                                                                                                                                                         |
| [`references/auth-store-tokens.md`](references/auth-store-tokens.md)                   | **Acting on the user's behalf** at an external service — the built-in `store_tokens=True` shortcut (works on any `oauth=` surface, web apps included): when the API belongs to your `Application(oauth=...)` identity provider, add extra OAuth `scopes=[...]` + `store_tokens=True` (needs `oauth_library()` + `ciphertext_library()` + `ordered_map_library()`) and the server captures its tokens. Reboot stores **the provider's own tokens only** (an `Auth0` sign-in stores an Auth0 token, not the upstream Google token). The full host-agnostic recipe — custom OAuth endpoints for any _other_ service, reading tokens back, calling the API **inside a `Workflow`**, refresh tokens, erasure — is [`python/references/auth-external-api-calls.md`](../python/references/auth-external-api-calls.md). |

## Workflow: Plan First, Then Build

**Always plan the design and get approval before writing code.** The
state model is the foundation — getting entities, field types, or
method types wrong means regenerating everything across 12+ files.

### Plan Phase

1. Analyze the user's description using the State Model Assessment
   below.
2. Begin a plan for the user to approve (in Claude Code, enter plan
   mode; in Codex, present the plan and wait for the go-ahead).
3. Present the proposed design:
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
     "Example Prompts" under Key Framework Concepts).
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
   [`references/api-method-types.md`](references/api-method-types.md).
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
[`references/react-app-tsx.md`](references/react-app-tsx.md);
Shape C is in `python/references/state-collections.md`.

## Key Framework Concepts (MCP Chat App–specific)

### `User` and Application Types

Every AI Chat App has a `User` type and one or more application types:

- **`User`** is the AI's front door for **creating and locating**
  application-type instances. **"Front door" means entry point +
  delegation, not container for all application state.** `User`
  holds identity (e.g. display name) and **IDs of the concern-
  specific actors it owns**; per-concern state (auth/session,
  background-engine config, persona config, transient caches) lives
  on its own `Type` and is referenced by ID from `User`. Typical
  `User` methods are `Transaction`s that create application-type
  instances, or `Reader`s that locate existing instances' IDs —
  either directly or via indexes whose IDs are stored on `User`.
  `User`-scoped UIs (a dashboard spanning the whole user, a global
  browser) also live here.
- **Application types** (e.g. `Counter`, `Person`, `Task`) hold
  most of the actual entity state. They typically need a `create`
  Writer with `factory=True` for construction. **Once an entity exists,
  anything specific to that entity — Readers, Writers, UIs —
  lives on that entity's `Type`**, never on `User`. The actor
  ID is then implicit in every call: the AI passes the entity
  ID to the tool, and the generated `use<Type>()` React hook
  auto-resolves the same ID with no arguments.

The most common scaffolding mistake is putting a per-entity UI
(e.g. `show_person`) on `User` with the entity ID stuffed into a
`request=<Model>` field. Don't — see "UI Placement" in
[`references/api-method-types.md`](references/api-method-types.md).

A second, equally common mistake is letting `User`'s state accrete
unrelated concerns — auth/session fields alongside persona config
alongside a background engine's configuration alongside a UI cache.
That turns the front door into a God actor and, because writers on
the same actor serialize, makes a login step contend with a persona
edit and a background workflow's state writes. Split each concern
into its own `Type` and have `User` reference it by ID. The signals
that warn you are accreting concerns, and the split pattern, are in
`python/references/state-actor-decomposition.md`.

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

### Auth: `oauth=` Provider Selection and Real Authorizers from Day One

MCP Chat Apps wire identity via `Application(oauth=...)`: what you pass
there stands primarily for **identity** — it determines who
`context.auth.user_id` says the caller is, and in an MCP app that
principal is the user. There's no middle ground: either every user
signs in through this OAuth flow, or the app has no per-user auth at
all. The slot takes an `OAuthProviderSelector`. The typical shape is
`oauth=OAuthProviderByEnvironment(dev=Development(), prod=Google(...))`:
under `rbt dev` you get `Development()` — a real provider that shows a
fake account picker and issues every caller a verified, stable
`dev-{hash}` `context.auth.user_id`, no external IdP — while every other
environment (`rbt serve`, Reboot Cloud, or anything unrecognized) gets
the real provider. Both arms are required; either may be `None`, and a
selected `None` arm makes the app **fail to start** with a clear
message, so you can't silently ship without sensible auth.
Servicer-side code doesn't change between providers. (In unit tests,
omit `oauth=` entirely — the test harness supplies a test OAuth
provider.)

> **Choose your production provider deliberately.** See
> [`references/auth-oauth-providers.md`](references/auth-oauth-providers.md).
> Each provider issues user IDs in its own namespace, so switching
> providers after launch strands every user-keyed piece of state.
> `Development` is dev-only — replace it before shipping — and don't
> launch on a throwaway like `Anonymous` planning to "upgrade later";
> do it **before** real users have state. `Google` / `GitHub` give you
> a user id and nothing more; if the app needs **user management**
> (profiles, password resets, MFA, blocking users), use `Auth0`. If no
> shipped provider fits (self-hosted Keycloak, internal SSO), write
> your own — see
> [`references/auth-custom-oauth-provider.md`](references/auth-custom-oauth-provider.md).

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

**Acting on the user's behalf at the provider.** Beyond identity,
`Google` / `GitHub` / `Auth0` can request extra OAuth `scopes=[...]` and
capture the provider's tokens (`store_tokens=True`) so the app can call
that provider's API as the signed-in user (their calendar, repos, etc.).
Reboot stores the **provider's own** tokens only — with `Auth0` that's
an Auth0 token, not the upstream Google token a brokered sign-in went
through. The tokens are stored encrypted and read back with
`OAuthTokenManager.ref(GOOGLE).fetch(context, user_id=context.state_id)`,
and the outbound call goes **inside a `Workflow`**. The chat-app
`store_tokens=True` shortcut is in
[`references/auth-store-tokens.md`](references/auth-store-tokens.md);
the full read-path and in-`Workflow` call recipe (shared with web apps)
is in
[`python/references/auth-external-api-calls.md`](../python/references/auth-external-api-calls.md).

### Declarative, Not Decorator

All MCP surface is defined in the API file. `main.py` is minimal. No
`@mcp.tool()` decorators.

### State Is Durable

State survives restarts. `dev run --application-name=<name>` in
`.rbtrc` (see [`references/project-shell.md`](references/project-shell.md))
is what makes that work.

### Example Prompts (Root-Page Wizard)

Every MCP Chat App ships **example prompts** — short, named chat
scenarios the root-page wizard shows users so they can try the app
the moment it boots, without having to invent a first message. They
are not optional polish: a fresh user landing on the wizard with no
suggested prompts has nothing to click, so always author a set.

An example prompt is an `ExamplePrompt(title=..., prompts=[...])`
(imported from `reboot.application`). The `title` is a short label
(and the identity key — same title replaces an existing entry); the
`prompts` are an **ordered sequence** of chat messages the user sends
one per turn, walking a real end-to-end flow through the app's MCP
tools (create something → act on it → view the result), not one
isolated message. Write ~3 examples that together cover the app's
main user stories, phrased the way a real user would talk to the
chat client.

**Make the prompts show the UI, not just call tools.** The embedded
React UIs (the `UI()` methods) are the whole reason this is an MCP
**App** and not a plain MCP server — a flow that only calls
tool-only methods and never renders a component demos the boring
half. Every example should end on (or pass through) a turn that
triggers a `UI()` method — phrase that turn as a natural "show me
/ open / view ..." request so the AI picks the UI tool. In the counter
example, the "…and show me the counter" / "show me the wins counter"
turns are exactly this: they resolve to the `Counter` UI and render the
live component, not just a text reply. When you write the set, look at
the method map from the plan: for each `UI()` method, make sure at
least one example drives the user to it.

They live in `backend/src/example_prompts.py` and are passed to
`Application(example_prompts=...)` in `main.py`. Full file shapes and
a worked set are in
[`references/project-shell.md`](references/project-shell.md); the
`ai-chat-counter` example is the canonical reference.

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
├── backend/
│   └── src/
│       ├── main.py          # Application entrypoint
│       ├── example_prompts.py  # Wizard example prompts
│       └── servicers/
│           └── <name>.py    # Servicer implementation
└── frontend/
    ├── package.json
    ├── build.mjs            # Discovers + builds every UI
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    ├── vite.config.ts
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

**Only execute after plan approval. All commands run from the
application directory.**

1. Create `.python-version`, `pyproject.toml`, `.rbtrc`, and
   `.mypy.ini` — see
   [`references/project-shell.md`](references/project-shell.md);
   the `.mypy.ini` template lives in
   `python/references/lifecycle-project-setup.md`.
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
6. Write `backend/src/example_prompts.py` (the wizard's example
   prompts) and `main.py` (which imports them and passes
   `example_prompts=` to `Application`) — see
   [`references/project-shell.md`](references/project-shell.md) and
   `python/references/lifecycle-application-entry.md`.
7. `npm create @reboot-dev/ui`.
8. `cd frontend && npm install`.
9. `uv run rbt generate` (React bindings need `node_modules`).
10. Customize React UIs — see
    [`references/react-scaffolding.md`](references/react-scaffolding.md)
    for the `frontend/` shell and
    [`references/react-app-tsx.md`](references/react-app-tsx.md) for
    `App.tsx` patterns.
11. `cd frontend && npm run build`.
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
    never instantiate Servicers directly. Register the **real**
    servicers — never subclass a servicer in tests to weaken its
    `authorizer()`. Impersonate users instead with
    `await rbt.create_external_context_as(name, user_id)` — see
    the impersonation pattern in `testing-harness.md`. Run
    `cd backend && uv run pytest` and fix anything that fails.
    Then type-check: run `uv run mypy backend/` from the project
    root and fix every error (config and rationale in
    `python/references/lifecycle-project-setup.md`). Do not
    proceed to the next step until every user-story test passes
    and mypy is green — together they are the gate that catches
    contract bugs before the user sees them in MCPJam.
13. Run the app — load the [`run` skill](../run/SKILL.md) and
    follow it. It is the single canonical "start the app"
    procedure: it detects the app type, makes sure dependencies
    and secrets are in place, and starts the backend and
    frontend. **The handoff for a Chat App is the setup wizard,
    not the `/mcp` URL.** The backend serves an interactive
    **setup wizard at its root (`http://localhost:9991`)** — the
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

1. Read `.rbtrc`, API definition, servicer, `main.py`.
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
7. Re-verify the backend: run `uv run mypy backend/` from the
   project root and `cd backend && uv run pytest`; fix every
   error and failure before handing back.
8. If the app isn't already running, bring it up with the
   [`run` skill](../run/SKILL.md). If it is already running under
   `rbt dev run`, the `--watch` globs reload it automatically — no
   restart needed. Editing `.env` likewise triggers a restart, so
   a new or changed secret is re-read by `--env-file` without a
   manual relaunch.

Specific patterns and file shapes live in the references above —
read them on demand based on what's changing.
