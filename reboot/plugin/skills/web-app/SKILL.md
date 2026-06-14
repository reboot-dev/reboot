---
name: web-app
description: Build complete Reboot Web Apps — a Reboot backend behind a standalone browser-facing React frontend, served at a normal URL (not embedded in an MCP host). Layers on top of the python skill for backend mechanics; covers what's specific to standalone Web Apps — no MCP front door, no UI() methods, normal React/Vite SPA scaffolding, and Reboot auth for browser users.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# web-app — Build Reboot Web Apps

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

Build complete Reboot Web Apps from a user description: a Reboot
backend behind a standalone React frontend served at a normal URL.

> **Reads from `python`.** This skill is the standalone-web-frontend
> layer on top of the Reboot Python framework. Anything about
> Servicers, Reboot contexts, refs, scheduling primitives,
> backend LLM / agent calls, error types, the testing harness,
> the `.rbtrc` shape, or pydantic API defaults belongs in
> `python` — load those references for those concerns. This
> skill covers what's _specific_ to standalone Web
> Apps: a plain React SPA at `web/`, the generated TypeScript hooks
> from `rbt generate --react=...`, regular auth flows (login form /
> cookies / OAuth), and the cross-cutting rules unique to that
> layer.

> **Not for MCP Chat Apps.** If the app's primary front door is an
> MCP host (ChatGPT, Claude, VSCode, Goose, …) with MCP tools and
> embedded UIs, use the [chat-app skill](../chat-app/SKILL.md) instead.
> Signals you're in the wrong place: `mcp=Tool()`, `UI()`, `User`
> auto-construct from the MCP host, `mcp_servers.json`, MCPJam
> inspector.

## When to Use

- Building a new Reboot Web App from a description.
- Adding features, state, or UI to an existing Reboot Web App.
- Modifying state model, methods, or React UI in a Reboot Web App.
- Running an existing Reboot Web App — e.g. at the start of a new
  session: load the [`run` skill](../run/SKILL.md), which detects
  the app type and starts the backend and frontend.

## How a Web App Differs From a Chat App

The Reboot backend is identical. The deltas are all on the surface:

| Concern      | Chat App (`chat-app`)                                    | Web App (this skill)                                     |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| Front door   | MCP host (ChatGPT, Claude, …) creates a `User` per user. | Browser user logs in; you decide the auth scheme.        |
| API exposure | `mcp=Tool()` on writer/transaction methods.              | Methods exposed only through the generated React client. |
| UI shape     | `UI()` methods → artifacts embedded in the MCP host.     | A normal SPA at `web/` opened at a URL.                  |
| Vite config  | Special — nested `dist/<ui-path>/index.html` for MCP.    | Stock single-page Vite output.                           |
| Test surface | MCPJam inspector + `mcp_servers.json`.                   | Browser + the standard React devtools / Playwright.      |
| `User` type  | Required — the MCP entry point.                          | Optional — only if your app needs per-user state.        |

Backend mechanics (state, methods, Servicers, workflows, refs,
scheduling, stdlib actors, errors, auth predicates, testing) are
**unchanged** — load them from `python`.

## Auth in Web Apps

Web apps wire identity via
`Application(token_verifier=<TokenVerifier>)`, integrating with an
external IdP (Auth0, Firebase, your own JWT issuer, …). Standing
that up is a real piece of work — and until it's done, no caller
has a `context.auth.user_id`, so authorizer rules that depend on
identity can't be satisfied.

> **Don't use `Application(oauth=...)` for web apps.** The `oauth=`
> slot (including `Development()`) is currently MCP-chat-app-only and
> doesn't work for browser-served web apps. For a web app, leave
> `oauth=` unset and use the `token_verifier=` path below. (Web-app
> support for `oauth=` is planned but not yet available.)

Recommended sequence:

1. **Early development (no verifier yet):** **omit `authorizer()`**
   on Servicers. `rbt dev` allows the calls and logs a 60-second
   warning naming every unauthorized method — that warning is your
   TODO list. Do **not** paper this over with `allow()`; `allow()`
   means "public, unauthenticated internet endpoint" and survives
   into production.
