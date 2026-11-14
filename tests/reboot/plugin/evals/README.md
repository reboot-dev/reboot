# Plugin evals

These are eval cases for the Reboot plugin, run with
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals).
Each case is a folder here with a `case.yaml`: one request a person
might make of Claude Code, and graders that check what the agent
wrote. `run.sh` runs the cases against a plugin checkout, with the
plugin loaded and without it.

## What these evals test

Each case grades the agent's first draft. A session gets one request,
cannot run commands, and has no one to answer its questions. The agent
never runs `rbt generate`, `mypy`, the tests or the app, so it never
sees an error from them. Nothing here checks that the code runs.

A grader looks for one of two kinds of mistake:

- **Silent mistakes.** Reboot raises no error for these, so nothing
  later tells the agent or the user: an authorizer that lets everyone
  in, a charge that repeats when a workflow restarts. When one of these
  graders fails, a user would ship the mistake.
- **Mistakes Reboot reports.** Reboot rejects these with an explicit
  error when the code is generated, type-checked or run: a deleted
  field, a state field with no default. In a real session the agent
  sees the error and fixes it, so a user may never see what the grader
  saw. The grader is still worth having. A first draft that is already
  right saves the user the failed run and the turns spent fixing it.

So a failure of the second kind means the skills cost the user time.
It does not mean the user ends up with broken code.

## Running

Run them from the repository root. This needs `claude` (Claude Code)
signed in, and every command starts unattended agent sessions on your
account.

```sh
tests/reboot/plugin/evals/run.sh -j 4                                  # every case, with and without the plugin
tests/reboot/plugin/evals/run.sh --case <name> --runs 1 --ablation none # one case, plugin only
tests/reboot/plugin/evals/run.sh --plugin <checkout>/reboot/plugin -j 4 # these cases against another plugin
```

`run.sh` takes `--plugin` and passes every other flag on to `claude plugin eval`. Results are in `results/<time>/` (ignored by git):
`report.html`, `aggregate-result.json`, and `plugin.txt` with the
plugin's commit.

Nothing runs the cases on a schedule or in CI. They run when a person
runs them.

## Before you open a PR

If your branch changes the plugin or the cases, run the evals and
commit the result in `RESULT.md`. When the branch is done, commit your
changes and run:

```sh
tests/reboot/plugin/evals/compare.sh
```

It runs every case against `main`'s plugin and against the branch's,
and writes the comparison to `RESULT.md`. Commit that file with the
branch, for the reviewer to read.

It always runs every case, so it refuses flags such as `--case`. The
raw results, with each judge's reasoning, stay in
`results/compare-<time>/`.

Run it once per branch, not once per push, because a run is slow and
expensive: about 9 agent sessions and $5 at API prices for each case,
and 10 to 15 minutes in all. CI runs no evals on a PR for the same
reason.

Run it signed in to Claude Code with your Claude subscription, so the
run counts against your plan's usage and spends no API credits. Unset
`ANTHROPIC_API_KEY` first: Claude Code bills the key when it is set.

The `Check Plugin Evals Result` job fails a PR that changes the plugin
or the cases when `RESULT.md` is not for that change. A rebase does not
make the result stale. Changing the plugin or the cases again does, so
run `compare.sh` again.

Every such PR rewrites `RESULT.md`, so a rebase over another one
conflicts on it. Keep your branch's version.

## If `Check Plugin Evals Result` fails

The job fails when your branch changes the plugin or the cases and
`RESULT.md` has no result for that change. To fix it:

1. Commit your changes to the plugin and the cases. `compare.sh`
   refuses to run while any of them are uncommitted, because it
   records the result for the committed change.
2. From the repository root, run
   `tests/reboot/plugin/evals/compare.sh`. It takes 10 to 15 minutes.
3. Read the top of `RESULT.md`. It lists every regression: a grader
   that passes fewer runs on your change than on `main`. Fix each one
   or explain it in the PR.
4. Commit `RESULT.md` and push. The job passes on that commit.

If you change the plugin or the cases after that, the job fails again.
Repeat the steps.

## Reading the results

Each case runs several times, because the same request doesn't always
produce the same code. A grader's result is a count, such as 2 of 3.

- **With and without the plugin.** A grader that fails without the
  plugin and passes with it shows the skills working. A grader that
  passes both ways shows the model already does this, so the skill
  text that teaches it may be unnecessary.
- **Before and after a plugin change.** `RESULT.md` has each grader's
  count on `main` and on the change. A grader that passes fewer runs
  on the change than on `main` is a regression. `RESULT.md` lists
  the regressions at its top and puts their rows first in the table.
  A difference of one run can be chance; two or more is unlikely to
  be.
- **`reboot-skill`.** This grader records whether any Reboot skill
  loaded. It is reported and not scored.

## Adding a case

A plugin change that teaches something new adds a case for it. The
case should fail against `main`'s plugin and pass against the change;
`RESULT.md` shows both counts.

- Make one folder per case, named for what it checks, with a
  `case.yaml`. Copy an existing case to start.
- If the request needs an existing app, put the app's files in
  `fixture/` and add a `fixture.sh` that copies them into the
  workspace.
- Grade what Reboot requires or what the request asked for. Don't
  grade the route the agent took: which skill it loaded, what it
  asked, or how its messages read. A grader should change only when
  Reboot changes, never when a skill is reworded.
- Have the request name the file to write, and point graders at that
  file (`source: file`). Use a `regex` grader where a pattern can
  decide, and an `llm` grader where it takes judgment. An `llm`
  rubric states what passes and what fails, and asks the judge to
  quote what it relied on.
- The sessions run unattended, so no grader rewards or penalizes
  asking a question.
