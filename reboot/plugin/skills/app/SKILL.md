---
name: app
description: Build a full-stack Reboot application from a description: one backend with two frontends by default, a web app in the browser and an MCP App used from an AI chat client (Claude, ChatGPT, VSCode, Goose), or just one. Settles the frontends from the prompt's own words, else with one question on how the app will be accessed, then loads the full-stack skill, which designs the features, writes each down before the API, and builds them a layer at a time: every scenario, then the backend, then the frontend, then the browser scenarios. Use for any request to build or create a Reboot app (/reboot:app).
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, AskUserQuestion
---

# app — Build a Reboot Application

Settle the app's **frontends**, then load the
[`full-stack` skill](../full-stack/SKILL.md) with them and follow that skill
from the top, with the user's description as input. A Reboot app is
full stack: one backend, the same methods and the same live state,
reached in a browser through a web app and from an AI chat client
(Claude, ChatGPT) through an MCP App, added there as a connector. The
frontends are only what sits on top:

- **Both** (the default) — one backend, one sign-in, a web app and an
  MCP App: its tools, and a `UI()` where the chat client shows the
  person something.
- **Web** — the web app alone.
- **MCP** — the MCP App alone.

## Settle the frontends

**Both is the default**: the MCP App costs little on top of the web
app, since its tools are the backend's methods. Ask once, unless the
prompt already settles it:

- **Web alone**, no question: "just a website", "only a web app", "no
  MCP", "no AI", or an answer already in the prompt that names only
  the web ("Answers to your questions: a web app").
- **MCP alone**, no question: "just an MCP server", "only for Claude",
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

```
Question: "How will this app be accessed?"
Header:   "Access"
Options:
  - "Web app and MCP client" — a website people open in a browser,
    and the same app inside Claude or ChatGPT, where they ask for
    things in the chat. Both use the same data and the same sign-in.
  - "Web app only" — a website people open in a browser, with pages
    to view and work in. Nothing in a chat client.
  - "MCP client only" — the app lives inside an AI chat client such
    as Claude or ChatGPT. People ask in the chat, and it answers with
    actions and its own panels. No website.
```

The options stay in this order: both first, as the default. **Mark
one "(Recommended)" only when the description leans to it**, and add
why to its description in a few words, from the prompt's own:

- **Web app only** when the app is mostly looked at or worked in on a
  screen: a board, a calendar, a map, a dashboard, a page for the
  public, a form a stranger fills in ("a booking page for my
  clinic's patients").
- **MCP client only** when the app is mostly asked and told things in
  a conversation: a lookup, a log kept by talking, actions with no
  page to work in ("ask Claude what's in my pantry").
- **Web app and MCP client** when it is both: worked in on a screen
  and asked about in a chat ("a CRM I also want to ask about
  my week's follow-ups").

When nothing in the description leans either way, mark none: both
stays first as the default, unlabelled.

A question that comes back with no choice (nobody there, or the
dialog was not delivered) is both: say so in one line. The answer goes
into `AGENTS.md`'s Decisions when it is written.

Then the plan, and say it in one sentence ("Building this with both frontends, a
web app and an MCP App for AI chat clients: every feature's tests,
then the backend, then the pages and the tools.") and load the
`full-stack` skill with the frontends.

## Worked examples

| prompt | frontends | why |
| --- | --- | --- |
| "a CRM for my relationships" | ask, none marked | nothing leans either way |
| "a dashboard served at metrics.example.com" | ask, Web app only recommended | a URL names the web app, not the web alone; a dashboard is looked at |
| "a tool I can use from Claude to track my reading" | ask, MCP client only recommended | Claude named, not "only"; a log kept by talking |
| "a website and an MCP server for our CRM" | Both | a conjunction |
| "just a website for my bakery, no AI" | Web | "just", "no AI" |
| "only an MCP server for our CRM, no web app" | MCP | "only", "no web app" |