2. **Before `rbt serve` / Reboot Cloud:** install a `TokenVerifier`,
   then add `allow_if(...)` rules to every Servicer that should be
   externally reachable. See
   `python/references/servicer-authorizer.md`,
   `python/references/auth-allow-if.md`, and
   `python/references/auth-built-in-predicates.md`. In unit tests,
   substitute `TokenVerifierForTest()` (from `reboot.aio.tests`)
   for your IdP verifier and impersonate users with
   `bearer_token=rbt.make_valid_oauth_access_token(user_id=...)`
   — the authorizer rules still run for real.
3. **Public, unauthenticated endpoints** (health checks, public
   sign-up, public catalog reads): mark these explicitly with
   `allow()`. That's the one legitimate use.

### Feeding the user's identity into hooks — never fabricate an id

A generated `use<Type>({ id })` hook needs a **real, non-empty
actor id on every render**. It is not SWR-style: there is no
"pass `null`/`undefined` to skip the subscription" mode. A falsy
id is a hard throw during render, not a paused hook —
`id: ''` throws `state ID must have a length of at least 1` and
`id: undefined` throws a `TypeError` inside `stateIdToRef`. Either
one crashes the component.

The trap: browser identity (Auth0, Firebase, your own JWT)
resolves **asynchronously**, so on the first renders you have no
user id yet. Do **not** dodge the throw by fabricating a
placeholder — `useUser({ id: userId || '__no-user__' })` is
wrong. An actor id is a **global key**, so every loading session
subscribes to the same shared `__no-user__` actor, it's one
missed write-guard away from cross-user state, and the placeholder
addresses nothing — it just silences the crash.

Since the hook can't be told "no id" and can't be called
conditionally (React's rules of hooks), the fix is to **not mount
the component that calls the hook until you have the real id**.
Gate at the parent and pass a guaranteed-real id down:

```tsx
function UserHome() {
  const { user, isAuthenticated, isLoading } = useAuth0();
  if (isLoading) return <Spinner />;
  if (!isAuthenticated || !user?.sub) return <LoginPrompt />;
  // From here, user.sub is guaranteed present and non-empty.
  return <UserView userId={user.sub} />;
}

function UserView({ userId }: { userId: string }) {
  // Hook always runs, always with a real, per-user id.
  const { create } = useUser({ id: userId });
  // ...
}
```

No placeholder, no fake actor, no `userId && create(...)` guards
scattered around mutations — the hook simply never runs until the
key is real.

### Calling external APIs on the user's behalf

To act **as the user** at an external service (call their Slack,
Google, a partner API), store that service's OAuth tokens encrypted in
an `OAuthTokenManager` and make the call inside a `Workflow`. Because a
web app has no `Application(oauth=...)`, the chat-app `store_tokens=True`
shortcut isn't available — you always run the service's OAuth flow
yourself with your own authorize/callback HTTP endpoints (a callback
registered `app_internal=True`) and call `OAuthTokenManager.store`. The
full host-agnostic recipe — endpoints, storage, reading tokens back, the
in-`Workflow` call, refresh, and erasure — is
`python/references/auth-external-api-calls.md` (Path B). Never store
tokens in a plain `str` field or hand-roll `Ciphertext`
(`python/references/stdlib-oauth-tokens.md`). If the service doesn't do
OAuth at all and the user pastes an **API key** instead, that key goes
through `Ciphertext` (the ciphertext id kept in state) — Path C in the
same recipe.

## Read These From `python` First

Before scaffolding, load the references that cover the backend
mechanics. The patterns in this skill assume you've read them.

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
  defaulting to `list[Todo]`/`list[Document]`/etc. on one parent
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

**Auth (browser users — see "Auth in Web Apps" below for the dev-vs-prod sequence):**

- `python/references/servicer-authorizer.md` — **start here**.
  Explains the `token_verifier=` vs. `oauth=` distinction and when
  to defer writing `authorizer()` vs. write rules from day one.
- `python/references/auth-allow-if.md`,
  `python/references/auth-built-in-predicates.md`,
  `python/references/auth-custom-predicates.md` — the predicate
  machinery once you're ready to write rules.
- `python/references/auth-allow-deny.md` — narrow uses of
  unconditional rules; specifically, when **not** to reach for
  `allow()`.
- `python/references/auth-external-api-calls.md` and
  `python/references/stdlib-oauth-tokens.md` — **calling an external
  service's API as the user**: custom OAuth endpoints (web apps use
  Path B — no `store_tokens=True` shortcut) → `OAuthTokenManager.store`
  → read back + call inside a `Workflow`. Never a plain `str` token
  field.

