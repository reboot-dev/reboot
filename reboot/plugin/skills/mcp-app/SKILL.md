---
name: mcp-app
description: "Build a Reboot MCP App, tools and UIs for ChatGPT, Claude, VSCode, Goose and other MCP hosts, from a description. A short name for the app skill with the frontend settled as the MCP App alone, so it asks no frontend question; the app skill and the full-stack skill do the rest. Use when asked for by name (/reboot:mcp-app); otherwise the app skill."
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# mcp-app — Build a Reboot MCP App

A short name for the [`app` skill](../app/SKILL.md) with the frontends
already settled: **the MCP App alone**. Load the `app` skill and follow it from
the top, with the user's description as input, except that its frontends are the MCP App alone: do not ask its question ("Who will use this
app?"); say in one line that this is an MCP App alone, with no web app, then load the
[`full-stack` skill](../full-stack/SKILL.md) with them. Everything
else (the features, the design, the build, the handoff) is the `app`
skill's, unchanged, and so is changing an app that exists.
