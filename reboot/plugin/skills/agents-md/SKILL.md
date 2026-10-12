---
name: agents-md
description: Give a Reboot application an `AGENTS.md`, the project's map and rules for any coding agent, and a `CLAUDE.md` that imports it. Use when creating a Reboot app (the `mcp-ui` and `web-app` skills call this at their first step), when working in an existing Reboot project (one with a `.rbtrc`) that has no `AGENTS.md`, and whenever a change moves a file, changes a command, or teaches a rule the next session needs.
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# agents-md — Give Every Reboot App a Map for Coding Agents

A coding agent starts every session knowing nothing about the
project: where the API is, how to regenerate code, how to run the
tests, which mistakes this project has already made. Without a map it
spends the start of each session rediscovering them, or guesses.

Two files carry the map, and they hold one text:

- **`AGENTS.md`** holds it. Codex and most other agents read this file.
- **`CLAUDE.md`** is exactly one line, `@AGENTS.md`. Claude Code reads
  `CLAUDE.md` and imports the file the line names, so both agents read
  the same text and the two can't drift apart.

## Step 1 — Locate the project

The project root is the directory with `.rbtrc`, or the directory the
build is creating. Both files go there.

## Step 2 — `CLAUDE.md`

- **Missing:** create it with the single line `@AGENTS.md`.
- **Already `@AGENTS.md`:** leave it.
- **Holds anything else:** move that content into `AGENTS.md`, under
  the heading that fits or at the end, then leave `@AGENTS.md` as the
  only line. Tell the user in one sentence that it moved.

## Step 3 — `AGENTS.md`

If it exists, add only the sections below it lacks, and never rewrite
what the user wrote. Otherwise write it from this template, filled from
the project's real files: read `.rbtrc` and list the tree, name each
path as it is (`api/hotel/v1/hotel.py`, not `api/<pkg>/...`), drop rows
for what the project doesn't have, and leave no placeholder behind.

```markdown
# <App name>

<One or two sentences: what the app does and who uses it.> It is a
Reboot application: Python state types with durable state, and
<a web app | an MCP UI | a web app and an MCP UI> in front of them. For
anything about Reboot itself, use the Reboot plugin's skills; this file
says where things are in this project and what it has learned.

## Where things live

| What                                           | Where                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| API: state types, methods, errors (the schema) | `api/<pkg>/v1/<name>.py`                                          |
| Servicers: what each method does               | `backend/src/servicers/`                                          |
| Application: servicers, `initialize`, `oauth=` | `backend/src/main.py`                                             |
| Generated code, never edited                   | `backend/api/`, `frontend/api/`, rebuilt by `uv run rbt generate` |
| Web app                                        | `frontend/web/src/`                                               |
| MCP UIs                                        | `frontend/mcp/<ui>/`                                              |
| Feature files: what the app must do            | `tests/*.feature`                                                 |
| Test modules                                   | `tests/*_test.py`                                                 |
| `rbt` settings, one per line, not YAML         | `.rbtrc`                                                          |

## Commands

- **Generate** after any change under `api/`: `uv run rbt generate`.
- **Run:** the Reboot plugin's `run` skill, which starts every process
  the app needs. Not a bare `rbt dev run`.
- **Test:** `uv run pytest`, then `uv run mypy backend/ tests/`.
- **Deploy:** the Reboot plugin's `deploy` skill.

## Rules

1. A feature starts as a `@wip` feature file agreed in plain English,
   before the API or the code changes.
2. Once the app has persisted state or is deployed, the API only grows:
   add fields, methods and types, and never remove or rename one. See
   the `python` skill's `references/api-schema-evolution.md`.
3. Run `uv run rbt generate` after every API change, and never edit
   generated code.
4. Every servicer has a real `authorizer()`. `allow()` makes a method
   public, in production too.
5. <Each rule this project learns the hard way, added the day it is
   learned.>

## Keeping this file current

When a file moves, a command changes, or a rule is learned the hard
way, change this file in the same change.
```

Rule 5 is the one place the template leaves open: delete it until the
project has a rule of its own, then replace it with that rule.

## Step 4 — Keep it current

Every later change that moves a file, adds a state type, a page or a
UI, changes a command, or teaches a rule updates `AGENTS.md` in the
same change. The `mcp-ui` and `web-app` Update Flows end with this
step.