## Workflow: Plan First, Then Build

**Always plan the design and get approval before writing code.** The
state model is the foundation — getting entities, field types, or
method types wrong means regenerating everything across the project.

### Plan Phase

1. Analyze the user's description using the State Model Assessment
   below.
2. Begin a plan for the user to approve (in Claude Code, enter plan
   mode; in Codex, present the plan and wait for the go-ahead).
3. Present the proposed design:
   - Application types: state shape (fields, types, tags).
   - Method map: which operations, which method type
     (Reader/Writer/Transaction/Workflow).
   - Route surface: which pages does the SPA need; which methods
     each page calls.
   - Auth: anonymous, logged-in, or per-user state? If per-user,
     declare a `User` type for owned data and route through it.
4. Get user approval before writing any files.
5. Then execute the Step-by-Step Build Flow.

For updates to existing apps, still plan: read current state,
propose changes, confirm, then modify.

### Writing the Plan for Human Review

The plan is read by a **human who has not read the skill files**.
They are evaluating the design — entities, collections, methods,
routes, auth — not verifying that you followed the skill. Write
so the plan stands on its own.

**Don't quote skill-internal terms** when presenting the plan.
They mean nothing outside this skill:

- `Shape A` / `Shape B` / `Shape C` — name the actual data
  structure: `list[Sub]` of inline sub-records, `list[str]` of
  foreign state IDs, `OrderedMap` of foreign state IDs.
- "non-state `Model`" — say "a flat sub-record that lives and
  dies with the parent" or "no identity of its own", in domain
  terms.
- Filenames like `state-collections.md` / `api-pydantic.md` —
  drop the citation; if the rule matters to the design, explain
  it inline.
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

Collection shape — BAD:

> `documents_index_id: str` — ID of an OrderedMap actor that
> holds this user's Documents (Shape C from
> state-collections.md — unbounded).

Collection shape — GOOD:

> `documents_index_id: str` — points to an OrderedMap that
> holds this user's Documents. An OrderedMap (rather than an
> inline list) because the document collection grows without
> bound and the dashboard will paginate / sort by recency.

Nested model — BAD:

> Comment and Revision are non-state Models — Shape A.

Nested model — GOOD:

> Comment and Revision live inline on Document as
> `list[Comment]` / `list[Revision]`. They don't get their own
> state actors because they have no lifecycle, methods, or auth
> independent of the Document they belong to.

**Escape hatch.** When the precise type name _is_ what the user
needs to see ("I'm proposing `OrderedMap` here, not `list[str]`"),
name the type — but pair it with the plain-English reason in the
same sentence. The rule is "no bare jargon", not "no technical
terms".

## State Model Assessment

Before writing code, analyze the user's request:

1. **Application types — decompose aggressively.** List every
   distinct entity the user is going to add / edit / list / find
   over time (todos, documents, posts, accounts, people, …).
   **Each entity becomes its own `Type` with its own state**, even
   when "each user only has a few of them". Anything you can
   imagine being `add`-ed / `remove`-d / `find`-ed by name has its
   own identity and belongs in its own actor. The default wrong
   move is packing everything into one parent's state as
   `list[Todo]` (or `list[Document]`, `list[Post]`, …) — that
   flattens N actors into one, prevents per-entity auth/methods,
   and forces a full rewrite when the collection grows. See
   `python/references/state-collections.md` Step 1 for the full
   decomposition signal list.
