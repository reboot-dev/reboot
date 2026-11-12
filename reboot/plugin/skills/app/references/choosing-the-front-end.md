---
title: Choosing the Front End — MCP App, Web App, or Both
impact: CRITICAL
impactDescription: Which front end an app has decides its API, its servicers and every frontend file. A wrong guess costs ~12 files of regeneration, so the app skill settles it first, from the user's own words or by asking.
tags: routing, front-end, mcp-app, web-app, both, ask
---

# Choosing the Front End

The app skill reads this page first, unless the build started from
`/reboot:web-app` or `/reboot:mcp-app`. Settle the front end here, then
go back to the [app skill](../SKILL.md) and follow it from "When to
Use".

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
  `User` state type per upstream identity. A user who signs in on one
  frontend is signed in on both (cross-frontend SSO): the OAuth
  server's `/authorize` short-circuits when the browser already
  carries a session cookie, and `/callback` sets that cookie on every
  flow.

### Commit-to-frontend-without-asking triggers (must be VERBATIM in the prompt)

Commit to a front end immediately **only** when the user's prompt contains one of
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
   App, going back to the app skill and following it from "When to Use", with the user's
   description as input.
2. **Verbatim web-app trigger present** → say one sentence
   ("Building this as a Reboot Web App."), then build it as a web
   app, going back to the app skill and following it from "When to Use".
3. **Both triggers present, or explicit "I want both"** → say one
   sentence ("Building this as a dual-frontend Reboot app — both
   MCP and standalone web."), then build both front ends, going back
   to the app skill and following it from "When to Use". The backend
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
[`python/references/mcp-app-concepts.md`](../../python/references/mcp-app-concepts.md);
a web app's sign-in is
[`python/references/auth-web-apps.md`](../../python/references/auth-web-apps.md).
