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

**Started from `/reboot:web-app` or `/reboot:mcp-app`?** The front end
is already chosen: skip "Routing" and start at "When to Use".

## Routing

> **Default: ASK.** The wrong guess costs ~12 files of regeneration,
> so commit only when the description **names** the front-door
> verbatim. Do not infer the front-door from the app's _domain_
> (CRM, blog, store, dashboard, todo, chat room, journal, …) —
> domain words describe what the app **does**, not **where** it's
> used. A "CRM" can equally be a website or an MCP tool exposed to
> Claude; "chat room" likewise. When in doubt, ask.

### The front ends

- **MCP App** — the app is exposed through an MCP host (ChatGPT,
  Claude, VSCode, Goose, etc.) via MCP tools, and any visual UI is
  embedded into the host through MCP App artifacts.
- **Web App** — a standalone web app: the app is served at a URL and
  used in a normal browser, with the Reboot backend behind a React
  frontend.
- **Both** — one backend serves both, with one `oauth=...` and one
  `User` actor per upstream identity. A user who signs in on one
  frontend is signed in on both (cross-frontend SSO): the OAuth
  server's `/authorize` short-circuits when the browser already
  carries a session cookie, and `/callback` sets that cookie on every
  flow.

### Commit-without-asking triggers (must be VERBATIM in the prompt)

Commit immediately **only** when the user's prompt contains one of
the explicit phrases below. No inference, no synonyms, no "well
they probably mean…":

**Commit to an MCP App if the prompt contains any of:**

- `MCP`, `MCP host`, `MCP server`, `MCP App`, `MCP tool`, `mcp=Tool`,
  `UI()` (as a Reboot method type).
- `ChatGPT`, `Claude`, `VSCode`, `Goose`, `Cursor`, or
  "Anthropic / OpenAI" **named as the runtime** — e.g. "I want to
  use this from Claude", "expose it as a tool to ChatGPT". Just
  mentioning the company (e.g. "like ChatGPT") doesn't count.
- "MCP App", "AI tool", "tool for an LLM/agent", "expose to an
  LLM/agent".

**Commit to a Web App if the prompt contains any of:**

- A URL or scheme: `https://…`, `localhost:`, `example.com`.
- An explicit route/page literal: `/login`, `/dashboard`, `/home`,
  `/admin`, etc.
- "website", "web app", "web site", "SPA", "single-page app", "in
  the browser", "served at <url>".
- A standard browser-auth phrase: "log in via email", "OAuth login",
  "cookie session", "sign up form".

**Commit to BOTH only if the prompt contains an explicit
conjunction:** e.g. "and also a website", "MCP server **plus** a
dashboard", "expose it to Claude **and** host it on the web".

### Do NOT infer commitment from any of these

These are **not** sufficient signals — if they're the only thing
the prompt offers, **ask**:

- The word "app" alone.
- Domain words: CRM, blog, store, dashboard, todo, todo list,
  journal, kanban, tracker, inventory, wiki, forum, chat room,
  counter, social network, planner, calendar, notes app, …
- Mentions of "users", "auth", "login", "permissions" without the
  word "browser" / "website" / "URL" — Reboot apps of either flavor
  have users.
- Mentions of CRUD-like operations, fields, schemas, relationships
  between entities, search, history, timelines, …
- Mentions of "frontend" or "UI" without "browser" / "website" /
  "URL" — MCP Apps also have a UI (rendered in the MCP host).
- An overall vibe of "this sounds like a SaaS / CRM / dashboard."

If the only signal you have is "this sounds web-y" or "this sounds
chat-y", **ask**.

### Decision flow

1. **Verbatim MCP App trigger present** → say one sentence
   ("Building this as a Reboot MCP App."), then build it as an MCP
   App, following this skill from "When to Use", with the user's
   description as input.
2. **Verbatim web-app trigger present** → say one sentence
   ("Building this as a Reboot Web App."), then build it as a web
   app, following this skill from "When to Use".