2. **Per-user state?** If yes, declare a `User` type and route
   creation through it the same way `chat-app` does — the
   `User`-front-door pattern is independent of MCP. If the app is
   anonymous or all users share state, skip `User`.
3. **Container shape for each collection.** Once an entity is its
   own `Type`, parents store **references**, not objects. Three
   shapes (full table + worked example in
   `python/references/state-collections.md`):
   - `list[Sub]` of non-state `Model`s — bounded sub-records with
     no identity of their own (line items on an Order, tags on a
     Post). NOT for entity collections.
   - `list[str]` of foreign state IDs — bounded entity collection
     (low hundreds, occasionally low thousands) you always read
     whole.
   - `OrderedMap` of foreign state IDs — collection grows without
     bound, needs pagination / range queries / ordered iteration.
     The default choice for any "list of things the user keeps
     adding to".
4. **State shape (per type)**: Fields, types — lists, nested
   objects, primitives. Each gets `Field(tag=N)`. Nested `Model`
   sub-objects owned 1:1 by a parent state must be
   `Optional[X] = Field(tag=N, default=None)` and hydrated in the
   parent's factory `create` Writer; non-Optional `Model`-typed
   fields reject `default=` / `default_factory=`. Full rules in
   `python/references/api-pydantic.md`.
5. **Operations**: Map to the right method type:
   - `Reader` — read-only queries.
   - `Writer` — single-state mutations.
   - `Transaction` — multi-state atomic operations.
   - `Workflow` — long-running control flows with loops, scheduling,
     and idempotency helpers.
6. **Pages / routes**: Which SPA routes exist? Which methods does
   each page call? React hooks generated by `rbt generate --react=...`
   wrap the calls.
7. **Auth**: Anonymous-only, public-read + authed-write, fully
   gated, …? See `python/references/auth-*.md`.

## Project Layout

```
<project-root>/
├── .python-version
├── .rbtrc
├── .mypy.ini                # Type-check config (python skill)
├── pyproject.toml
├── api/
│   └── <pkg>/v1/
│       └── <name>.py        # API definition (pydantic)
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
    ├── vite.config.ts       # Stock Vite SPA config
    ├── index.html
    └── src/
        ├── main.tsx         # RebootClientProvider entry
        ├── App.tsx          # Routes + top-level component
        ├── pages/
        │   └── <page>.tsx
        └── api/             # Generated TypeScript client
                             # (output of `rbt generate --react=`)
```

Key differences from a `chat-app` layout:

- `web/index.html` lives at the top of `web/` (single SPA entry),
  **not** under `web/ui/<name>/index.html`.
- `vite.config.ts` is the **stock** Vite config — no nested-output
  override, no `viteSingleFile` plugin. There's no MCP host
  resolving artifacts by path.
- No `mcp_servers.json`. No MCPJam inspector.

## Step-by-Step Build Flow

**Only execute after plan approval. All commands run from the
application directory.**

1. Create `.python-version`, `pyproject.toml`, `.rbtrc`, and
   `.mypy.ini` — same shape as in
   `python/references/lifecycle-{project-setup,rbtrc}.md`. In
   `.rbtrc`, point the React codegen at `web/src/api`:
   ```sh
   generate --react=web/src/api
   generate --web=web/src/api
   ```
2. `uv sync`.
3. Write the API definition (`api/<pkg>/v1/<name>.py`). Pydantic
   rules live in `python/references/api-pydantic.md`; method
   marker → context-type rules in
   `python/references/api-methods.md`. Do **not** add `mcp=Tool()`
   or `UI()` — those are chat-app only.
4. `uv run rbt generate`.
5. Write the servicer (`backend/src/servicers/<name>.py`) —
   context-type patterns in `python/references/servicer-*.md`.
6. Write `main.py` — `python/references/lifecycle-application-entry.md`.
7. Initialize the React app at `web/` with your preferred tool
   (e.g. `npm create vite@latest web -- --template react-ts`) or
   a Reboot-provided template if one exists for plain web apps.
8. `cd web && npm install` and add the Reboot React client
   package(s) per your project's `package.json`.
