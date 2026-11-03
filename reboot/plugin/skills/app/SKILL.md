---
name: app
description: Build a full-stack Reboot application from a description: one backend with two frontends by default, a web app for people and an MCP App for agents (ChatGPT, Claude, VSCode, Goose), or just one when the prompt asks for one alone. Settles the frontends from the prompt's own words, else with one question that recommends both, then loads the full-stack skill, which designs the features, writes each down before the API, and builds them a layer at a time: every scenario, then the backend, then the frontend, then the browser scenarios. Use for any request to build or create a Reboot app (/reboot:app).
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, AskUserQuestion
---

# app — Build a Reboot Application

Settle the app's **frontends**, then load the
[`full-stack` skill](../full-stack/SKILL.md) with them and follow that skill
from the top, with the user's description as input. A Reboot app is
full stack: one backend, the same methods and the same live state,
reached by people through a web app and by agents through MCP. The
frontends are only what sits on top:

- **Both** (the default) — one backend, one sign-in, a web app for
  people and an MCP App for agents: its tools, and a `UI()` where an
  agent shows a person something.
- **Web** — the web app alone.
- **MCP** — the MCP App alone.

## Settle the frontends

**Both is the default**: a modern app is used by people and by
agents, and the MCP App costs little on top of the web app, since its
tools are the backend's methods. Ask once, with both recommended,
unless the prompt already settles it:

- **Web alone**, no question: "just a website", "only a web app", "no
  MCP", "no AI", or an answer already in the prompt that names only
  the web ("Answers to your questions: a web app").
- **MCP alone**, no question: "just an MCP server", "only for Claude",
  "no web app", "no website", or an answer in the prompt that names
  only MCP.
- **Both**, no question: an answer in the prompt that names both, or a
  conjunction ("a website and an MCP server").

Naming one frontend is not asking for it alone: "a website for my
CRM" and "a tool I can use from Claude" still get the question, with
both recommended. Domain words never decide it (a CRM, a booking app, "login").

Otherwise ask, before any file is written, whatever the session's
autonomy settings:

```
Question: "Who will use this app?"
Header:   "Users"
Options:
  - "People and agents (Recommended)" — a web app for people, and an
    MCP App so agents in Claude or ChatGPT can use it too. One
    backend, one sign-in.
  - "People only" — a web app in the browser.
  - "Agents only" — an MCP App in Claude, ChatGPT or another MCP host.
```

A question that comes back with no choice (nobody there, or the
dialog was not delivered) is both: say so in one line. The answer goes
into `AGENTS.md`'s Decisions when it is written.

Then say it in one sentence ("Building this with both frontends, a
web app for people and an MCP App for agents: every feature's tests,
then the backend, then the pages and the tools.") and load the
`full-stack` skill with the frontends.

## Worked examples

| prompt | frontends | why |
| --- | --- | --- |
| "a CRM for my relationships" | ask, both recommended | nothing settles it |
| "a dashboard served at metrics.example.com" | ask, both recommended | a URL names the web app, not the web alone |
| "a tool I can use from Claude to track my reading" | ask, both recommended | Claude named, not "only" |
| "a website and an MCP server for our CRM" | Both | a conjunction |
| "just a website for my bakery, no AI" | Web | "just", "no AI" |
| "only an MCP server for our CRM, no web app" | MCP | "only", "no web app" |
