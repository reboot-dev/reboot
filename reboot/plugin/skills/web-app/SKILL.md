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

> **Dual-surface apps are supported.** A single app can serve both
> a standalone web SPA _and_ an MCP front door from the same
> backend — they share `oauth=...`, the same `User` actor per
> upstream identity, and the same servicer code. If your app needs
> both surfaces, also load the
> [chat-app skill](../chat-app/SKILL.md) for the MCP-specific
> additions (`mcp=Tool()`, `UI()`, MCPJam).
> This skill alone covers the web side.

## When to Use

- Building a new Reboot Web App from a description.
- Adding features, state, or UI to an existing Reboot Web App.
- Modifying state model, methods, or React UI in a Reboot Web App.
- Running an existing Reboot Web App — e.g. at the start of a new
  session: load the [`run` skill](../run/SKILL.md), which detects
  the app type and starts the backend and frontend.
- Putting a finished Web App in production — load the
  [`deploy` skill](../deploy/SKILL.md): backend on Reboot Cloud,
  frontend on a static host under the user's own custom domain.

## How a Web App Differs From a Chat App

The Reboot backend is identical. The deltas are all on the surface:

| Concern      | Chat App (`chat-app`)                                    | Web App (this skill)                                                                   |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Front door   | MCP host (ChatGPT, Claude, …) creates a `User` per user. | Browser user signs in via `Application(oauth=...)`; same `User` per upstream identity. |
| API exposure | `mcp=Tool()` on writer/transaction methods.              | Methods exposed only through the generated React client.                               |
| UI shape     | `UI()` methods → artifacts embedded in the MCP host.     | A normal SPA at `web/` opened at a URL.                                                |
| Vite config  | Special — nested `dist/<ui-path>/index.html` for MCP.    | Stock single-page Vite output.                                                         |
| Test surface | MCPJam inspector.                                        | Browser + the standard React devtools / Playwright.                                    |
| `User` type  | Required — the MCP entry point.                          | Optional — only if your app needs per-user state.                                      |

Backend mechanics (state, methods, Servicers, workflows, refs,
scheduling, stdlib actors, errors, auth predicates, testing) are
**unchanged** — load them from `python`.

## Auth in Web Apps

Web apps wire identity via
`Application(oauth=OAuthProviderByEnvironment(dev=Development(), prod=Google(...)))`
— the same parameter MCP chat apps use. Reboot mounts its
built-in OAuth Authorization Server at `/__/oauth/*` and brokers
sign-in against the configured upstream IdP. Browser sessions
are carried in an HttpOnly `rbt_session` cookie set by
`/__/oauth/finish`; the framework reads it as a bearer on every
RPC, so user code only sees `context.auth.user_id` (same shape
as MCP).

> **`token_verifier=` is the escape hatch, not the default.** Use
> it only when you need to integrate with an IdP that the
> built-in `oauth=` providers don't cover (e.g. an enterprise
> SAML/OIDC broker you can't wrap as an `OAuthProvider`
> subclass), or when you need custom token semantics. For
> standard Google/GitHub/Auth0/anonymous sign-in, prefer
> `oauth=...`. The two compose: when both are set, Reboot's own
> verifier runs first and any token it has no opinion on
> (anything that is not a Reboot-minted access JWT) falls
> through to yours.

The imports, so you don't have to go looking for them:

```python
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Development,
    Google,                       # or GitHub, Auth0, …
    OAuthProviderByEnvironment,
)
```

Recommended sequence:

1. **Early development (no provider chosen yet):** configure
   `oauth=OAuthProviderByEnvironment(dev=Development(), prod=None)`.
   `Development()` is a built-in fake account picker that lets
   you sign in as any identity at `/__/oauth/start`; `prod=None`
   fails fast at startup if you accidentally `rbt serve` without
   choosing a real provider. **Omit `authorizer()`** on
   Servicers; `rbt dev` allows the calls and logs a 60-second
   warning naming every unauthorized method — that warning is
   your TODO list. Do **not** paper this over with `allow()`;
   `allow()` means "public, unauthenticated internet endpoint"
   and survives into production.