9. `uv run rbt generate` again — the React bindings need
   `node_modules` to resolve types correctly.
10. Wire `main.tsx` with `RebootClientProvider`, then build `App.tsx`
    and the page components, calling generated `use<Type>()` hooks
    for reader subscriptions and mutations. Field-name conversion is
    Python-snake → TypeScript-camel; request/response types are
    Zod-validated. A reader hook returns both `isLoading` and
    `response`: use `isLoading` (the stream's connection state) for
    loading/disconnected indicators (`!isLoading`, debounced, is a
    connected/disconnected badge) and `response !== undefined` to
    guard data access (it's also the only one that narrows
    `response`'s `T | undefined` type). They diverge: an aborted
    reader is `!isLoading` with no `response`; a reconnect is
    `isLoading` with stale `response`. Transport disconnects
    auto-reconnect and do **not** surface via `aborted`, so don't
    reach for `aborted` or a heartbeat for an online/offline badge.
    When a hook's `id` comes from the authenticated user, gate the
    component so it only mounts once the id is real — see "Feeding
    the user's identity into hooks" above. Never fabricate a
    placeholder id to get past the non-empty-id validation.
11. `cd web && npm run build` (sanity check the bundle).
12. **Write and run backend unit tests covering each user-facing
    user story before handing the app off.** Enumerate the user
    stories from the plan — every action the user should be able
    to _do_ in the UI (e.g. "sign up and see my profile",
    "submit the form and see the result on the dashboard",
    "delete an item and have it disappear"). Write one test
    method per user story in
    `backend/tests/<servicer>_test.py`, following the patterns
    in `python/references/testing-project-setup.md`,
    `python/references/testing-harness.md`, and
    `python/references/testing-external-context.md`. Use one
    `IsolatedAsyncioTestCase`, one external context per test
    (`name=f"test-{self.id()}"`), and
    `Service.ref(id).method(context, ...)` for all calls —
    never instantiate Servicers directly. Register the **real**
    servicers — never subclass a servicer in tests to weaken its
    `authorizer()`. Impersonate users instead:
    `Application(..., token_verifier=TokenVerifierForTest())`
    (from `reboot.aio.tests`; it swaps only the identity layer,
    standing in for your production IdP verifier) plus
    `bearer_token=rbt.make_valid_oauth_access_token(user_id=...)`
    — see the impersonation pattern in `testing-harness.md`. Run
    `cd backend && uv run pytest` and fix anything that fails.
    Then type-check: run `uv run mypy backend/` from the project
    root and fix every error (config and rationale in
    `python/references/lifecycle-project-setup.md`). Do not
    proceed to the next step until every user-story test passes
    and mypy is green — together they are the gate that catches
    contract bugs before the user opens the browser.
13. Run the app — load the [`run` skill](../run/SKILL.md) and
    follow it. It is the single canonical "start the app"
    procedure: it makes sure dependencies and secrets are in
    place, starts the backend and frontend dev server, waits for
    them to come up, and hands the user the URLs plus a first page
    to open.

## Update Flow

When modifying an existing app:

1. Read `.rbtrc`, the API definition, servicer, `main.py`, and
   `web/src/App.tsx`.
2. Assess state model changes. If the app has persisted state or
   has been deployed, read
   `python/references/api-schema-evolution.md` to understand the
   rules you must follow for API schema evolution.
3. Update the API definition → re-run `uv run rbt generate`.
4. Update servicer methods.
5. Update React components and routes.
6. Re-verify the backend: run `uv run mypy backend/` from the
   project root and `cd backend && uv run pytest`; fix every
   error and failure before handing back.
7. If the app isn't already running, bring it up with the
   [`run` skill](../run/SKILL.md). If it is already running under
   `rbt dev run`, the `--watch` globs reload it automatically — no
   restart needed. Editing `.env` likewise triggers a restart, so
   a new or changed secret is re-read by `--env-file` without a
   manual relaunch.

Specific patterns and file shapes live in the `python` skill's
references and the table above — read them on demand based on
what's changing.
