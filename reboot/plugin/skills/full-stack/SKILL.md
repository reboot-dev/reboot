---
name: full-stack
description: The build of a Reboot application, one backend with its frontends (a web app, an MCP App, or both), a layer at a time: every scenario, then the backend, then the frontend, then the browser scenarios; what each frontend adds is in this one file, not in references. Loaded by the app skill with the frontends chosen; use it directly only when asked for by name (/reboot:full-stack).
argument-hint: [web|mcp|both] [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# full-stack — Build a Reboot App, a Layer at a Time

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

One build for every Reboot app. The backend is the same whatever the
app is used from; what differs is each feature's **surface**, where a
person or an AI reaches it:

| surface | used from | a feature's surface is | proven by | read |
| --- | --- | --- | --- | --- |
| **Web** | a browser, at the app's URL | a page | a browser scenario | **Web**, under The Frontends |
| **MCP** | an MCP host (Claude, ChatGPT, …) | tools, and a `UI()` | scenarios calling its tools' methods | **MCP**, under The Frontends |
| **Both** | both, one backend, one sign-in | any of these | both | all three, **Both** last |

The [`app` skill](../app/SKILL.md) settles the frontends before
loading this skill. If you were loaded without them, ask the app
skill's question first.

The order of work is the [`feature` skill](../feature/SKILL.md)'s, run for
the whole app: every feature agreed in English (the design) and
written down `@wip` before the API exists, then **built a layer at a
time across every feature**: all the scenarios (failing against
stubs), the whole backend until they pass, the whole frontend, the
browser scenarios. **Read feature's [`SKILL.md`](../feature/SKILL.md) at the
design**, once; this skill says where each of its steps falls.

The backend mechanics (servicers, contexts, refs, workflows,
scheduling, errors, auth predicates, testing, `.rbtrc`, pydantic) are
the [`python` skill](../python/SKILL.md)'s references; this skill's
own references are the surfaces and the app-layer shapes on top.

## Which References to Read, and When

Everything read stays in the conversation and is re-sent on every
later turn: read each reference **at the step that needs it**, and
**once**. Read them **with the Read tool, one file a call**, a
step's files in parallel in one turn: those reads are approved at
once. Never gather references through the shell (a `for … cat` loop
into a scratch file): a command that writes a file waits on a
permission check every time. `python/` below is `../python/references/`; the rest are
this skill's, `references/`: a reference named bare below
(`visual-interactive.md`) is there. Where one says "the loop, C3" or
"C4" it means the per-feature build they were written for; here that
is the frontend pass (C3) and the browser pass (C4).
A line marked **Web** or **MCP** is read only for that surface (Both
reads both).

**At the design:** the frontends' sections below (The Frontends); **Web**
[`visual-interactive.md`](references/visual-interactive.md) and the
looks' index, [`looks/README.md`](references/looks/README.md) (never a
look in full until one is chosen).

**Before the project shell:** `python/lifecycle-{project-setup,rbtrc,application-entry,initialize-hook}.md`;
**MCP** [`project-shell.md`](references/project-shell.md) (the
`.rbtrc` lines, `main.py`, `example_prompts.py`).

**Before the API:**
- `python/api-pydantic.md` and `python/api-methods.md`;
  `python/api-errors.md` only when it declares errors.
- `python/state-collections.md` — **always, when the app has any
  "list of X"**; `python/state-nested-models.md` only when a state
  holds a model inside a model; `python/state-actor-decomposition.md`
  only when the design left a state type holding more than one
  concern (the split itself was settled at the design).
- [`api-state-shapes.md`](references/api-state-shapes.md) and
  [`gotchas.md`](references/gotchas.md) (its **(MCP)** entries only for
  that surface).
- **MCP** [`api-method-types.md`](references/api-method-types.md):
  `User`, `mcp=Tool()`, `UI()` and its placement, `factory=True`.

**Before the servicers:** `python/patterns-common-gotchas.md` (most
of its entries are about servicers, `.rbtrc` and `main.py`),
`python/servicer-{reader,writer,transaction,constructor}.md`
(the context types declared), `python/rpc-refs.md`,
`python/rpc-calls.md`, `python/rpc-constructor-calls.md`,
`python/servicer-workflow.md` (only with a `Workflow`, then top to
bottom), and [`servicer-patterns.md`](references/servicer-patterns.md).

**Before the authorizers:** `python/servicer-authorizer.md`,
`python/auth-allow-if.md`, `python/auth-built-in-predicates.md`,
`python/auth-custom-predicates.md`, `python/auth-allow-deny.md`;
[`auth-oauth-providers.md`](references/auth-oauth-providers.md) when
choosing a real provider, [`auth-custom-oauth-provider.md`](references/auth-custom-oauth-provider.md)
to write one. Calling an external API **as the user**:
`python/auth-external-api-calls.md` (Path A, `store_tokens=True`, for
the sign-in provider's own API, any surface; Path B for any other
service) and [`auth-store-tokens.md`](references/auth-store-tokens.md).

**Before the frontend:** `python/react-generated-client.md`; **Web**
[`react-client.md`](references/react-client.md); **MCP**
[`react-scaffolding.md`](references/react-scaffolding.md) and
[`react-app-tsx.md`](references/react-app-tsx.md);
[`pop-out-to-web-app.md`](references/pop-out-to-web-app.md) only for
a UI that opens the web app.