3. **Both triggers present, or explicit "I want both"** → say one
   sentence ("Building this as a dual-frontend Reboot app — both
   MCP and standalone web."), then build both front ends, following
   this skill from "When to Use". The backend
   `Application(oauth=...)` is configured once and serves both
   frontends; a single `User` actor per upstream identity is shared.

4. **Otherwise (default)** → **ask the user** the question below
   (present the options and wait for their answer). This is
   **mandatory, not optional**.

   ```
   Question: "Before I scaffold — which kind of app are you building?"
   Header:   "App type"
   Options:
     - "MCP App" — exposed through an MCP host (ChatGPT, Claude,
       VSCode, Goose, …) via MCP tools; optional embedded UI.
     - "Web App"  — a standalone website / SPA users open in a
       normal browser.
     - "Both"     — a single app exposed through both an MCP host
       and a standalone browser SPA, sharing one `User` actor per
       upstream identity (cross-frontend SSO).
   ```

   Then build for the answer per steps 1–3.

   > **Critical — this step is non-skippable, including in "auto" /
   > "autonomous" / "don't ask" modes.** A user-level preference to
   > avoid clarifying questions does **not** override this skill.
   > Reasons it does not:
   >
   > 1. This is not a clarifying question — it is **the routing
   >    input** for the skill. Without an answer, the skill cannot
   >    do its job; "guessing" is not a graceful fallback, it's a
   >    silent failure that costs ~12 files of regeneration.
   > 2. The general "auto-mode" guidance is "make the reasonable
   >    call and continue." For this routing decision, **the
   >    reasonable call _is_ to ask** — that's exactly what this
   >    skill is for. A skill-level instruction beats a generic
   >    auto-mode preference; the user asked to build an app knowing
   >    it would route, so asking once is in-scope work.
   > 3. The user has not waived their right to choose between an
   >    MCP App and a web app. Silence on the topic is silence, not
   >    a delegation.
   >
   > Do **not** skip this step because:
   >
   > - The app concept "feels obviously" web-y or chat-y (feelings
   >   are not a verbatim trigger — see the anti-inference list
   >   above).
   > - The system prompt or user-level config says to be autonomous /
   >   not ask clarifying questions / skip approvals / run in a
   >   full-auto or bypass-permissions mode — those govern routine
   >   approvals, not this skill's core function.
   > - It "would be faster to just pick one." It would not — the
   >   wrong pick is a hard rollback.
   > - You have already half-committed in your response. Stop and
   >   ask before any file is written.
   >
   > The **only** way to skip step 4 is if steps 1–3 fired on a
   > verbatim trigger from the user's prompt, or the user started
   > from `/reboot:web-app` or `/reboot:mcp-app`. If you find
   > yourself drafting a reply that begins "I'll build this as a …"
   > without having matched a verbatim trigger or received the
   > user's answer, **stop and ask the user**.

### Worked examples

| Prompt fragment                                                          | Decision    | Why                                                          |
| ------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------ |
| "a CRM for my personal relationships, with notes and a timeline"         | **ASK**     | CRM is a domain word, not a front-door. No verbatim trigger. |
| "a todo list app"                                                        | **ASK**     | "app" alone is not a trigger.                                |
| "a dashboard for our team's metrics, served at metrics.example.com"      | Web App     | Explicit URL.                                                |
| "a tool I can use from Claude to track my reading list"                  | MCP App     | "from Claude" names the runtime; "tool" + LLM context.       |
| "a website where users can sign up and create journals"                  | Web App     | "website" is a verbatim trigger.                             |
| "a kanban board with login"                                              | **ASK**     | "login" alone is not enough — MCP Apps also have auth.       |
| "expose a CRM as an MCP server, and also a dashboard at crm.example.com" | Both        | Explicit conjunction; dual-frontend app.                     |

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

## How a Web App Differs From an MCP App

The Reboot backend is identical. The deltas are all on the frontend:

| Concern      | MCP App                                                                                          | Web App                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Front door   | MCP host (ChatGPT, Claude, …) creates a `User` per user.                                         | Browser user signs in via `Application(oauth=...)`; same `User` per upstream identity.      |
| API exposure | `mcp=Tool()` on writer/transaction methods.                                                      | Methods exposed only through the generated React client.                                    |
| UI shape     | `UI()` methods → artifacts embedded in the MCP host.                                             | An SPA at `frontend/web/` opened at a URL.                                                  |
| Vite config  | The MCP App scaffolding's: one-file `dist/mcp/<name>/index.html` per UI, served through Envoy.   | A stock Vite SPA config rooted at `web/`, built to `dist/web/` at `base: "/"`.              |
| Test surface | MCPJam inspector.                                                                                | Scenarios that drive the app through Playwright (`frontend/references/testing-web-app.md`). |
| `User` type  | Required — the MCP entry point.                                                                  | Optional — only if your app needs per-user state.                                           |

Backend mechanics (state, methods, Servicers, workflows, refs,
scheduling, stdlib actors, errors, auth predicates, testing) are
**unchanged** — load them from `python`. What makes an app an MCP
App on the backend — the `User` front door, `mcp=Tool()`, `UI()`,
`oauth=` and example prompts — is
[`python/references/mcp-app-concepts.md`](../python/references/mcp-app-concepts.md);
a web app's sign-in is
[`python/references/auth-web-apps.md`](../python/references/auth-web-apps.md).

## Each Front End's Pages

The steps below are the same for every app. What one front end adds
to a step is in that front end's pages, in the layer it belongs to.
An app with both front ends reads both columns.

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
pages of its own at some steps; "Each Front End's Pages" says where
they are listed.

**Before the project files** (`.python-version`, `pyproject.toml`,
`.rbtrc`, `.mypy.ini`, `main.py`):

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

**Before the authorizers** (write rules from day one; your front
end's sign-in page says how):

- `python/references/servicer-authorizer.md` — **start here**.
  Explains `oauth=` (the default, with rules from day one) vs.
  `token_verifier=` (for identity providers the built-in ones don't
  cover, where rules may wait until the verifier is wired).
- `python/references/auth-allow-if.md`,
  `python/references/auth-built-in-predicates.md`,
  `python/references/auth-custom-predicates.md` — the predicate
  machinery. Both front ends use `oauth=` for identity, so real rules
  are viable immediately.
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

**Before the frontend:** the [`frontend` skill](../frontend/SKILL.md).
Its "Which page to read" names the pages for a web app, for MCP App
UIs, and for every app.

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
   - The design items of each front end you build: see "Each Front
     End's Pages" below.
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
   is among the front end's design items ("Each Front End's Pages").
3. **Container shape for each collection.** Once an entity is its
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

4. **User methods**: How are instances of application types
   created? Each gets a `Transaction` on `User` that calls
   `<Type>.create(context)`, then registers the new ID in the
   appropriate container (Shape B or C above).
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
10. **Each front end's own items**, from its design pages
    ("Each Front End's Pages").

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
also do what your front end adds to it ("Each Front End's Pages").

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
11. Build the frontend from the [`frontend` skill](../frontend/SKILL.md)'s
    pages for your front end. Write the calls from those references
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
    step 6. What to hand over for each front end is the run skill's
    Step 6.
    Don't bypass the run skill by invoking `rbt dev run` /
    `npm run dev` by hand: those bare commands print only the
    API/MCP/inspect URLs, dropping the hand-over the user actually
    needs.

## Update Flow

When modifying an existing app (and at each step, what your front end
adds to it, "Each Front End's Pages"):

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
