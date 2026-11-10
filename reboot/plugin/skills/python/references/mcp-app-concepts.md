---
title: MCP App Concepts — the User Front Door, Tools, UI(), Sign-in, Example Prompts
impact: CRITICAL
impactDescription: What makes a Reboot app an MCP App, all of it declared in the API file and the servicers. Getting the front door, the tool surface or a UI's placement wrong means reworking the API and every file generated from it.
tags: mcp, user, front-door, tool, ui, oauth, authorizer, example-prompts
---

# MCP App Concepts

## `User` and Application Types

Every MCP App has a `User` type and one or more application types:

- **`User`** is the AI's entry point for **creating and locating**
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
[`python/references/api-method-types.md`](api-method-types.md).

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
[`python/references/api-method-types.md`](api-method-types.md);
the `UserServicer` + `<X>.create(context)` pattern in
[`python/references/servicer-patterns.md`](servicer-patterns.md).

## Tool Exposure Control

Every method must explicitly declare its MCP exposure:

- **`mcp=Tool()`** — expose the method as an AI-callable tool.
  Required on every method (including `User` methods) the AI should
  be able to call.
- **`mcp=None`** — hide the method from the AI. Use for human-only
  actions or to reduce context bloat.
- **`Tool(name="...", title="...")`** — override the default tool
  name or add a human-readable title.

## Method Types

The `Reader` / `Writer` / `Transaction` / `Workflow` markers come from
`reboot.api` and behave exactly as `python`'s `api-methods.md`
describes (each fixes the Servicer's context type). The MCP App
adds one more:

- **`UI()`** — opens a React UI inside the MCP client. Takes
  `request=` (config type or `None`), `path=` (the UI's URL path
  under `/__/frontend/mcp/`, like `"clicker"` or `"shop/cart"`; its
  source is `frontend/mcp/<path>/`, its build
  `frontend/dist/mcp/<path>/index.html`), `title=`, `description=`.
  **No servicer implementation needed** — the React app _is_ the
  implementation.
  When `request=` is a `Model`, its fields become props on the React
  component.

`factory=True` on an application type's `create` Writer is the
MCP App spelling of a constructor (see `python`'s
`servicer-constructor.md` for the underlying mechanic).

## Auth: `oauth=` Provider Selection and Real Authorizers from Day One

MCP Apps wire identity via `Application(oauth=...)`: what you pass
there stands primarily for **identity** — it determines who
`context.auth.user_id` says the caller is, and in an MCP App that
principal is the user. There's no middle ground: either every user
signs in through this OAuth flow, or the app has no per-user auth at
all. The slot takes an `OAuth`, whose `provider` is an
`OAuthProviderSelector`. The typical shape is
`oauth=OAuth(provider=OAuthProviderByEnvironment(dev=Development(), prod=Google(...)))`:
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
> [`python/references/auth-oauth-providers.md`](auth-oauth-providers.md).
> Each provider issues user IDs in its own namespace, so switching
> providers after launch strands every user-keyed piece of state.
> `Development` is dev-only — replace it before shipping — and don't
> launch on a throwaway like `Anonymous` planning to "upgrade later";
> do it **before** real users have state. `Google` / `GitHub` give you
> a user id and nothing more; if the app needs **user management**
> (profiles, password resets, MFA, blocking users), use `Auth0`. If no
> shipped provider fits (self-hosted Keycloak, internal SSO), write
> your own — see
> [`python/references/auth-custom-oauth-provider.md`](auth-custom-oauth-provider.md).

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
and `python/references/servicer-authorizer.md`. The MCP App delta
is just **which mode you're in**: `oauth=` + real rules from day one.

**Acting on the user's behalf at the provider.** Beyond identity,
`Google` / `GitHub` / `Auth0` can request extra OAuth `scopes=[...]` and
capture the provider's tokens (`store_tokens=True`) so the app can call
that provider's API as the signed-in user (their calendar, repos, etc.).
Reboot stores the **provider's own** tokens only — with `Auth0` that's
an Auth0 token, not the upstream Google token a brokered sign-in went
through. The tokens are stored encrypted and read back with
`OAuthTokenManager.ref(GOOGLE).fetch(context, user_id=context.state_id)`,
and the outbound call goes **inside a `Workflow`**. The MCP App
`store_tokens=True` shortcut is in
[`python/references/auth-store-tokens.md`](auth-store-tokens.md);
the full read-path and in-`Workflow` call recipe (shared with web apps)
is in
[`python/references/auth-external-api-calls.md`](auth-external-api-calls.md).

**Files the UI fetches from the backend.** A plain HTTP route — an
image or video the UI shows, a download — serves every request
unless registered with `require_oauth_token=True`, which serves only
a request carrying the client's bearer. A plain `<img src>` cannot
carry one, so the UI obtains a short-lived signed URL with the bearer
and gives that to `src`. Backend and page side in
[`python/references/auth-http-routes.md`](auth-http-routes.md).

## Declarative, Not Decorator

All MCP surface is defined in the API file. `main.py` is minimal. No
`@mcp.tool()` decorators.

## State Is Durable

State survives restarts. `dev run --application-name=<name>` in
`.rbtrc` (see [`python/references/lifecycle-mcp-app-shell.md`](lifecycle-mcp-app-shell.md))
is what makes that work.

## Example Prompts (Root-Page Wizard)

Every MCP App ships **example prompts** — short, named chat
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
the method map from the design: for each `UI()` method, make sure at
least one example drives the user to it.

They live in `backend/src/example_prompts.py` and are passed to
`Application(example_prompts=...)` in `main.py`. Full file shapes and
a worked set are in
[`python/references/lifecycle-mcp-app-shell.md`](lifecycle-mcp-app-shell.md); the
`mcp-app-counter` example is the canonical reference.

