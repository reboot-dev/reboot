---
type: llm
weight: 1
---

PASS if the response commits to building an MCP App (tools, and optionally UI views, used from Claude or another MCP host) as the first front door. FAIL if it builds a web app first, builds both now, or asks the user to choose the kind of app. Clarifying questions about features, scope, data or sign-in are fine and do not affect this check; only asking the user to choose between an MCP App and a web app counts as asking about the kind of app.