**Before the first scenario:** `python/testing-project-setup.md`,
`python/testing-features.md` (always), `python/patterns-idempotency.md`;
**Web** `python/testing-web-app.md`. `python/testing-harness.md` and
`testing-external-context.md` for custom steps;
`python/testing-failure-recovery.md` whenever the app has a spawned
task, a `Workflow` or `schedule()`d work.

**Before running the app:** the [`run` skill](../run/SKILL.md).

## Never Read Generated or Installed Source, or Another Project

`*_rbt.py`, `*_rbt_react.ts`, `site-packages/`, `node_modules/` and
codegen templates run to tens of thousands of lines, and every one
opened rides along on every later turn. The surfaces they generate
are written out in the references above. If something genuinely is
not covered, bound the output: `grep -n … | head -40`, or
`sed -n '<a>,<b>p'`. When a scenario fails for what looks like a
framework reason, check `python/patterns-idempotency.md` and
`python/patterns-common-gotchas.md` first.

**Never copy from another project on disk** (a sibling project, an earlier build): not its config, tests, frontend or `node_modules`.
Another project is not this skill's and may be wrong in ways nothing
here says; the project shell, the test module and the frontend come
from this skill's references, and the React client's surface
(provider, sign-in, the `useUser()` gate) from `react-client.md`.

## Files Are Written With Write and Edit

Every file of the app (the API, a servicer, a page, a feature file,
`AGENTS.md`) is written with the **Write** tool and changed with
**Edit**, one file a call, several in one turn when they are
independent. Never through the shell: no `cat > file <<EOF`, no
inline `python3 -` rewriting a file, no `sed -i`. A shell command
that writes files waits on a permission check, minutes for a long
one; Write and Edit in the project go straight through. The shell is
for running things (`rbt generate`, `uv run pytest`, `npm run
build`), not for writing them.

**One exception: an `.html` or `.svg` page file.** The desktop app
shows every `.html` or `.svg` the Write tool writes in its Browser
pane, a raw file that is no page of the app's. So:
- **An MCP UI's files are the scaffolder's**: `npm create
  @reboot-dev/ui` writes each UI's `index.html`, `main.tsx`,
  `App.tsx` and CSS. Never write a UI's `index.html`; write its
  `App.tsx` and CSS.
- **The web app's `index.html`** is written with Write as
  `frontend/web/index.html.tmp`, then renamed in one command of its
  own, `mv <path>/index.html.tmp <path>/index.html`, absolute paths,
  nothing else on the line (the plugin approves exactly that).
- **No `favicon.svg`**: the icon goes inside `index.html`, as
  `<link rel="icon" href="data:image/svg+xml,…">`.

## The Frontends

What each frontend adds on top of the backend. Read **Web** for a web
app, **MCP** for an MCP App, and for Both all three, **Both** last;
the references each names, at the step that needs them.

### Web — a Standalone Browser App
A web app is a React SPA at `frontend/web/`, served at the backend's
own origin, used in a normal browser. A feature's **page** is its web
surface; its **browser scenario** is how the page is proven.

#### At the design

- The app's page map (A3): a home page, a list
  and a detail page for each kind of thing, each creation as a flow;
  for each page, the feature that first builds it and the methods it
  calls.
- `User` is declared in every design (the assessment, 4): the sign-in gate's `useUser()` needs it. Route
  creation through it as the MCP surface does.

#### In the API

Every `Reader`, `Writer`, `Transaction` and `Workflow` still takes
`mcp=`; write `mcp=None` on each. No `mcp=Tool()`, no `UI()`.

#### Sign-in

The browser signs in through `Application(oauth=...)`: Reboot's
OAuth server at `/__/oauth/*` sets an HttpOnly `rbt_session` cookie
that every RPC carries, so the code only sees `context.auth.user_id`.
The signed-in user's own state needs no id-threading: call the `User`
hook with **no arguments**. Sign-in and sign-out buttons, and why a
hook's id must be real on every render, are in `react-client.md`.
The app's root gates on `useUser()` before it renders the shell:
`isLoading` shows the shell's calm line, `user === undefined` the
sign-in screen, and only then the signed-in shell. Without the gate a
signed-in browser flashes the sign-in screen first, and a browser
scenario's first click races it.

A plain HTTP route the page calls (a download, an image) gets no
cookie and no bearer from `<img src>` or `<a href>`: register it with
`require_oauth_token=True` and give `src` a short-lived signed URL
(`python/auth-http-routes.md`).

Tests build their own `Application(...)`: `Development()` for both
arms of the provider and `allowed_origins=[]` when a scenario opens
the web app (`python/testing-web-app.md`).

#### The shell (foundation)

```sh
npm create vite@latest frontend -- --template react-ts
```

