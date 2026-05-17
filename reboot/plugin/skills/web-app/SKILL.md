---
name: web-app
description: Build complete Reboot Web Apps — a Reboot backend behind a standalone browser-facing React frontend, served at a normal URL (not embedded in an MCP host). Layers on top of the python skill for backend mechanics; covers what's specific to standalone Web Apps — no MCP front door, no UI() methods, normal React/Vite SPA scaffolding, and Reboot auth for browser users.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# /web-app — Build Reboot Web Apps

Build complete Reboot Web Apps from a user description: a Reboot
backend behind a standalone React frontend served at a normal URL.

> **Reads from `python`.** This skill is the standalone-web-frontend
> layer on top of the Reboot Python framework. Anything about
> Servicers, Reboot contexts, refs, scheduling primitives, error
> types, the testing harness, the `.rbtrc` shape, or pydantic API
> defaults belongs in `python` — load those references for those
> concerns. This skill covers what's _specific_ to standalone Web
> Apps: a plain React SPA at `web/`, the generated TypeScript hooks
> from `rbt generate --react=...`, regular auth flows (login form /
> cookies / OAuth), and the cross-cutting rules unique to that
> layer.

> **Not for MCP Chat Apps.** If the app's primary front door is an
> MCP host (ChatGPT, Claude, VSCode, Goose, …) with MCP tools and
> embedded UIs, use [`/chat-app`](../chat-app/SKILL.md) instead.
> Signals you're in the wrong place: `mcp=Tool()`, `UI()`, `User`
> auto-construct from the MCP host, `mcp_servers.json`, MCPJam
> inspector.

## When to Use

- Building a new Reboot Web App from a description.
- Adding features, state, or UI to an existing Reboot Web App.
- Modifying state model, methods, or React UI in a Reboot Web App.

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

## Read These From `python` First

Before scaffolding, load the references that cover the backend
mechanics. The patterns in this skill assume you've read them.

**Always relevant:**

- `python` references/`patterns-common-gotchas.md` — recurring trips
  (`self.ref().state_id`, kwargs convention, `--name` vs.
  `--application-name`, etc.).
- `python` references/`api-pydantic.md` — pydantic API rules (every
  Field needs a zero-value default; `list[<Model>]` is silently
  dropped; non-Optional `Model`-typed fields can't take defaults).

**Defining the API:**

- `python` references/`api-methods.md` — marker → context type
  mapping (Reader/Writer/Transaction/Workflow).
- `python` references/`api-errors.md` — typed errors.

**Implementing Servicers:**

- `python` references/`servicer-{reader,writer,transaction, constructor,authorizer}.md` — one per context type.
- `python` references/`rpc-refs.md` — `self.ref().state_id` (never
  `self.state_id`); `self.ref().schedule(...)`.
- `python` references/`rpc-calls.md` — kwargs not Request wrappers.
- `python` references/`rpc-constructor-calls.md` —
  `Service.create(context, id)` semantics.

**Workflows:**

- `python` references/`workflow-method.md` (start here — has the
  When-to-Pick decision table), then the specific primitive
  references for `at_most_once` / `at_least_once` / `until` /
  `until_changes` / `loop` / `state-write` / `idempotency-scopes`.

**Project shell:**

- `python` references/`lifecycle-{project-setup,rbtrc, application-entry,initialize-hook}.md` — the canonical layout,
  the CLI flags, the `Application(...)` constructor, the
  `initialize` hook.

**Auth (browser users):**

- `python` references/`auth-allow-deny.md`,
  `auth-allow-if.md`, `auth-built-in-predicates.md`,
  `auth-custom-predicates.md` — authorization for browser-issued
  RPCs. The same predicate machinery as chat-app; the difference is
  only who's calling.

## Workflow: Plan First, Then Build

**Always enter plan mode before writing code.** The state model is
the foundation — getting entities, field types, or method types
wrong means regenerating everything across the project.

### Plan Phase

1. Analyze the user's description using the State Model Assessment
   below.
2. Enter plan mode (`EnterPlanMode`).
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

## State Model Assessment

Before writing code, analyze the user's request:

1. **Application types**: What primary things is the user managing?
   (todo list, document, account, …) Each becomes its own `Type`
   with its own state.
2. **Per-user state?** If yes, declare a `User` type and route
   creation through it the same way `chat-app` does — the
   `User`-front-door pattern is independent of MCP. If the app is
   anonymous or all users share state, skip `User`.
3. **State shape**: Fields, types — lists, nested objects,
   primitives. Each gets `Field(tag=N)`. Nested `Model` sub-objects
   owned 1:1 by a parent state must be `Optional[X] = Field(tag=N, default=None)`
   and hydrated in the parent's factory `create` Writer; non-Optional
   `Model`-typed fields reject `default=` / `default_factory=`. For
   collections, prefer `list[Item]` with `default_factory=list`. Full
   rules in `python` references/`api-pydantic.md`.
4. **Operations**: Map to the right method type:
   - `Reader` — read-only queries.
   - `Writer` — single-state mutations.
   - `Transaction` — multi-state atomic operations.
   - `Workflow` — long-running control flows with loops, scheduling,
     and idempotency helpers.
5. **Pages / routes**: Which SPA routes exist? Which methods does
   each page call? React hooks generated by `rbt generate --react=...`
   wrap the calls.
6. **Auth**: Anonymous-only, public-read + authed-write, fully
   gated, …? See `python` references/`auth-*.md`.

## Project Layout

```
<project-root>/
├── .python-version
├── .rbtrc
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

1. Create `.python-version`, `pyproject.toml`, `.rbtrc` — same
   shape as in `python` references/`lifecycle-{project-setup,rbtrc}.md`.
   In `.rbtrc`, point the React codegen at `web/src/api`:
   ```sh
   generate --react=web/src/api
   generate --web=web/src/api
   ```
2. `uv sync`.
3. Write the API definition (`api/<pkg>/v1/<name>.py`). Pydantic
   rules live in `python` references/`api-pydantic.md`; method
   marker → context-type rules in `python` references/`api-methods.md`.
   Do **not** add `mcp=Tool()` or `UI()` — those are chat-app only.
4. `uv run rbt generate`.
5. Write the servicer (`backend/src/servicers/<name>.py`) —
   context-type patterns in `python` references/`servicer-*.md`.
6. Write `main.py` — `python` references/`lifecycle-application-entry.md`.
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
    Zod-validated.
11. `cd web && npm run build` (sanity check the bundle).
12. Run the app, each in a separate shell in the background:
    - Backend: `uv run rbt dev run --no-chaos` (the `--no-chaos`
      flag disables the Chaos Monkey, which is a useful feature to
      catch bugs but would be confusing to developers that don't
      see the terminal with the Chaos Monkey output).
    - Frontend with HMR: `cd web && npm run dev`.
13. Check the logs of the backend and frontend to confirm they're
    up. Wait until the backend logs indicate a health check has
    passed and the inspect page URL has printed.
14. Give the user the URLs for the backend inspect page and the
    frontend dev server, plus a first thing to click / a first
    page to open.

## Update Flow

When modifying an existing app:

1. Read `.rbtrc`, the API definition, servicer, `main.py`, and
   `web/src/App.tsx`.
2. Assess state model changes.
3. Update the API definition → re-run `uv run rbt generate`.
4. Update servicer methods.
5. Update React components and routes.

Specific patterns and file shapes live in `python` references and
the table above — read them on demand based on what's changing.
