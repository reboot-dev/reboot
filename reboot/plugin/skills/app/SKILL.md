---
name: app
description: Build a Reboot application from a user description. Every backend is designed ready for both front doors, an MCP UI (ChatGPT, Claude, VSCode, Goose) and a standalone web app, with one `User` per identity via `oauth=...`. Builds the front door the prompt names (MCP/Claude/ChatGPT → `mcp-ui`; a URL/SPA/"website" → `web-app`; both named → both); otherwise builds the web app first without asking, and offers the other front door at handoff.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# app — Build a Reboot Application

Decide which front door to build first and defer to the matching
skill. The backend is always ready for both.

## Routing

Every app gets a backend **ready for both front doors**: a `User`
type, `oauth=...`, and for each method its role for an AI caller and a
`description=` written for one (the front-door skill's Design Phase).
A wrong first front door costs no rebuild, only the other one added
later, so routing never has to ask. What varies is which front door is
built first.

### The two destinations

- **`mcp-ui`** — an MCP UI: the app is exposed through an
  MCP host (ChatGPT, Claude, VSCode, Goose, etc.) via MCP tools, and
  any visual UI is embedded into the host through MCP UI artifacts.
- **`web-app`** — a standalone web app: the app is served at a URL
  and used in a normal browser, with the Reboot backend behind a
  React (or similar) frontend.

### Triggers (verbatim in the prompt)

A trigger is one of the phrases below, in the user's prompt. No
inference, no synonyms:

**Commit to `mcp-ui` if the prompt contains any of:**

- `MCP`, `MCP host`, `MCP server`, `MCP app`, `MCP tool`, `mcp=Tool`,
  `UI()` (as a Reboot method type).
- `ChatGPT`, `Claude`, `VSCode`, `Goose`, `Cursor`, or
  "Anthropic / OpenAI" **named as the runtime** — e.g. "I want to
  use this from Claude", "expose it as a tool to ChatGPT". Just
  mentioning the company (e.g. "like ChatGPT") doesn't count.
- "MCP UI", "AI tool", "tool for an LLM/agent", "expose to an
  LLM/agent".

**Commit to `web-app` if the prompt contains any of:**

- A URL or scheme: `https://…`, `localhost:`, `example.com`.
- An explicit route/page literal: `/login`, `/dashboard`, `/home`,
  `/admin`, etc.
- "website", "web app", "web site", "SPA", "single-page app", "in
  the browser", "served at <url>".
- A standard browser-auth phrase: "log in via email", "OAuth login",
  "cookie session", "sign up form".

**Commit to BOTH (load mcp-ui + web-app together) only if the
prompt contains an explicit conjunction:** e.g. "and also a
website", "MCP server **plus** a dashboard", "expose it to Claude
**and** host it on the web". Dual-frontend apps share one backend,
one `oauth=...`, and one `User` actor per upstream identity;
cross-frontend SSO is automatic.

### Not triggers

The word "app" alone, domain words (CRM, blog, store, dashboard, todo,
journal, kanban, tracker, chat room, …), "users", "login" or
"permissions", and "frontend" or "UI" without "browser", "website" or
"URL" are not triggers: they say what the app does, not where it is
used. A prompt with no trigger takes the default, step 3 below.

### Decision flow

1. **Both front doors named** (an explicit conjunction: "and also a
   website", "MCP server **plus** a dashboard", "expose it to Claude
   **and** host it on the web") → say one sentence ("Building this as
   a Reboot app with an MCP UI and a web app."), then load the
   [`mcp-ui` skill](../mcp-ui/SKILL.md) _and_ the
   [`web-app` skill](../web-app/SKILL.md), and follow them together.
   The backend `Application(oauth=...)` is configured once and serves
   both frontends; a single `User` actor per upstream identity is
   shared.
2. **Only an MCP UI trigger** → say one sentence ("Building this as a
   Reboot MCP UI; the backend will be ready for a web app too."), then
   load the [`mcp-ui` skill](../mcp-ui/SKILL.md) and follow it from
   the top, with the user's description as input.
3. **Only a web-app trigger, or no trigger (the default)** → say one
   sentence ("Building this as a Reboot web app; the backend will be
   ready for an MCP UI too."), then load the
   [`web-app` skill](../web-app/SKILL.md) and follow it from the top,
   with the user's description as input. Don't ask which kind of app:
   the web app is the default first front door.
4. **"Just", "only" or "no …"** ("just a website", "only an MCP
   tool", "no web UI") → build that one front door, and skip the
   offer at handoff.

**At handoff**, unless step 4 applied, offer the other front door in
one line: "Want this in Claude and ChatGPT too? The backend is ready;
it adds an MCP UI beside the web app." (or the reverse). On a yes, load
that front door's skill and follow its Update Flow.

### Worked examples

| Prompt fragment                                                          | Decision                | Why                              |
| ------------------------------------------------------------------------ | ----------------------- | -------------------------------- |
| "a CRM for my personal relationships, with notes and a timeline"         | `web-app`, offer MCP UI | No trigger: the default.         |
| "a todo list app"                                                        | `web-app`, offer MCP UI | "app" alone is not a trigger.    |
| "a dashboard for our team's metrics, served at metrics.example.com"      | `web-app`, offer MCP UI | Explicit URL.                    |
| "a tool I can use from Claude to track my reading list"                  | `mcp-ui`, offer web app | "from Claude" names the runtime. |
| "just a simple website for event signups"                                | `web-app`, no offer     | "just" scopes it to one.         |
| "expose a CRM as an MCP server, and also a dashboard at crm.example.com" | Both, load both skills  | Explicit conjunction.            |

## Note

Whichever route, each capability of the app is agreed on in plain
English and written down as a `@wip` feature file before its API
exists, per the [`feature` skill](../feature/SKILL.md); the build
flows of both routes start there.

Both `mcp-ui` and `web-app` layer on top of the [`python`
skill](../python/SKILL.md) for Reboot backend mechanics. You don't need
to load `python` here — those skills load it themselves. A
dual-frontend app loads both, but they share a single `python`
layer underneath, so reference files aren't double-loaded.