2. **Before `rbt serve` / Reboot Cloud:** set `prod=Google(...)`
   (or `GitHub(...)`, `Auth0(...)`, your own `OAuthProvider`
   subclass), then add `allow_if(...)` rules to every Servicer
   that should be externally reachable. See
   `python/references/servicer-authorizer.md`,
   `python/references/auth-allow-if.md`, and
   `python/references/auth-built-in-predicates.md`. The
   The providers and what each needs:

   All arguments are keyword-only.

   | provider        | required arguments                        |
   | --------------- | ----------------------------------------- |
   | `Development()` | none — dev only, sign in as any identity  |
   | `Anonymous()`   | none — every visitor is a fresh identity  |
   | `Google(...)`   | `client_id=`, `client_secret=`            |
   | `GitHub(...)`   | `client_id=`, `client_secret=`            |
   | `Auth0(...)`    | `domain=`, `client_id=`, `client_secret=` |
   | `Ory(...)`      | `domain=`, `client_id=`, `client_secret=` |

   The registered providers (everything but `Development` and
   `Anonymous`) also take `scopes=`, `claims=`, and
   `store_tokens=`; register `/__/oauth/callback` as the redirect
   URI with the provider.

   Add `claims=[...]` when you need identity fields such as the
   user's email, and `store_tokens=True` only when you will call
   that provider's own API as the user. **Choose deliberately
   before real users exist**: `context.auth.user_id` is namespaced
   per provider, so switching providers after launch strands every
   existing user's state. Only reach for
   [chat-app/references/auth-oauth-providers.md](../chat-app/references/auth-oauth-providers.md)
   if you need to write a custom provider or debug a specific
   provider's flow. In unit tests, keep
   `token_verifier=<your IdP verifier>` exactly as in production —
   the test harness's OAuth server verifies the impersonation token
   minted by `await rbt.create_external_context_as(name, user_id)`,
   and a custom bearer a test constructs by hand still hits your IdP
   verifier; the authorizer rules run for real either way.

3. **Public, unauthenticated endpoints** (health checks, public
   sign-up, public catalog reads): mark these explicitly with
   `allow()`. That's the one legitimate use.

### Feeding the user's identity into hooks

With `Application(oauth=...)` the signed-in user's own state needs
no id-threading: call the `User` hook with **no arguments**. For
explicit-id hooks the rule is that the id must be real on every
render — never a placeholder — which is covered with the rest of
the hook mechanics in
[`references/react-client.md`](references/react-client.md).

### Calling external APIs on the user's behalf

To act **as the user** at an external service (call their Slack,
Google, a partner API), store that service's OAuth tokens encrypted in
an `OAuthTokenManager` and make the call inside a `Workflow`. When the
API belongs to the identity provider you already sign in with via
`Application(oauth=...)` (`Google` / `GitHub` / `Auth0`), use the
`store_tokens=True` shortcut: add the extra `scopes=[...]` your calls
need and the OAuth server captures the provider's tokens at sign-in
(Path A in `python/references/auth-external-api-calls.md`). For any
other service, run that service's OAuth flow yourself with your own
authorize/callback HTTP endpoints (a callback registered
`app_internal=True`) and call `OAuthTokenManager.store`. The full
host-agnostic recipe — endpoints, storage, reading tokens back, the
in-`Workflow` call, refresh, and erasure — is
`python/references/auth-external-api-calls.md` (Path B). Never store
tokens in a plain `str` field or hand-roll `Ciphertext`
(`python/references/stdlib-oauth-tokens.md`). If the service doesn't do
OAuth at all and the user pastes an **API key** instead, that key goes
through `Ciphertext` (the ciphertext id kept in state) — Path C in the
same recipe.

### Browser-side wiring (React)

