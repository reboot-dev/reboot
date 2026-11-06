---
title: Sample Data — Chosen With the Design, Seeded Through the Real Methods
impact: MEDIUM
impactDescription: A new app's pages are empty until someone adds things, so the design question offers sample data. It is test data, seeded through the real methods with fixed ids, only under rbt dev run: it fills every page and state the app shows, survives a restart, and never reaches a scenario or production.
tags: sample-data, seed, initialize, design
---

# Sample Data

The app skill's design question offers it: "Build this design?",
with **Build it, with sample data** (test data so every page has
something in it to try, only on the developer's machine), **Build it, empty**, or **Change something**.

With sample data, write `backend/src/seed.py` at the build's `main.py`
step, through the real methods, with
fixed ids (`seed-1`) so a restart is a no-op: enough that every page
in the page map and every state it shows has something in it (things
in every status a page shows, dates around today, one thing that
needs doing now, named when it is done), with real-sounding names.
`initialize` calls `open_<app>`, then `seed` only under `rbt dev run`,
which sets `RBT_DEV=true`; `rbt serve` and Reboot Cloud do not, so a
deployed app starts empty:

```python
import os

async def initialize(context: InitializeContext):
    await open_<app>(context)
    # Test data, on the developer's machine only: `rbt dev run` sets
    # RBT_DEV; `rbt serve` and Reboot Cloud never do.
    if os.environ.get("RBT_DEV") == "true":
        await seed(context)
```

The test module's `application` still calls `open_<app>` only, so no
scenario sees the sample data either. The handoff names in one line
what was added and where to see it, and that it is test data that
stays on this machine.
