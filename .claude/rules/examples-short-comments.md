---
paths:
  - "reboot/examples/**"
---

# Keep comments in the examples short and about Reboot

A comment in `reboot/examples/` says in a line or two why a step is
there. Leave out the inner workings of third-party tools: how Expo
builds a launch URL, which library renders a sheet, what a Maestro
lookup timeout defaults to, how npm resolves a workspace.

**Why:** The examples are read by people learning Reboot. Paragraphs
about Expo, Maestro, Android or npm internals bury the Reboot parts,
and they go stale as those tools change.

**How to apply:** When a step needs a comment, state the reason in one
or two sentences. If a tool detail matters, name the flag or setting
and stop; the full investigation belongs in the commit message.