All of it — the provider (and the `url` it must be given), the
generated hook surface, sign-in/sign-out, reading typed errors, and
why a hook's `id` must be real on every render — is in
[`references/react-client.md`](references/react-client.md). Read it
at the frontend step; don't reconstruct it from memory here.

## Which References to Read, and When

Everything you read stays in the conversation and is re-sent on
every later turn, so **read each reference at the step that needs
it** — not all of them up front — and read each one **once**. The
groups below are in build order, and each reference appears in
exactly one of them — the step that needs it.

> **Never read `chat-app/references/*` for a web app.** They cover
> the MCP surface — `UI()` artifacts, the MCPJam inspector, the
> nested `frontend/mcp/<name>/` Vite output, `mcp=Tool()` markers,
> popping a widget out into a web app. Reaching into them costs
> context and produces chat-app-shaped code (`mcp=None` on every
> method of an app with no MCP surface). The web equivalents are
> [`references/react-client.md`](references/react-client.md) and the
> `python` references named below. The single exception is
> [chat-app/references/auth-oauth-providers.md](../chat-app/references/auth-oauth-providers.md),
> which is surface-neutral: read it when you pick a real provider.

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
  `list[Todo]`/`list[Document]`/etc. on one parent for entity
  collections — see Step 1 of that reference.
- `python/references/state-nested-models.md` — the same rule from
  the nested-`Model` angle.

**Before the project shell** (`.rbtrc`, `pyproject.toml`,
`.mypy.ini`, `main.py`):

- `python/references/lifecycle-{project-setup,rbtrc,application-entry,initialize-hook}.md` — the canonical layout, the CLI flags, the
  `Application(...)` constructor, the `initialize` hook.

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

**Before the authorizers** (browser users — see "Auth in Web Apps"
above for the dev-vs-prod sequence):

- `python/references/servicer-authorizer.md` — **start here**.
  Explains `oauth=` (the default) vs. `token_verifier=` (the
  escape hatch for custom IdPs) and when to defer writing
  `authorizer()` vs. write rules from day one.
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

**Before the frontend:**

- [`references/react-client.md`](references/react-client.md) — the
  `web/` shell (Vite config, including the `server.host` the browser
  needs), the backend URL (`VITE_REBOOT_URL` — the default detection
  resolves to Vite's origin, not the backend's), sign-in/sign-out,
  and how a typed backend error becomes a message the user sees.
- `python/references/react-generated-client.md` — what
  `rbt generate --react=` emits: the `use<Type>()` overloads, the
  three-field reader return, why mutations resolve to
  `{ response, aborted }` instead of throwing, the typed error
  classes, and the snake→camel naming rules.

**Before the tests:** the three `python/references/testing-*.md`
files, plus `python/references/patterns-idempotency.md` — it
explains `IdempotencyUncertainError`, which is otherwise the one
runtime error whose cause is not in any reference you have read.

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
[`references/react-client.md`](references/react-client.md), the
backend shapes in `python/references/`. Use them.

If something genuinely isn't covered, bound the output hard: a
targeted `grep -n … | head -40`, or `sed -n '<start>,<end>p'` over
a known range. Never a whole generated file, never an unbounded
recursive grep.

## Workflow: Settle the Design, Then Build

**Always settle the design before writing code.** The state model
is the foundation — getting entities, field types, or method types
wrong means regenerating everything across the project.

### Design Phase

1. Analyze the user's description using the State Model Assessment
   below.
2. State the design you are about to build:
   - Application types: state shape (fields, types, tags).
   - Method map: which operations, which method type
     (Reader/Writer/Transaction/Workflow).
   - Route surface: which pages does the SPA need; which methods
     each page calls.
   - Auth: anonymous, logged-in, or per-user state? If per-user,
     declare a `User` type for owned data and route through it.
3. Then execute the Step-by-Step Build Flow.

For updates to existing apps, still work the design first: read
current state, state the changes, then modify.

### Writing the Design for a Human Reader