then shape it as `react-client.md` shows: `index.html`, `src/` and
`public/` under `frontend/web/`, `vite.config.ts` with
`reboot({ webAppPath: "web", apiPath: "api" })`, the `dedupe` and
`server.host` entries, the Reboot packages in `package.json`. In
`.rbtrc`, `generate --react=frontend/api` and the `--web-app` lines
(`python/lifecycle-rbtrc.md`). No `VITE_REBOOT_URL`
in development: the web app is served at the backend's origin, and
the page is opened there (`https://<app>.localhost/`), never at the
Vite dev server's own origin. `.env.production` sets it for a deploy
elsewhere.

#### A feature's page (C3, the frontend pass)

Its view, look and gesture are
[`visual-interactive.md`](references/visual-interactive.md)'s; this is the
React underneath.

From `react-client.md` (the provider, the generated hooks and
mutators, typed errors) and
`python/react-generated-client.md` (what `rbt
generate --react=` emits). Do **not** open
`frontend/api/**/*_rbt_react.ts`. Build the page with accessible
markup from the start: labels paired with inputs, buttons that say
what they do, tables with a labelled heading; that is what a
scenario drives. **Each item is reachable on its own**: a list's row
or card carries the item's name as its accessible name
(`<tr aria-label="Task 14">`), so a scenario says `sees "Blocked" in the "Task 14" row` rather than matching a word that appears on the
page fifty times, or elsewhere ("Done" in "Nothing done yet").
**A select's options are labelled for a person** ("Task 14", a person's name), since the select step picks an option by its visible
text, never by its value or an id; and no step waits for an option to
be seen, since an option inside a closed `<select>` is never visible
(the select step waits for it itself). **The step names the whole
label as the page builds it, from the real data**: "Task 14, Design" is read from the code that creates the tasks (which project each is in), never guessed from what looks right. When a select
step cannot find its option, read the option's text in the live page
first (the page's own `<option>`s); change the label or the page only
once that shows the label is what is wrong.

#### A feature's browser scenario (C4, the browser pass)

The flow a person clicks through, with backend assertions on what it
left behind, per `python/testing-web-app.md` (the
`frontend` fixture, the web app steps; it needs `playwright`,
`pytest-playwright` and `uv run playwright install chromium`, once,
before the first browser scenario). Running it records a video and screenshots the
dashboard's Features page shows.

A scenario that still fails after two fixes aimed at it is `@blocked`
with what was seen, and the build goes on (C4, the browser pass): a drag a
browser driver will not deliver is the usual one, and a third guess
costs more than the feature. Never restyle the page to get a drop to
land.

#### Handoff

The backend's URL, where the web app is served (`https://<app>.localhost/`
under portless, `http://localhost:9991/` without), a first page to
open, and the recordings on the Features page.

### MCP — Tools and UIs in an MCP Host
An MCP App is used from an MCP host (Claude, ChatGPT, VSCode, Goose,
MCPJam): the AI calls the app's **tools**, and a `UI()` method opens a
React component inside the host. A feature's MCP surface is its tools
and, where a person should see something, its UI.

#### The `User` front door

