# Plugin evals

Each case gives Claude Code one request a person might make, with the
plugin loaded, and checks what it decides: which front door it builds,
what the design holds. The sessions are planning-only. They can read
files and load skills, but can't write files or run commands, so nothing
is built and a run costs about $0.20–0.50.

- `<case>/prompt.md`: the request, and in its front matter the session's
  limits and how many runs.
- `<case>/graders/*.md`: what passes. An `llm` grader is a rubric a judge
  model reads the session's answer against, voting three times. A
  `tool_used` grader checks a tool call, such as the `app` skill
  loading.

## Running

Needs `claude` (Claude Code) signed in. Every command starts unattended
agent sessions.

```sh
tests/reboot/plugin/evals/run.sh -j 3                                  # every case, with and without the plugin
tests/reboot/plugin/evals/run.sh --case route-mcp --runs 1 --ablation none   # one case, plugin only
tests/reboot/plugin/evals/run.sh --plugin <other checkout>/reboot/plugin --ablation none
```

- **With and without** (the default): each case also runs with no
  plugin loaded. A grader that passes both ways isn't testing the
  plugin; the difference is what the plugin adds.
- **Before and after a change:** run with `--ablation none` against
  `main` (`--plugin`) and against the change.
- Results are in `results/<time>/` (ignored by git): `report.html`,
  `aggregate-result.json`, and `plugin.txt` with the commit that ran.

## Adding a case

A skill change that alters what a build decides adds or changes the
graders for it in the same change, run red before and green after.
Write a rubric that names what passes and what fails, and asks the judge
to quote what it relied on. Graders are judged by Sonnet: Haiku failed
designs that plainly met a rubric.

These evals check decisions, not code. Whether the code works is for a
build.
