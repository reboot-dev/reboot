---
name: web-app
description: "Build a Reboot web app, a browser frontend alone on a Reboot backend, from a description. A short name for the app skill with the frontend settled as the web app alone, so it asks no frontend question; the app skill and the full-stack skill do the rest. Use when asked for by name (/reboot:web-app); otherwise the app skill."
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# web-app — Build a Reboot Web App

A short name for the [`app` skill](../app/SKILL.md) with the frontends
already settled: **the web app alone**. Load the `app` skill and follow it from
the top, with the user's description as input, except that its frontends are the web app alone: do not ask its question ("Who will use this
app?"); say in one line that this is a web app alone, with no MCP App, then load the
[`full-stack` skill](../full-stack/SKILL.md) with them. Everything
else (the features, the design, the build, the handoff) is the `app`
skill's, unchanged, and so is changing an app that exists.