Every MCP App has a `User` type: the AI's entry point for **creating
and locating** instances of the application types, not a container
for their state. `User` holds identity and the IDs of what it owns;
its methods are `Transaction`s that call `<Type>.create(context)` and
record the new ID, and `Reader`s that find existing ones. Each
concern (session, persona, a background engine's config) is its own
`Type`, referenced by ID (`python/state-actor-decomposition.md`).
Application types take `factory=True` on their `create` Writer.
Shapes: `api-method-types.md`, `servicer-patterns.md`.

#### Tools

Every method declares its exposure: `mcp=Tool()` for one the AI calls
(`User`'s included), `mcp=None` to hide it; `Tool(name=, title=)`
overrides the name. Everything is in the API file; `main.py` stays
minimal, no decorators.

#### UIs

`UI()` opens a React component in the host: `request=` (a `Model` of
free-form config, or `None`), `path=` (the URL path under
`/__/frontend/mcp/`; source `frontend/mcp/<path>/`), `title=`,
`description=`. No servicer method: the React app is the
implementation. **Placement:** a UI about one entity goes on that
entity's `Type` with `request=None` (the tool target becomes the
actor ID and `use<Type>()` resolves it with no arguments); a UI about
the user as a whole (a dashboard) goes on `User`. An entity ID inside
a `request=` model on `User` is the wrong shape
(`api-method-types.md`, "UI Placement").

#### Example prompts

About three `ExamplePrompt(title=..., prompts=[...])` in
`backend/src/example_prompts.py`, passed to
`Application(example_prompts=...)`: each a sequence of messages
walking a main user story, most ending on a turn that opens a `UI()`
("…and show me the board"). Every `UI()` is reached by at least one.
Written at the design, updated by each feature that adds a UI
(`project-shell.md`).

#### Auth

`oauth=` as for every surface. `User` servicers need no custom
`authorizer()` (the default, `state_id_is_user_id` + `is_app_internal`,
is production-worthy); application types use
`allow_if(all=[state_id_is_user_id])` for one user's state, or other
predicates when shared. A UI's `<img src>` reaching the backend
carries no bearer: a signed URL (gotcha 23).

#### The shell (foundation)

`npm create @reboot-dev/ui`, then `react-scaffolding.md` (the
`frontend/` shell, `build.mjs`, `vite.config.ts` with
`reboot({ mcpAppPath: "mcp", apiPath: "api" })`) and `project-shell.md`
(the `.rbtrc` with `--mcp-app` and `--mcp-app-dist-path`, `main.py`,
`example_prompts.py`).

#### A feature's UI (C3, the frontend pass)

`frontend/mcp/<path>/` per `react-app-tsx.md`: one `use<Type>()`
subscription per UI; across many actors, the composing reader in the
same file. `cd frontend && npm run build` builds every UI.

#### Proving it (C4, the browser pass)

A `UI()` reads its actor's ID from the host's tool input, so no
scenario can open one outside a host. The feature's tools are its
methods, so its scenarios call those methods as the AI would: that is
the MCP surface's proof. Say in the handoff that the UIs were built
and not driven by a scenario, and that the wizard is where to try them.

#### Handoff

The setup wizard at the root (`https://<app>.localhost`, or
`http://localhost:9991`), opened once by the `run` skill, and a
first prompt to try from the example prompts. MCPJam is started from
the wizard, only if the user picks it.

### Both — One Backend, a Web App and an MCP App
One backend serves a web app and an MCP App. **Web** and **MCP** above
both apply; this says how they combine, and where they differ, this
decides.

#### At the design

Each feature names its surfaces: a page, a `UI()`, tools, or several.
Most features a person does in the browser are also tools for the AI;
a UI and a page about the same entity can share their components'
logic but are separate entries (`frontend/web/` and `frontend/mcp/`).

#### One backend

- `User` is required (OAuth creates it at a first sign-in), and the web app's
  signed-in user is the same `User`: one per upstream identity, under
  one `Application(oauth=...)`. A user signed in on one frontend is
  signed in on the other (the session cookie short-circuits
  `/authorize`).
- The design's method map says who calls each method: one the chat
  client calls is `mcp=Tool()`; one only a page calls is `mcp=None`. Example prompts as for the MCP surface.

#### One frontend folder

`npm create @reboot-dev/ui`, then `react-scaffolding.md`, whose
`vite.config.ts` names both: `reboot({ mcpAppPath: "mcp", webAppPath:
"web", apiPath: "api" })`, and whose `build.mjs` builds every UI and
the web app. The web app inside it, `frontend/web/`, is shaped as
`react-client.md` says (its `index.html`, `src/`, the provider, the
hooks); skip that file's `npm create vite` and `vite.config.ts`. In
`.rbtrc`, both sets of lines: `--mcp-app` and `--web-app` in
development, `--mcp-app-dist-path` and `--web-app-dist-path` for
`dist` and `serve run` (`project-shell.md` has them commented in).

#### `/` is the web app

With a web app served, Reboot serves it at `/` and does not mount its
own root page, so **there is no setup wizard**. The MCP App is
reached at `/mcp`: the handoff gives the web app's URL and the MCP
App's connector, the `run` skill's tunnel command for the user to run
with the steps to add its address (the dashboard skill's Step 6, in
one section with the dashboard's, the app's first), plus a first
prompt; never the wizard. The build starts no tunnel.

#### Proving it

Each feature's backend scenarios, its browser scenario when it has a
page (**Web**), and its tools through its methods (**MCP**).

#### Pop-out

A UI that should open the same entity in the web app: a deep link
built from the hook's `state_id`, opened with the host's `openLink`
(`pop-out-to-web-app.md`).

## A. Design

The features come first, agreed in English, then the model they need;
getting entities, field types or method types wrong means
regenerating across the project, so both are settled before any code.
Two messages, each ending with one question:

1. **The features, in English**, as feature's Step 1 has them: each
   one's name (an activity), what it is for, its rules (only real
   invariants), a few example situations, and **its surfaces** (Web,
   its **view and gesture**, `visual-interactive.md`: a board to drag
   tiles across, a timeline to drag bars along; MCP, its tools and a
   `UI()`), in the **order they build on** (the one the
   others need first). Short: what a person does and why, no types,
   no methods. Then ask "Are these the features to build?", with
   four options, each ending with **a range** for how long it takes
   to build, not counting time waiting on the user: **8–15 minutes
   for the foundation, whatever the scope, plus 3–8 a feature with a
   web app alone, 2–5 with an MCP App alone, 4–10 with both**, rounded
   out to whole five minutes. Both frontends: the first feature only,
   10–25 minutes; the middle scope's two, 15–35; four, 20–55; six,
   30–75. A range, never one number: builds of the same scope vary
   (the middle scope with both frontends took 17–20 minutes in three
   headless builds, and a session with permission prompts takes
   longer). Never a range that makes a smaller scope slower than a
   larger one. The middle scope is the default, first and recommended:
   - **Between a core MVP and all features (Recommended)**, always this
     label: **two features, three or four scenarios each**, picked from the list (or
     cut down from one) to show what Reboot does that other stacks make
     hard, naming which feature shows which:
     - **a transaction across states**: one action that changes two
       things or neither (moving stock between two warehouses takes it from one and adds it to the other, or does neither);
     - **live updates**: a change one person makes shows at once on
       another's open page, no reload (proved by a browser scenario
       with two users, as `testing-web-app.md` has it);
     - **durable work**: a `Workflow` or a `schedule()`d task that
       carries on after the request (closing an order schedules its invoice; a hold that lapses after its time).
     Each of the three is in one of the two features; the scenarios
     are those three and the feature's main flow, not its edge cases.
     The page map is the two features' pages only, inside the shell.
   - **Trim to a core MVP**, always this label, naming what the core
     keeps and what comes later.
   - **Build all the features**, in a few words ("All 6. 30–75 minutes.").
   - **Build the first feature only**, always this label, naming it;
     left out when the core MVP is already one feature.

   With the middle scope, **C1 writes three or four scenarios a feature,
   no more**: a rule the feature has that is not among them is
   enforced in the servicer, and offered as scenarios at the handoff.

   An answer of their own is the change to make before going on. The
   features a smaller scope leaves out are offered at the handoff.
