---
type: llm
weight: 1
---

PASS only if the design declares a `User` state type (the signed-in user / front door that owns per-user data and routes creation). FAIL if there is no `User` type or it is described as optional or skipped.
