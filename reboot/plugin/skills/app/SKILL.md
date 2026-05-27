---
name: app
description: Build a Reboot application from a user description. Routes to the chat-app skill (MCP Chat Apps for ChatGPT, Claude, VSCode, Goose) or the web-app skill (standalone web apps with a browser frontend). Commits to a route only when the prompt verbatim names the front-door (MCP/Claude/ChatGPT for chat-app; a URL/SPA/"website" for web-app); otherwise asks the user. Does NOT infer the front-door from the app's domain (CRM, todo, dashboard, blog, …) — those describe what the app does, not where it lives.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# app — Build a Reboot Application

Decide which kind of Reboot application the user wants to build and
defer to the matching skill.

## Routing

> **Default: ASK.** The wrong guess costs ~12 files of regeneration,
> so commit only when the description **names** the front-door
> verbatim. Do not infer the front-door from the app's _domain_
> (CRM, blog, store, dashboard, todo, chat room, journal, …) —
> domain words describe what the app **does**, not **where** it's
> used. A "CRM" can equally be a website or an MCP tool exposed to
> Claude; "chat room" likewise. When in doubt, ask.

### The two destinations

- **`chat-app`** — an MCP Chat App: the app is exposed through an
  MCP host (ChatGPT, Claude, VSCode, Goose, etc.) via MCP tools, and
  any visual UI is embedded into the host through MCP UI artifacts.
- **`web-app`** — a standalone web app: the app is served at a URL
  and used in a normal browser, with the Reboot backend behind a
  React (or similar) frontend.

### Commit-without-asking triggers (must be VERBATIM in the prompt)

Commit immediately **only** when the user's prompt contains one of
the explicit phrases below. No inference, no synonyms, no "well
they probably mean…":

**Commit to `chat-app` if the prompt contains any of:**

- `MCP`, `MCP host`, `MCP server`, `MCP app`, `MCP tool`, `mcp=Tool`,
  `UI()` (as a Reboot method type).
- `ChatGPT`, `Claude`, `VSCode`, `Goose`, `Cursor`, or
  "Anthropic / OpenAI" **named as the runtime** — e.g. "I want to
  use this from Claude", "expose it as a tool to ChatGPT". Just
  mentioning the company (e.g. "like ChatGPT") doesn't count.
- "chat app", "AI tool", "tool for an LLM/agent", "expose to an
  LLM/agent".

**Commit to `web-app` if the prompt contains any of:**

- A URL or scheme: `https://…`, `localhost:`, `example.com`.
- An explicit route/page literal: `/login`, `/dashboard`, `/home`,
  `/admin`, etc.
- "website", "web app", "web site", "SPA", "single-page app", "in
  the browser", "served at <url>".
- A standard browser-auth phrase: "log in via email", "OAuth login",
  "cookie session", "sign up form".

**Commit to neither (say "Both, not supported") only if the prompt
contains an explicit conjunction:** e.g. "and also a website",
"MCP server **plus** a dashboard", "expose it to Claude **and** host
it on the web".

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
  "URL" — `chat-app`s also have a UI (rendered in the MCP host).
- An overall vibe of "this sounds like a SaaS / CRM / dashboard."

If the only signal you have is "this sounds web-y" or "this sounds
chat-y", **ask**.

### Decision flow

1. **Verbatim chat-app trigger present** → say one sentence
   ("Building this as a Reboot Chat App."), then load the
   [`chat-app` skill](../chat-app/SKILL.md) and follow it from the
   top, with the user's description as input.
2. **Verbatim web-app trigger present** → say one sentence
   ("Building this as a Reboot Web App."), then load the
   [`web-app` skill](../web-app/SKILL.md) and follow it from the
   top, with the user's description as input.
3. **Both triggers present, or explicit "I want both"** → respond
   with **exactly** this message and stop:

   > Combined MCP Chat App + standalone Web App is not supported yet —
   > please stay tuned! For now, pick one to start:
   >
   > - **MCP Chat App** — for ChatGPT, Claude, VSCode, Goose, etc.
   >   (the chat-app skill).
   > - **Standalone Web App** — a browser web app (the web-app skill).
   >
   > If you want both, build the MCP Chat App first; the web frontend
   > scaffolding overlaps and we'll have a combined path soon.

4. **Otherwise (default)** → **ask the user** the question below
   (present the options and wait for their answer). This is
   **mandatory, not optional**.

   ```
   Question: "Before I scaffold — which kind of app are you building?"
   Header:   "App type"
   Options:
     - "Chat App" — exposed through an MCP host (ChatGPT, Claude,
       VSCode, Goose, …) via MCP tools; optional embedded UI.
     - "Web App"  — a standalone website / SPA users open in a
       normal browser.
     - "Both"     — not supported yet, but I can tell you what's
       coming.
   ```

   Then route on the answer per steps 1–3.

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
   > 3. The user has not waived their right to choose between
   >    `chat-app` and `web-app`. Silence on the topic is silence,
   >    not a delegation.
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
   > verbatim trigger from the user's prompt. If you find yourself
   > drafting a reply that begins "I'll build this as a …" without
   > having matched a verbatim trigger or received the user's
   > answer, **stop and ask the user**.

### Worked examples

| Prompt fragment                                                          | Decision                 | Why                                                          |
| ------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------ |
| "a CRM for my personal relationships, with notes and a timeline"         | **ASK**                  | CRM is a domain word, not a front-door. No verbatim trigger. |
| "a todo list app"                                                        | **ASK**                  | "app" alone is not a trigger.                                |
| "a dashboard for our team's metrics, served at metrics.example.com"      | `web-app`                | Explicit URL.                                                |
| "a tool I can use from Claude to track my reading list"                  | `chat-app`               | "from Claude" names the runtime; "tool" + LLM context.       |
| "a website where users can sign up and create journals"                  | `web-app`                | "website" is a verbatim trigger.                             |
| "a kanban board with login"                                              | **ASK**                  | "login" alone is not enough — chat-apps also have auth.      |
| "expose a CRM as an MCP server, and also a dashboard at crm.example.com" | Both — say not supported | Explicit conjunction.                                        |

## Note

Both `chat-app` and `web-app` layer on top of the [`python`
skill](../python/SKILL.md) for Reboot backend mechanics. You don't need
to load `python` here — those skills load it themselves.