2. **Write them down at once**: every agreed feature's file, `@wip`
   (feature's Step 2: name, description, rules, no scenarios yet), and
   tagged with its own name above `Feature:` (`@room_inventory` on
   `room_inventory.feature`): that tag is how its turn in the loop
   runs only its own scenarios.

   **Not the dashboard yet**: until the API declares a state type
   (B3), every page of it, Features included, shows only "Waiting for
   your API". It starts at B4, once there is something to view.
3. **The design those features need**, by the assessment below: the
   types and their fields, each collection's shape, the method map
   (which method, which kind, which feature uses it, and **who calls
   it**: a person, through a page; an AI chat client, as an MCP tool;
   the chat client showing the person something, through a `UI()`;
   or both a page and a tool), `User`
   and how people sign in, auth; and the
   surface's own part (Web, **the app's page map**, below, and the
   methods each page calls; MCP,
   the tool surface, each `UI()` and where it sits, about three example
   prompts); Web, **the look** for structure (one from the looks'
   index) and **the app's palette** for identity (from the prompt's
   words and the domain's statuses), each named with one clause of
   why (`visual-interactive.md`, "The look"). Then ask "Build this design?", with two options
   and no others: **Build it** and **Change something**. "Change
   something" asks what to change, in plain text; the change is made and
   the design shown again with the same question. An alternative the
   design weighed goes in the design's text, not in the options.

### The page map (Web)

Pages are the app's, not a feature's: a person moves between them,
and the pages that join features are the ones that make it a product.
The design lists every route, and for each the feature that first
builds it:

- **The app shell** around every page (`visual-interactive.md`, "The
  app shell"): the masthead with the brand, the navigation of the
  top-level pages below, and the app's **working context** (a business date, a store, a team's week) that every page reads.
- **A home page that answers the app's one question** for the person
  who opens it first (a team lead: "what needs attention today?"): a few figures that matter large (open, due today, overdue, done this week), the one breakdown behind them (open by project),
  and what needs doing now, each item linking to where it is done.
  The design states the question in one line. The first feature
  builds the page with its part; each later feature adds its part.
- **For each kind of thing a person finds again** (a task, a project, a person): **a list** that searches and filters, and **a detail page**
  at its own URL (`/projects/:id`) that shows everything about it,
  including what other features attach (a project's tasks, a task's comments), with its actions. The feature that introduces the thing
  builds both; later features add their sections to its detail page.
- **Each creation as a flow**: a form or a short sequence with
  validation, at its own URL (`/tasks/new`) or a dialog,
  reachable from the list and from the home page.
- **Links wherever a thing is named**: a person's name on a task opens the person; a project's name opens the project.

A feature's view (a board, a timeline) is one of these pages or a
section of one, not the whole of what the feature builds.

An answer already given ("build the design as proposed") answers
both questions: send both messages and go on. A question that comes
back with no choice (nobody there, or the dialog was not delivered)
takes its first option: say so in one line and go on.

### Writing the design for a human reader

The reader has not read these skills and is judging the design, not
checking the skill was followed. Give **what and why** for every
choice: the concrete structure and a one-clause reason in the
domain's terms ("grows without bound, so it is paged"; "no life of its own, so it lives inline on the task"). Never skill-internal
terms: no "Shape A/B/C", no "non-state `Model`", no "Gotcha #N", no
reference filenames. A type name is fine when it is the decision
("an `OrderedMap`, not a list"), with its reason in the same sentence.

## State Model Assessment

