---
description: "No front door named: build the web app first, no question, backend ready for an MCP App."
runs: 3
max_turns: 20
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion]
append_system_prompt: "You are in a planning-only session: you can read files and load skills but cannot write files or run commands. No one can answer a question in this session: state the assumptions you go on with and continue. Follow any skills that apply as far as you can without writing. End with a short summary stating what kind of app you are building (a web app, an MCP App for an AI host, or both) and the design so far."
---

Build me a todo list app with Reboot.
