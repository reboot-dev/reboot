---
name: web-app
description: Build a complete Reboot Web App — a Reboot backend behind a standalone browser-facing React frontend, served at a normal URL (not embedded in an MCP host). Starts the app skill's whole build with the front end already chosen as a web app. Use when the user asks for a website, a web app, an SPA, or an app served at a URL. The backend is in the python skill, including sign-in for browser users, and the React single-page app is in the frontend skill.
argument-hint: [<app-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# web-app — Build a Reboot Web App

The front end is chosen: a web app, served at a URL and used in a
normal browser, with the Reboot backend behind a React frontend.

Load the [`app` skill](../app/SKILL.md) and follow it from "When to
Use", building a web app, with the user's description as input. Skip
its "Routing" section: the front end is already settled. If the user
also wants the app in Claude or ChatGPT, build both, as the app
skill's "Both" describes.
