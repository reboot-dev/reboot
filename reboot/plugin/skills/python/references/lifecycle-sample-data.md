---
title: Seed Sample Data With Aliases, Only Under rbt dev run
impact: MEDIUM
impactDescription: A new app's pages are empty until someone adds data, so the design question offers sample data. It is test data, seeded through the real methods with fixed aliases, only under rbt dev run: it fills every page and state the app shows, survives a restart, and never reaches a scenario or production.
tags: sample-data, seed, initialize, design
---

# Sample Data

For when the user answers **Build it, with sample data** to the app
skill's "Build this design?" question.

With sample data, write `backend/src/seed.py` at the build's `main.py`
step, through the real methods, each call with its own
`.idempotently("<alias>")`: `initialize` replays a call it has made
before instead of making it again, so a restart adds nothing. Seed
enough that every page and every state it shows has something in
it, with real-sounding names. `initialize` calls `seed` only under `rbt dev run`, which sets
`RBT_DEV=true`; `rbt serve` and Reboot Cloud do not, so a deployed app
starts empty:

```python
# main.py
import os

from seed import seed


async def initialize(context: InitializeContext):
    await Board.create(context, BOARD_ID)
    if os.environ.get("RBT_DEV") == "true":
        await seed(context)
```

```python
# seed.py
async def seed(context: InitializeContext):
    board = Board.ref(BOARD_ID)
    # A second call to the same method needs its own alias; a
    # restart replays each call instead of adding the task again.
    await board.idempotently("Write the brief").add_task(
        context, title="Write the brief", status="todo",
    )
    await board.idempotently("Book the venue").add_task(
        context, title="Book the venue", status="done",
    )
```

Changing an alias's text later adds a new item rather than updating
the old one.
