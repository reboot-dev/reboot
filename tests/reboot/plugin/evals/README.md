# Plugin evals

Each case gives Claude Code, with the plugin loaded, one request a
person might make, and checks the result against what Reboot requires:
the API is pydantic Python, the backend enforces who may read what, an
outside call in a workflow is guarded, and a deployed API only grows.
Each case has the agent write the code, and graders read what it
wrote.

The four cases cover what Claude most often gets wrong about Reboot
without the plugin (a prior test found every run writing a `.proto`
API, leaving the authorizer out or bare, and making workflows instance
methods) and the costliest mistakes: a deploy that won't boot, private
data open to anyone, a customer charged twice.

## What a case checks, and what it never checks

A case checks what stays true however the skills are written: what
Reboot itself requires, and what the request asked for. It never checks
how the agent got there: which skill loaded, what it asked, in what
order it worked, or how its messages read. Those change whenever the
skills do, and a grader tied to them would have to change with every
skill change.

So a grader changes only when Reboot changes (a new release that
changes the rule it checks), and a skill change never needs to touch
one. A skill change that teaches something new adds a case for it.

- No grader rewards or penalizes asking a question. The sessions run
  unattended, so the system prompt says where the agent would ask, to
  choose, say what it chose, and go on.
- The `reboot-skill` grader on each case records whether any Reboot
  skill loaded. It matches any skill name, so renames don't break it,
  and it is reported but not scored.

## The cases

| Case | The request | What passes |
| --- | --- | --- |
| `api-in-python` | A shared grocery list's API | `reboot.api` pydantic, every field tagged with a default, method kinds that fit; no `.proto` |
| `private-profile` | Implement a profile's servicer; the API marks some fields private | The backend refuses private fields and changes to anyone but the owner, behind a real `authorizer()`; servicer shape (`self.state`, `self.ref().state_id`) |
| `checkout-workflow` | Stripe charge and email receipt that survive a restart | A `@classmethod` workflow; each outside call in `at_least_once` / `at_most_once`, the charge with a stable idempotency key |
| `deployed-api-change` | Rename a field and drop another on an app said to be deployed | The renamed field keeps its tag; the dropped field stays in the schema, and the answer says why |

The agent can read, load skills, and write and edit files, but cannot
run commands, so nothing is generated, installed or started. The cases
check the code against Reboot's rules, not by running it.
`deployed-api-change` deploys nothing: the prompt says the app is
deployed, and the case checks that the edit follows the
schema-evolution rule a deploy would enforce. Whether the code runs is
for a build, which takes far longer.

### How graders read the code

`claude plugin eval` hands graders the agent's last message, its
trace, or a named file. Its `files` target is only the list of file
names, and the trace holds every skill page the agent read, so a
pattern there would match the skills' own examples. So each request
names the file to write, as a user could ("Write the API in
`api/grocery/v1/grocery.py`"), and graders read that file (`target:
{source: file, path: ...}`). Where naming the file would give the
answer away, a grader can match the agent's `Write` calls instead
(`tool_used` with `tool: Write`), which hold what it wrote and nothing
it read.

## Running

Needs `claude` (Claude Code) signed in. Every command starts unattended
agent sessions on your account.

```sh
tests/reboot/plugin/evals/run.sh -j 4                                          # every case, with and without the plugin
tests/reboot/plugin/evals/run.sh --case private-profile --runs 1 --ablation none # one case, plugin only
tests/reboot/plugin/evals/run.sh --plugin <other checkout>/reboot/plugin -j 4  # these cases against another plugin
```

Each case runs three times, because the same request doesn't always
produce the same code; a result is a count such as 2 of 3. Graders are
judged by Sonnet: Haiku failed answers that plainly met a rubric.

The full set, three runs with and three without the plugin, is 24
agent sessions, too slow and costly to run on every PR or nightly. Run
it by hand when a skill changes, against `main` and against the
change, and when a new model comes out. Otherwise the result rarely
moves.

Results are in `results/<time>/` (ignored by git): `report.html`,
`aggregate-result.json`, and `plugin.txt` with the commit that ran.

## Reading the results

- **With and without the plugin** (the default): each case also runs
  with no plugin loaded. A case that passes without the plugin isn't a
  failure, but it is a flag: the model already does it, so the skill
  text that teaches it may be unnecessary. Remove that text in a skill
  change and run the case again; if it still passes, the text was
  doing nothing.
- **Before and after a skill change:** the cases come from this
  checkout, and `--plugin` picks the skills they run against. Run
  them once with `--plugin` pointed at a checkout of `main` and once
  against the change, both with `--ablation none`. A case that passes
  on `main` and fails on the change is a regression.

## Adding a case

A skill change that teaches something new adds a case for it. The
case should fail against `main`'s skills, which don't teach it yet,
and pass against the change. Run both with `--plugin` as above and put
the two counts in the PR.

- One folder per case, named for what it checks, with a `case.yaml`
  and, if the request needs an existing app, a `fixture.sh` that
  writes it.
- Pick a domain no other case uses, so each case adds coverage.
- Check results mechanically where you can (a `regex` grader on a
  named file, such as an import that must or mustn't appear), and
  with an `llm` grader where it takes judgment. An `llm` rubric names
  what passes and what fails, reads the named file (`focus: {source:
  file, path: ...}`), and asks the judge to quote what it relied on.
  Never `target: files` or `focus: files`: those are file names only.
- Grade what Reboot requires or what the request asked for, never the
  route the agent took.