1. **Decompose aggressively.** Every entity a person adds, edits,
   lists or finds over time (tasks, projects, people, comments, documents) is its own `Type` with its own state, even when there
   are few of each. Packing them into a parent as `list[Task]`
   flattens many actors into one, blocks per-entity methods and auth,
   and is a rewrite when it grows. So is a collection synced or
   scraped from elsewhere (a mailbox, a repo's issues). Signals in
   `python/state-collections.md` Step 1.
2. **Each collection's shape.** A parent stores references, not
   objects: `list[Sub]` of inline sub-records only for bounded parts
   with no identity (line items, tags); `list[str]` of IDs for a
   bounded collection always read whole; an `OrderedMap` of IDs for one
   that grows without bound or is paged. **Boundedness is a fact of
   the domain:** a size cap added to make a list "bounded" means it is
   not; externally synced collections are always an `OrderedMap`.
3. **One concern per type.** When a type gathers unrelated concerns
   (session, persona, a background engine), split each into its own
   type referenced by ID; writers on one actor serialize.
4. **`User`, always**, in every design. It is the app's `main()`: the
   first time someone signs in (OAuth, on either frontend) Reboot
   creates their `User`, one per identity, and it creates and finds
   the rest; the web app's sign-in gate (`useUser()`) needs it too.
   Say how people sign in: OAuth for both frontends, or a bearer
   token verified on each call, where the app makes the `User`
   itself.
5. **Fields**: each with `Field(tag=N, description=...)`. A nested
   `Model` owned 1:1 is `Optional[X] = Field(tag=N, default=None)`,
   filled in the factory `create`.
6. **Methods**: `Reader` reads; `Writer` changes one state;
   `Transaction` changes several atomically (and creates through
   `User`); `Workflow` runs long, loops, schedules, calls a model or an
   external API.
7. **Surfaces per feature**, and for MCP each `UI()` on the type it is
   about.

### When decomposition fights the UI

A page or a UI reads most easily from one subscription, which
pressures a model into one actor holding a list. **The model wins.**
Keep the entities decomposed and add a **composing reader** on the
parent: a `Reader` that pages the `OrderedMap` for IDs, reads each
item, and returns a page of whole items and a cursor; the page or UI
subscribes to that one reader (`react-app-tsx.md`, "Reading Across
Many Actors").

## B. Foundation (once)

**All commands run from the application directory.** The feature
files exist already (A2).

1. **`AGENTS.md` and `CLAUDE.md` first**, before any other file of the
   foundation, with
   the [`agents-md` skill](../agents-md/SKILL.md), naming the files the
   design settled on, and with a **Decisions** section: every answer
   the user has given so far, one line each, in their words (the frontends, the scope and what it leaves out, the design approved and any
   change asked for). **A later answer goes in the moment it is
   given.** Asked what was picked, answer from it, plainly ("We picked
   the middle scope"), never "it looks like". Then the project shell: `.python-version`,
   `pyproject.toml`, `.rbtrc` (with `generate --react=frontend/api` and
   the surface's lines), `.mypy.ini`, `pytest.ini`. **`<project-name>`
   is the project folder's name** (`~/projects/tracker-7` → `tracker-7`), never the domain's (`tracker`), wherever the shell
   files and the frontend's `package.json` name it: the app's
   `https://<project-name>.localhost`, its dashboard's, and its
   persisted state are all keyed on it, and a second app with the
   same name on the machine collides with it. Web: `DESIGN.md`,
   the chosen look, beside `AGENTS.md` (`visual-interactive.md`, "The
   look").
2. `uv sync`.
3. **The whole API**, as the design has it (one declaration; the model
   stays one decision): every property with a `description=`; every
   method with `mcp=` (Web: `mcp=None` on all). Then `uv run rbt
   generate`. Do not read what it wrote: the signature each servicer
   method must have is in `python/api-methods.md` ("The Servicer
   Signature Each Declaration Obliges").
4. **The developer dashboard**, now that it has an API to show:
   load the [`dashboard` skill](../dashboard/SKILL.md) and follow it,
   starting it detached as the run skill's Step 5 starts every
   long-lived process. **In the Claude desktop app it opens in the
   built-in browser**, as that skill's Steps 4–5 say: `BROWSER=true`
   in front of every `uv run rbt dashboard` this build runs, restarts
   included, and `<dashboard>/#/features` opened in the pane with
   `preview_start`, once per address. If it fails to come up, say so
   in one sentence and keep building. Then one message: its models,
   `<dashboard>/#/models`, and **a live link to each
   feature**, one line each, its name as the link text:
   `<dashboard>/#/features/tests/<file>.feature` (`<dashboard>` is
   `https://dashboard-<app>.localhost` under portless, else
   `http://localhost:9871`; the `#` is required, a path without it is
   a 404). Each feature shows its rules now, and its scenarios,
   methods and recordings as the build adds them.
5. **Every servicer, registered, with its `authorizer()`** (rules from
   day one; never `allow()` for app state). **Constructors are written
   for real now**, and so is every method `main.py`'s `initialize`
   (or the seed data) calls: a stub there makes the app's start-up
   retry forever, and every scenario hangs instead of failing. Every
   other method's body is `raise NotImplementedError("<feature>")`
   until the backend pass (C2), **however small or obvious the method
   is**: a method written now passes its scenarios before they have
   ever failed, and the red run (C1) proves nothing. `main.py` lists them all (MCP: and
   `example_prompts=`).
6. **The test module**, `tests/<app>_test.py`: the `application`
   fixture with the real servicers and identity wired for tests
   (`python/testing-harness.md`, "Identity Wiring in Tests"), and
   `scenarios(...)` over every feature file. Web: the gesture steps in
   `tests/conftest.py`, as `visual-interactive.md` writes them. Each
   feature file's own
   tag (A2) goes under `markers =` in `pytest.ini`, one line each, so
   pytest knows it.
7. **The frontend shell, and nothing else**: the scaffold the
   frontend names, run where it says: `npm create @reboot-dev/ui`
   (MCP, Both) **in the project**, after `rbt generate`, since it reads
   the generated `frontend/api/**/*_rbt_ui.json`; Web alone's `npm
   create vite` in a fresh `"$(mktemp -d)"`, its files copied in from
   there, since a scratch folder left in the project cannot be deleted
   (deleting it is refused); `cd frontend && npm install`, `uv run rbt
   generate` again (the React bindings need `node_modules`); Web, the
   provider, sign-in and sign-out, an empty navigation, and
   the look's `tokens.css` and the app's `palette.css` imported first; MCP, the
   `build.mjs` and config. Web: **the app shell** (`visual-interactive.md`, "The app shell":
   masthead, navigation, working context, the sign-in screen) and the
   router, with the page map's routes
   (A3) declared. **No page body, no `UI()`, no placeholder for a
   feature**: every page is built in the frontend pass (C3). `npm run build`. Web:
   `uv run playwright install chromium`.

## C. The Build, in Four Passes

The whole app, a layer at a time: every feature's scenarios, then the
whole backend, then the whole frontend, then the browser scenarios.
Each pass is one piece of work and, at most, a test run or two, not
one per feature.

**Every test run is bounded and logged**: `mkdir -p .rbt; uv run
pytest … > .rbt/test.log 2>&1; tail -40 .rbt/test.log`, with the tool
call's own timeout at five minutes (300000 ms). A run that prints
nothing past collection is hung, not slow: the app's start-up is
retrying, almost always a stub `initialize` calls (B5). Read the
log's errors; never wait out another run. One scenario while
debugging is `-k <words_of_its_name>` with underscores (a `-k` with
spaces is an error); one feature is `-m <its tag>`.

1. **Every feature's scenarios, then one red run.** For each feature,
   its example situations as scenarios in the built-in steps, under
   the rules they illustrate; move `@wip` from the feature onto them.
   Every step names who calls; a signed-in user is `"alice" is an
   authenticated user`, which runs the real authorizers (never
   subclass a servicer to weaken one). Let factories make ids up.
   **A thing the seed data or `initialize` creates is named as it
   creates it**: read that code for the real ids first (the projects it names, the tasks it numbers), never invent one that only looks right ("Task 512" when it creates 40). Copy each step's
   wording from the step tables in `python/testing-features.md`; never
   compose one (a step that waits, `eventually …`, is a `Then`; a
   `containing` value is in backticks). **No browser scenarios yet**:
   they come in pass 4, against pages that exist.

   Then `uv run pytest` once, without `-x`: **every scenario fails**,
   each against a stub. That is the check that each one tests
   something. One that passes against the stubs proves nothing: fix
   the scenario (it asserts too little, or names the wrong thing)
   before going on.
2. **The whole backend.** Every servicer method, **written whole, not
   just enough to pass**: every rule in the feature files enforced
   with a typed error a page can show (a due date before the start, a task already assigned, a person with no name), the
   readers the page map's pages need (search, filter, the composing
   reader a detail page subscribes to), and the edge cases the rules
   imply. Then `uv run pytest` and `uv run mypy backend/ tests/` until
   both are green. A scenario the app cannot pass yet is `@blocked`
   with its reason, never deleted or weakened. A change the API needs
   goes back through the model: change the declaration, `rbt
   generate`, and say so in one line.

   **No sample data yet**: the app opens empty, and sample data is
   offered at the handoff (D5), never added unasked. `main.py`'s
   `initialize` creates only what the app needs to work (the records
   the rest hang on), in a function of its own, `open_<app>`, which the
   test module's `application` calls too.

   One line to the user: the backend is done, N scenarios passing,
   and the dashboard's Features page, where every feature shows them.
   Then **start the app** with the [`run` skill](../run/SKILL.md),
   **quietly**: no address given, no page or wizard opened, only "the
   app is running" in that line, since it has no pages yet. `rbt dev
   run --watch` reloads it as pages land. Do not restart it.
3. **The whole frontend**, from the page map (A3): the home page,
   each list and detail page, each creation flow with validation shown
   inline, the links wherever a thing is named, the navigation. Each
   feature's view (`visual-interactive.md`) is one of those pages or a
   section of one, with every action reachable by a button or a menu,
   and a gesture (a drag, a hover card) added where it makes the action
   faster. Live as others change it, in the look's tokens only;
   accessible markup from the start. MCP: each `UI()` and the example
   prompts. `npm run build` once at the end of the pass, and its
   errors fixed. Then **show the app**: the run skill's Step 6
   hand-off, in one line, so the user can open it while the browser
   scenarios are written.
4. **The browser scenarios** (Web). For each feature, one that walks
   its main flow **by clicking** (open the list, open a thing's detail
   page, create one through its flow, act on it) and asserts what the
   pages and the backend show; a gesture gets a scenario of its own
   only when it is the feature's main way of acting (a board's drag). Step wording from `python/testing-web-app.md`. Run
   them together, `-x` on the first run (a failing browser scenario
   otherwise waits out every timeout). **Two fixes, then move on**: a
   scenario that still fails after two changes aimed at it is
   `@blocked` with what was seen ("the drop on the Done lane never lands; the task stays where it was"). A gesture a browser driver
   cannot perform is a question for the user, not for a third guess;
   never change the look or the layout (a sticky header, a z-index)
   only to make a scenario pass. MCP: no browser pass; its scenarios
   already call the methods its tools are, and none opens a `UI()`
   (**MCP**, Proving it).

`@wip` stays on every scenario: only the user takes it off.

## D. Close

1. The whole suite, `uv run pytest`, and `uv run mypy backend/ tests/`;
   fix every failure and error, so a change pass 3 or 4 made to the
   backend shows here. `npm run build` once more.
2. `AGENTS.md` brought up to date (the `agents-md` skill): files,
   commands, rules the build taught.
3. Confirm with the `run` skill that every process is up (start it
   now if the backend pass did not).
4. **The design review** (Web, and the web app of Both). Read the screenshots the browser scenarios recorded
   (`tests/*.recordings/**/*.png`, the Read tool, a feature's in
   parallel in one turn). Every page of the page map (A3) is in them;
   a page no scenario reaches gets a browser scenario that opens it,
   with something in it, and sees its heading. Each page passes when:
   - **it is the approved design**: the page map's page, inside the
     shell (masthead, nav, the working context), in the chosen look
     and the app's palette, **in both themes**: the scenario that
     reaches the home page opens it a second time in the look's other
     mode (`opens the web app in dark mode`, or `light` for a dark
     look), so a screenshot of each theme is there to read;
   - **it is styled, all of it**: no browser defaults (a grey bevelled
     button, a serif face, an underlined blue link, an unstyled
     select), nothing outside the look's tokens;
   - **nothing is broken**: no overlap, clipped or wrapped-to-pieces
     text, table running off the page, raw id or ISO timestamp where a
     name or a date belongs, empty state that says nothing, loading
     line that never goes, error shown as a stack or a JSON blob;
   - **it reads as one app** with the other pages: the same spacing,
     type sizes, buttons, tables and status colours.

   What fails is fixed in the page, in the look's tokens (never by
   changing a scenario's assertions), then the browser scenarios run
   again and their new screenshots are read. **Two rounds**: what is
   still off after the second is named in the handoff, page by page.
   MCP alone: no review; the wizard is the plugin's, not the app's.
5. **The handoff**, one message, with the design review's result in a
   line (passed; or what is still off):
   - the features built, each with its scenarios passing, its live
     dashboard link (B4), and where each is seen (its frontend's
     Handoff, under The Frontends: a page; the wizard and
     a first prompt; or for Both the web app and the `/mcp` address);
   - the dashboard's Features page, and the recordings for Web;
   - `@wip` on every feature, and the question whether to take it off
     (the feature skill's Step 5), with the features to try first;
   - the features a smaller scope left out, offered as the next build;
   - **sample data, offered**, last, as a question: "Add sample
     data?", with **Add sample data** (so every page has something in
     it to try) and **Leave it empty**. On "Add", `backend/src/seed.py`,
     through the real methods, with fixed ids (`seed-1`) so a restart
     is a no-op: enough that every page in the page map and every
     state it shows has something in it (things in every status a
     page shows, dates around today, one thing that needs doing now,
     named when it is done), with real-sounding names. `initialize`
     calls `open_<app>`, then `seed`; the test module's `application`
     still calls `open_<app>` only, so no scenario sees the sample
     data. Then the suite once more, and one line naming what was
     added and where to see it;
   - the dashboard skill's Step 6 hand-over (the tunnel command and
     the Claude and ChatGPT connector instructions), required whenever
     the dashboard was started.

After the handoff the feature skill's Step 4 conversation goes on,
feature by feature, with the user; a feature added later is built
with the `feature` skill, one at a time.

## Update Flow

When changing an existing app:

1. Read `AGENTS.md`, `.rbtrc`, the API, the servicers, `main.py`, and
   the surface's entry (`frontend/web/src/App.tsx`, the UIs under
   `frontend/mcp/`).
2. If the app has persisted state or is deployed, read
   `python/api-schema-evolution.md` before changing the API.
3. Read feature's [`SKILL.md`](../feature/SKILL.md) for the changed or new
   feature: its Step 1 (agree in English), its Step 2 (the file,
   `@wip`).
4. The API change, `rbt generate`, stubs; then C for that feature
   alone. MCP: its example prompt when it adds a user-facing flow.
5. D's first two steps, and D4's review of the pages it changed;
   ask before taking `@wip` off. An app already
   running under `rbt dev run` reloads on its own; otherwise the
   `run` skill.

## Project Layout

```
<project>/
├── .python-version, .rbtrc, .mypy.ini, pytest.ini, pyproject.toml
├── AGENTS.md, CLAUDE.md
├── DESIGN.md                       # Web: the look, its tokens
├── api/<pkg>/v1/<name>.py          # the API, every feature's methods
├── backend/src/
│   ├── main.py
│   ├── example_prompts.py          # MCP
│   └── servicers/<name>.py
├── tests/
│   ├── <capability>.feature        # one per feature
│   ├── conftest.py                 # Web: the gesture steps
│   └── <app>_test.py               # `application` fixture + scenarios(...)
└── frontend/
    ├── package.json, vite.config.ts, tsconfig*.json
    ├── api/                        # generated React client
    ├── web/                        # Web: index.html, src/main.tsx, tokens.css, palette.css, App.tsx, pages/
    └── mcp/<ui>/                   # MCP: index.html, main.tsx, App.tsx per UI()
```