The design is read by a **human who has not read the skill files**.
They are judging the design — entities, collections, methods,
routes, auth — not verifying that you followed the skill. Write
so it stands on its own.

**Don't quote skill-internal terms** when presenting the design.
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

**Escape hatch.** When the precise type name _is_ what the reader
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
   locked down, …? See `python/references/auth-*.md`.

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
│   ├── .pytest.ini          # pythonpath: src/ api/ ../api/
│   ├── src/
│   │   ├── main.py          # Application entrypoint
│   │   └── servicers/
│   │       └── <name>.py    # Servicer implementation
│   └── tests/
│       └── <name>_test.py   # One test per user story
└── web/
    ├── .env.development     # VITE_REBOOT_URL=http://localhost:9991
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
  **not** under `frontend/mcp/<name>/index.html`.
- `vite.config.ts` is the **stock** Vite config — no nested-output
  override, no `viteSingleFile` plugin. There's no MCP host
  resolving artifacts by path.
- No MCPJam inspector.

## Step-by-Step Build Flow

**All commands run from the application directory.**

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
4. `uv run rbt generate`. Don't read what it wrote: the signature
   your servicer must match is in `python/references/api-methods.md`
   ("The Servicer Signature Each Declaration Obliges").
5. Write the servicer (`backend/src/servicers/<name>.py`) —
   context-type patterns in `python/references/servicer-*.md`.
6. Write `main.py` — `python/references/lifecycle-application-entry.md`.
7. Initialize the React app at `web/` with your preferred tool
   (e.g. `npm create vite@latest web -- --template react-ts`) or
   a Reboot-provided template if one exists for plain web apps.
   Read [`references/react-client.md`](references/react-client.md)
   now — it has the `package.json` dependency set, the `dedupe`
   entry the Vite config needs, and `web/.env.development` with
   `VITE_REBOOT_URL`.
8. `cd web && npm install` and add the Reboot React client
   package(s) per your project's `package.json`.
9. `uv run rbt generate` again — the React bindings need
   `node_modules` to resolve types correctly.
10. Build the frontend from
    [`references/react-client.md`](references/react-client.md): the
    provider and its `url`, the generated hook/mutator/error
    declarations, sign-in, and typed errors are all written out
    there. Write the calls from that reference and do **not** open
    `web/src/api/**/*_rbt_react.ts` to check them — it is tens of
    thousands of lines that then ride along on every later turn.
11. `cd web && npm run build` (sanity check the bundle).
12. **Write and run backend unit tests covering each user-facing
    user story before handing the app off.** Enumerate the user
    stories from the design — every action the user should be able
    to _do_ in the UI (e.g. "sign up and see my profile",
    "submit the form and see the result on the dashboard",
    "delete an item and have it disappear"). Write one test
    method per user story in
    `backend/tests/<servicer>_test.py`, following the patterns
    in `python/references/testing-project-setup.md`,
    `python/references/testing-harness.md`, and
    `python/references/testing-external-context.md`. When a test fails
    for a reason that looks like it is inside the framework, check
    `python/references/patterns-idempotency.md` and
    `patterns-common-gotchas.md` before reading `site-packages`. Use one
    `IsolatedAsyncioTestCase`, one external context per test
    (`name=f"test-{self.id()}"`), and
    `Service.ref(id).method(context, ...)` for all calls —
    never instantiate Servicers directly. Register the **real**
    servicers — never subclass a servicer in tests to weaken its
    `authorizer()`. Impersonate users instead: keep
    `Application(..., token_verifier=<your IdP verifier>)` exactly
    as in production and call
    `await rbt.create_external_context_as(name, user_id)` — see the
    impersonation pattern in `testing-harness.md`. Run
    `cd backend && uv run pytest` and fix anything that fails.
    Then type-check: run `uv run mypy backend/` from the project
    root and fix every error (config and rationale in
    `python/references/lifecycle-project-setup.md`). Do not
    proceed to the next step until every user-story test passes
    and mypy is green — together they are what catches
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
