---
name: feature
description: Specify a Reboot application's feature before and while building it, as a Gherkin `.feature` file the tests run and the dashboard shows. Use whenever the user asks for a new capability or a change to one ("add transfers", "users should be able to..."), before touching the API or code; and when converting an existing test suite to feature files. Agrees on the feature in plain English first, writes it down tagged `@wip`, builds it with the `python` / `web-app` / `mcp-ui` skills, then iterates on scenarios with the user until they agree to take the tag off.
argument-hint: [<feature-description>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, AskUserQuestion
---

# feature — Specify a Feature, Then Build It

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

A feature of a Reboot application is written down once, as a
`.feature` file in `backend/tests/`, and that one file is the
specification the developer reviews, the tests `pytest` runs, and
the card the dashboard's Features page shows. This skill is the
order of work that keeps the file true while the feature is built:
agree on it in English, write it down before any code, tag what is
unfinished, and take the tag off only when the developer says so.

The mechanics of feature files, the built-in steps and their
spelling, custom steps, and the web app steps are in the `python`
skill's references; read them at the step that needs them:

- `../python/references/testing-features.md` — **read before
  writing any scenario**: the step vocabulary, who calls, saved
  values, assertions, `@wip` / `@blocked`, custom steps.
- `../python/references/testing-web-app.md` — read when a scenario
  opens the web app: the `frontend` fixture, the web app steps, the
  accessible markup the page needs, recordings.
- `../python/references/testing-project-setup.md` — the files a
  suite needs (`reboot[dev]`, `.pytest.ini`, `.gitignore`).

## Step 1 — Propose the feature in English

Before any file changes, tell the user what you understand the
feature to be, as a person would describe it, not as an API:

- **Its name**, a sentence about the activity: "Customers can
  transfer money between accounts".
- **What it is for**, a short paragraph: who does it, why, what
  they see when it worked.
- **Its rules**, only where there is a clear business rule or an
  invariant of the whole system, the kind one would want to verify
  formally: money is conserved by a transfer; a balance never goes
  below zero; a customer sees only their own accounts. Most features
  have one or two; many have none. Do not dress up "the button
  works" as a rule.
- **A few example situations** in prose, one line each: "a
  transfer between two customers' accounts"; "a transfer for more
  than the source holds".
- **Whether the web app is part of it**, when the app has one: the
  flow a person clicks through, if that is how the feature is used.

Ask the user whether that is the feature. Iterate on the English
until they agree; the file follows the words, so the words come
first.

## Step 2 — Write it down, tagged `@wip`

Once agreed, create `backend/tests/<capability>.feature`, named for
the activity (`transfers.feature`, not `bank.feature`), with the
agreed name and description, and the rules with their descriptions
where the user agreed on some. It may have no scenarios yet; write
it anyway, with `@wip` on the whole feature:

```gherkin
@wip
Feature: Customers can transfer money between accounts
  A customer moves money from one of their accounts to another
  account of the bank in one step, which is how they pay someone
  without a withdrawal and a deposit that could come apart.

  Background:
    Given the application is up

  Rule: A transfer moves exactly the amount from one account to the other
    Neither account sees any other change.

  Rule: A transfer that would overdraw the source leaves both accounts unchanged
    A transfer is one transaction: when the withdrawal from the source
    account aborts, the deposit into the destination is rolled back
    too, so money is never created by a failed transfer.
```

Add the file to the `scenarios(...)` call of the test module whose
application it runs against, or create the module
(`testing-features.md` shows the minimal one). If the project has
no test suite yet, set one up per `testing-project-setup.md`, which
includes `reboot[dev]` in the dev dependencies and `*.recordings/`
in `.gitignore`.

If the dashboard is running (the `dashboard` skill), the feature
shows up on its Features page at once, marked as work in progress.
Tell the user it is there.

## Step 3 — Build the feature

Change the API, the servicers, and the frontend with the `python`
skill and, for the frontend, the `web-app` or `mcp-ui` skill. Two
rules of theirs matter most here:

- **Every property gets a `description=`** on its `Field(...)`,
  saying what the value means (`api-pydantic.md`). The dashboard
  shows the description beside the property; a property without
  one shows a request to add it.
- **A web app page is built with accessible markup** from the
  start (`testing-web-app.md`): labels paired with inputs, buttons
  that say what they do, tables with a labelled heading. That is
  what lets a scenario drive it.

## Step 4 — Iterate on the scenarios with the user

After the API and code change, turn the example situations into
scenarios and run them; then keep going with the user: show them
each scenario, ask what else the feature must do, write that down,
run it. Concretely:

- **Write each scenario in the built-in steps** (`testing-features.md`),
  named for the situation, under the rule it illustrates, or at the
  feature's top level when it illustrates no rule.
- **Let a factory make the id up**: `"alice" creates an `Account`via`open``and`the resulting state id is saved as "account
  id"`, then `<account id>`. Give an id only when it means something
  to the application (a user id, a singleton the code refers to).
- **Move `@wip` down as scenarios land**: once a rule or scenario
  is written, put `@wip` on it and take it off the feature, so the
  dashboard shows exactly what is still being worked on.
- **Tag `@blocked` what cannot pass yet**: a scenario the
  application cannot pass (a declared error it does not raise yet),
  or one that needs a person to act first (a credential to obtain,
  a decision to make, an external system to set up). Say why in the
  paragraph under the `Scenario:` line; that paragraph is the skip
  reason and what the dashboard shows. Do not delete or weaken a
  scenario to make the suite green.
- **Suggest a web app scenario** when the feature is something a
  person does in the app: the clicks and what they see, with
  backend assertions on the state it left behind
  (`testing-web-app.md`). Running it records a video and screenshots
  the user can watch on the Features page.
- **Suggest a rule only for a real invariant**, one that would be
  worth formal verification; when a scenario shows what an
  operation does and nothing more, leave it at the top level.
- **Run the suite** (`cd backend && uv run pytest`, or `-m wip` for
  what is in progress) and `uv run mypy backend/`; fix what fails.
- **Suggest reviewing in the dashboard** after each round: the
  feature's card, its rules, the methods it uses and the ones no
  feature uses, and the recordings.

## Step 5 — Ask before taking `@wip` off

When every scenario passes (or is `@blocked` with a reason) and the
user has said the feature does what they meant, ask whether to
remove the `@wip` tags. Take them off only with their agreement;
`@blocked` tags stay until the blocking is resolved.

## Converting an existing test suite

When an application has `unittest` / `IsolatedAsyncioTestCase`
tests (the pre-feature-file layout) and the user wants them as
feature files, or the `upgrade` skill's migration notes ask for it:

1. Read every test and list what each one shows, in English, one
   line per test.
2. **Group them into features by capability**, not by servicer or
   test file: a `test_bank.py` with deposits, withdrawals, and
   transfers becomes `deposits.feature`, `withdrawals.feature`, and
   `transfers.feature`. Where the grouping is not obvious, propose
   one and ask the user; do not guess at a business rule they did
   not state.
3. Follow steps 1 and 2 for each feature, then write the scenarios
   from the tests' calls and assertions in the built-in steps. A
   test's helper that the steps cannot express becomes a custom
   step, written as plain Reboot code (`testing-features.md`); a
   mock becomes an autouse fixture asserted through a one-line
   custom step.
4. Keep the tests that are not about the application's behavior:
   the crash-and-recover tests of `testing-failure-recovery.md`
   stay on the harness.
5. Run both until the scenarios cover the tests, then delete the
   converted tests. Leave every feature `@wip` until the user has
   reviewed the files, then ask to remove the tags.
