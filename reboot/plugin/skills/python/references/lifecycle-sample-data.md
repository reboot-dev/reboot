---
title: Sample Data — Offered at the Handoff, Seeded Through the Real Methods
impact: MEDIUM
impactDescription: A new app's pages are empty until someone adds things, so the handoff offers sample data. Seeded through the real methods with fixed ids, it fills every page and state the app shows, survives a restart, and never reaches a scenario.
tags: sample-data, seed, initialize, handoff
---

# Sample Data

The app skill's handoff offers it last, as a question: "Add sample
data?", with **Add sample data** (so every page has something in it
to try) and **Leave it empty**.

On "Add", write `backend/src/seed.py`, through the real methods, with
fixed ids (`seed-1`) so a restart is a no-op: enough that every page
in the page map and every state it shows has something in it (things
in every status a page shows, dates around today, one thing that
needs doing now, named when it is done), with real-sounding names.
`initialize` calls `open_<app>`, then `seed`; the test module's
`application` still calls `open_<app>` only, so no scenario sees the
sample data. Then the suite once more, and one line naming what was
added and where to see it.
