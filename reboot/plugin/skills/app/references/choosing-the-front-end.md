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

A Reboot app is full stack: one backend, the same methods and the
same live state, reached in a browser through a web app and from an
AI chat client (Claude, ChatGPT) through an MCP App, added there as a
connector. The front ends are only what sits on top:

- **Both** (the default) — one backend, one sign-in, a web app and an
  MCP App: its tools, and a `UI()` where the chat client shows the
  person something. A user who signs in on one front end is
  signed in on both: the OAuth server's `/authorize` short-circuits when
  the browser already carries a session cookie, and `/callback` sets
  that cookie on every flow.
- **Web** — the web app alone.
- **MCP** — the MCP App alone.

## Settle the front end

**Both is the default**: the MCP App costs little on top of the web
app, since its tools are the backend's methods. Ask once, unless the
prompt already settles it:

- **Web alone**, no question: "just a website", "only a web app",
  "people only", "no MCP", "no AI", or an answer already in the prompt that names only
  the web ("Answers to your questions: a web app").
- **MCP alone**, no question: "just an MCP server", "only for Claude",
  "agents only",
  "no web app", "no website", or an answer in the prompt that names
  only MCP.
- **Both**, no question: an answer in the prompt that names both, or a
  conjunction ("a website and an MCP server").

Naming one frontend is not asking for it alone: "a website for my
CRM" and "a tool I can use from Claude" still get the question. Domain
words never settle it (a CRM, a booking app, "login").

Otherwise ask, whatever the session's autonomy settings, and **as
the first thing in the session**: before the plan, before reading
anything, with no more thought than it takes to pick a
recommendation.

**Say nothing about how you decided to ask.** No rule, trigger or
skill term before the question ("no verbatim trigger in your
description" means nothing to the person). At most one plain sentence
on why the answer matters, in the app's own words: "This decides
what gets built: a website, the same app inside Claude or ChatGPT, or
both." Then the question.

```
Question: "Who will use this app?"
Header:   "Users"
Options:
  - "People and agents" — a website people open in a browser, and the
    same app for AI agents like Claude or ChatGPT, which use it when
    someone asks in the chat. Same data, same sign-in.
  - "People only" — a website people open in a browser, with pages to
    view and work in. No agent access.
  - "Agents only" — a person asks an AI agent like Claude or ChatGPT,
    and the agent uses the app through its tools and panels in the
    chat. No website.
```

"People and agents" is both front ends, a web app and an MCP App;
"People only" is the web app alone; "Agents only" is the MCP App
alone.

**Mark one "(Recommended)" only when the description leans to it**,
and add why to its description in a few words, from the prompt's own:

- **People only** when the app is mostly looked at or worked in on a
  screen: a board, a calendar, a map, a dashboard, a page for the
  public, a form a stranger fills in ("a booking page for my
  clinic's patients").
- **Agents only** when the app is mostly asked and told things in a
  conversation: a lookup, a log kept by talking, actions with no
  page to work in ("ask Claude what's in my pantry").
- **People and agents** when it is both: worked in on a screen and
  asked about in a chat ("a CRM I also want to ask about my week's
  follow-ups").

**The recommended option goes first**, since the dialog pre-selects
the first option: what a person gets by pressing Enter is what the
build recommends. The other two follow in the order above. When
nothing in the description leans either way, mark none: "People and
agents" stays first, as the default, unlabelled.

A question that comes back with no choice (nobody there, or the
dialog was not delivered) takes the recommended option, or "People
and agents" when none is marked: say so in one line. The answer goes
into `AGENTS.md`'s Decisions when it is written.

Then say the plan in one sentence ("Building this with both front ends,
a web app and an MCP App for AI chat clients.") and go back to the app
skill, following it from "When to Use".

## Worked examples

| prompt | frontends | why |
| --- | --- | --- |
| "a CRM for my relationships" | ask, none marked, People and agents first | nothing leans either way |
| "a dashboard served at metrics.example.com" | ask, People only recommended and first | a URL names the web app, not the web alone; a dashboard is looked at |
| "a tool I can use from Claude to track my reading" | ask, Agents only recommended and first | Claude named, not "only"; a log kept by talking |
| "a website and an MCP server for our CRM" | Both | a conjunction |
| "just a website for my bakery, no AI" | Web | "just", "no AI" |
| "only an MCP server for our CRM, no web app" | MCP | "only", "no web app" |

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
