---
name: agents-md
description: Give a Reboot application an `AGENTS.md`, the project's map and rules for any coding agent, and a `CLAUDE.md` that imports it. Use when creating a Reboot app (the `mcp-app` and `web-app` skills call this at their first step), when working in an existing Reboot project (one with a `.rbtrc`) that has no `AGENTS.md`, and whenever a change moves a file, changes a command, or teaches a rule the next session needs.
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# agents-md — Give Every Reboot App a Map for Coding Agents

`AGENTS.md` holds the project's map and rules; Codex and most agents
read it. `CLAUDE.md` is the one line `@AGENTS.md`, which Claude Code
imports, so both read one text. Both go in the project root, the
directory with `.rbtrc` (or the one the build is creating).

## Step 1 — `CLAUDE.md`

- **Missing:** create it with the single line `@AGENTS.md`.
- **Already `@AGENTS.md`:** leave it.
- **Holds anything else:** move it into `AGENTS.md` (under the heading
  that fits, or at the end), leave `@AGENTS.md` as the only line, and
  say in one sentence that it moved.

## Step 2 — `AGENTS.md`

If it exists, add only the sections it lacks; never rewrite what the
user wrote. Otherwise fill this template from the project's real files
(`.rbtrc` and the tree): each path as it is (`api/hotel/v1/hotel.py`),
no rows for what the project doesn't have, no placeholder left.

```markdown
# <App name>

<What the app does and who uses it, in a sentence.> A Reboot
application: durable state types in Python, with <a web app | an MCP
App | both> in front. For Reboot itself, use the Reboot plugin's
skills.

## Where things live

| What                                           | Where                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| API: state types, methods, errors (the schema) | `api/<pkg>/v1/<name>.py`                                          |
| Servicers: what each method does               | `backend/src/servicers/`                                          |
| Application: servicers, `initialize`, `oauth=` | `backend/src/main.py`                                             |
| Generated code, never edited                   | `backend/api/`, `frontend/api/`, rebuilt by `uv run rbt generate` |
| Web app                                        | `frontend/web/src/`                                               |
| MCP Apps                                       | `frontend/mcp/<name>/`                                            |
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
5. <A rule this project learned the hard way.>

When a file moves, a command changes, or a rule is learned, update
this file in the same change.
```

Leave rule 5 out until the project has a rule of its own.

## Step 3 — Keep it current

A change that moves a file, adds a state type, page or UI, changes a
command, or teaches a rule updates `AGENTS.md` in the same change (the
last step of the `mcp-app` and `web-app` Update Flows).
