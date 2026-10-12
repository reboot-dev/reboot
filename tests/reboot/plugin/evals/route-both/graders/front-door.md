---
type: llm
weight: 1
---

PASS if the response commits to building BOTH an MCP App (used from Claude) and a standalone web app (at crm.example.com) on one shared backend. FAIL if it builds only one of them now or asks the user to choose the kind of app. Clarifying questions about features, scope, data or sign-in are fine and do not affect this check; only asking the user to choose between an MCP App and a web app counts as asking about the kind of app.
