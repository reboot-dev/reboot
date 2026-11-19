---
name: mcp-app
description: Build a complete Reboot MCP App for ChatGPT, Claude, VSCode, Goose, and other MCP hosts. Starts the app skill's whole build with the front end already chosen as an MCP App. Use when the user asks for an MCP App, an MCP server or tool, or something to use from Claude or ChatGPT. What is specific to MCP Apps is in the python skill (the User-type front door, MCP tool exposure, the UI() method type) and the frontend skill (the React UIs and their Vite scaffolding).
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# mcp-app — Build a Reboot MCP App

The front end is chosen: an MCP App, exposed through an MCP host
(ChatGPT, Claude, VSCode, Goose, …) via MCP tools, with any visual UI
embedded in the host.

Load the [`app` skill](../app/SKILL.md) and follow it from "When to
Use", building an MCP App, with the user's description as input. Skip
its Step 0: the front end is already settled. If the user
also wants a website beside it, build both: the app skill's
[What Each Front End Adds](../app/SKILL.md#what-each-front-end-adds)
has a column for each front end and a row for both in one `frontend/`.
