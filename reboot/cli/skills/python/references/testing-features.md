---
title: Specify Behavior in Feature Files
impact: MEDIUM
impactDescription: Feature files are the application's specification and its test suite at once; a suite written any other way is neither reviewable by the developer nor shown by the dashboard
tags: testing, bdd, gherkin, feature, scenario, rule, pytest-bdd, reboot.bdd, wip, blocked, custom-steps, world
---

## Specify Behavior in Feature Files

> **Critical:** a Reboot application's tests are Gherkin `.feature`
> files run by `reboot.bdd`, which ships built-in steps for every
> call an application takes. Write scenarios in the built-in steps'
> spelling below; write a custom step only for what they cannot
> say, and write it as plain Reboot code. Every step that calls
> names who calls: there is no current user and no anonymous call.

A feature file is read by three parties: the developer, who reviews
it as the specification of what the application does; `pytest`,
which runs each scenario against the application through the
`Reboot()` harness; and the dashboard's Features page, which shows
each feature with its rules, scenarios, the methods it uses, and
the recordings of its browser scenarios. One file serves all three
only if it says things the built-in steps understand, so learn the
spelling before writing.

The [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic)
example's `tests/*.feature` files are the reference for
every pattern here.

## What Goes Where

```
pytest.ini                     # testpaths: tests; pythonpath: backend/src backend/api api
tests/
├── opening_accounts.feature   # One feature per capability.
├── transfers.feature
├── withdrawals.feature
├── full_bank_test.py          # One module per application setup.
├── interest_test.py
├── web_test.py                # The scenarios that drive the web app.
└── opening_accounts.recordings/   # Made by running; git-ignored.
```

- **One `.feature` file per capability**, named for the activity:
  `transfers.feature`, `opening_accounts.feature`. Not
  `bank.feature` or `account.feature`: those name state types, which
  the dashboard already indexes as such.
- **One test module per application configuration.** A module is a
  few lines: the `application` fixture returning the
  `Application(...)` the scenarios run against, and a
  `scenarios(...)` call naming the feature files that run against
  it. The bank's `full_bank_test.py` runs four feature files against
  an application with authorizers and interest turned off;
  `interest_test.py` runs `interest.feature` against one with
  interest on; `web_test.py` runs the features whose scenarios open
  the web app.
- **Recordings** of browser scenarios land in
  `<feature>.recordings/` beside the feature file; `*.recordings/`
  is in `.gitignore` (see `testing-web-app.md`).

The minimal module:

```python
"""The bank's tests: the Gherkin scenarios in the `.feature` files
beside this module."""

import pytest
from account_servicer import AccountServicer
from bank_servicer import BankServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios


@pytest.fixture
def application() -> Application:
    return Application(servicers=[AccountServicer, BankServicer])


scenarios('deposits.feature', 'withdrawals.feature')
```

Nothing imports the built-in steps: the `reboot` package registers
them as a pytest plugin, active whenever `reboot[dev]` is installed
(`testing-project-setup.md` has the `pyproject.toml`). A module runs
a second application by naming it: `Given the "proxy" application is up` runs what a `proxy_application` fixture returns.

Run the suite the usual way: `uv run pytest` from the project root,
one
file with `uv run pytest tests/full_bank_test.py`, one scenario
with `-k "transfer between two"`, and by tag with `-m wip` or
`-m "not wip"`.

## The Shape of a Feature

```gherkin
Feature: Customers can transfer money between accounts
  A customer moves money from one of their accounts to another
  account of the bank in one step, which is how they pay someone
  without a withdrawal and a deposit that could come apart.

  Background:
    Given the application is up

  Rule: A transfer moves exactly the amount from one account to the other
    Neither account sees any other change.

    Scenario: A transfer between two customers' accounts
      Given "anonymous" is an unauthenticated user
      And "anonymous" creates a `Bank` via `create`
      And the resulting state id is saved as "bank id"
      When "anonymous" does a `sign_up` with `customer_id="test@reboot.dev"` on `Bank` of "<bank id>"
      And "anonymous" does an `open_account` with `initial_deposit=1000.0` on `Customer` of "test@reboot.dev"
      And the resulting `account_id` is saved as "first account id"
      And "anonymous" does a `sign_up` with `customer_id="test2@reboot.dev"` on `Bank` of "<bank id>"
      And "anonymous" does an `open_account` with `initial_deposit=0.0` on `Customer` of "test2@reboot.dev"
      And the resulting `account_id` is saved as "second account id"
      And "anonymous" does a `transfer` with `from_account_id=<first account id>` and `to_account_id=<second account id>` and `amount=250.0` on `Bank` of "<bank id>"
      Then as "anonymous", `balance` on the `Account` for "<first account id>" has `amount=750.0`
      And as "anonymous", `balance` on the `Account` for "<second account id>" has `amount=250.0`

  Rule: A transfer that would overdraw the source leaves both accounts unchanged
    A transfer is one transaction: when the withdrawal from the source
    account aborts, the deposit into the destination is rolled back
    too, so money is never created by a failed transfer.

    Scenario: A transfer for more than the source account holds
      ...
```

**A feature is a capability, a rule is an invariant, a scenario is
an example.**

- The **feature** is one thing a user can do, named as a sentence
  about the activity ("Customers can transfer money between
  accounts"), with a description paragraph saying what it is for.
  It is the right size when its rules read like a specification
  someone could implement from and all serve one user goal.
- A **rule** is a business invariant the capability obeys, one
  someone would want to verify formally (money is conserved by a
  transfer, a balance never goes below zero, a customer sees only
  their own accounts). State it once, in the rule's name and its
  description. Add a rule only for an invariant of that kind: a
  scenario that only shows what an operation or a page does sits at
  the feature's top level with no rule around it (the bank's
  `deposits.feature` and `opening_accounts.feature`).
- A **scenario** is one concrete illustration, named for the
  situation ("A transfer for more than the source account holds"),
  never a restatement of the rule. A `Scenario Outline` with an
  `Examples` table illustrates one rule at several values
  (`withdrawals.feature`).
- The **background** carries what every scenario starts from,
  usually `Given the application is up` and the users everyone
  needs. Keep a user out of the background when only some scenarios
  use them.
- Tests of Reboot's own mechanisms (that a spawned task runs, that a
  schedule fires) belong in Reboot's suite, not in the
  application's specification.

## Who Calls

Every scenario declares its people, and every step that calls says
who:

```gherkin
Given "alice" is an authenticated user
And "admin" has the bearer token "secret-admin-token"
And "bob" is an unauthenticated user
```

- `is an authenticated user` mints a test token for that user id
  through the same path a real sign-in takes, so the application's
  `User` for them is auto-constructed. A scenario that needs an
  authorizer to let someone in, or keep someone out, says who it is
  this way; it never subclasses a servicer to weaken the authorizer.
- `has the bearer token "..."` names a user by a raw token, for an
  application whose own `TokenVerifier` accepts it.
- `is an unauthenticated user` declares someone whose calls carry
  no token.

A call starts with the user; a read starts with `as "alice",`:

```gherkin
When "alice" does a `deposit` with `amount=50` on `Account` of "alice"
Then as "alice", `balance` on the `Account` for "alice" has `balance=50`
```

A step that names nobody is refused with a hint. There is no
current user and no anonymous call: a scenario with a single
unauthenticated caller names them `"anonymous"`, and invents names
only when it has two people to tell apart.

`Given as "alice", a shared context` makes every call from then on
share one context, the way one client session does; every later
call must then name the same user.

## Calls, Results, and Saved Values

```gherkin
Given "alice" creates an `Account` via `open` with `initial_balance=100`
And the resulting state id is saved as "account id"
When "alice" does a `deposit` with `amount=50` on `Account` of "<account id>"
Then the result has `updated_balance=150`
And the resulting `account_id` is saved as "alice account id"
```

- **`creates`** calls a factory. Leave the id out and the factory
  makes one up, then save it on the next line with `the resulting state id is saved as "..."`. Give an id, `creates an `Account`of "alice" via`open``, only when the id means something to the application: a user id, a singleton the code itself refers to (`"coupon-book"`), a natural key. A scenario never invents an id
  a factory would otherwise choose.
- **`does`** calls a writer, transaction, or workflow; the article
  follows English (`does an `open_account`` ). The properties of the request come right after the method: `with `a=1` and `b="x" ``.
- **A call does one thing; its result is saved on the next line.**
  `the resulting `account_id` is saved as "..."` saves a response
  property; `the resulting state id` and `the resulting task id`
  save what `creates` and `spawns` produced. `the result has ...`
  asserts on the last response.
- **A saved name is a quoted string** and may have spaces, `"first account id"`, and is said back as `<first account id>`: in a
  state id (`of "<account id>"`), a user id, a bearer token, or a
  property value (`amount=<balance>`). A `<name>` inside a JSON
  string stays literal. A `Scenario Outline`'s columns are said the
  same way, so a save may not reuse a column's name.
- **Values are JSON** with JSON5's leniencies: `owner={name: "Frank", tags: ["vip"]}`. A dotted path nests when calling,
  `owner.name="Frank"`, and reaches into the response when
  asserting, `balances[0].account_id=<ann account id>` or
  `owners["main"].name="Heidi"`.

## Reads and Assertions

```gherkin
Then as "alice", `balance` on the `Account` for "<account id>" has `amount=100.0`
And as "alice", `balances` on the `Customer` for "ann" has `balances` of length `1` and `balances[0].balance=25.0`
And as "anonymous", `all_customer_ids` on the `Bank` for "<bank id>" has `customer_ids` containing `"alice"`
And as "alice", `has_at_least` with `amount=50` on the `Account` for "<account id>" has `enough=true`
```

- A `Then ... has` asserts; clauses are `path=value`, `path`
  containing `value` (a substring, a list element, or a map key),
  and `path` of length `n`, joined by `and` or commas.
- A reader that takes properties is given them right after the
  method, the way a call is: `has_at_least` with `amount=50` on the
  `Account` for ...`.
- Readers are only read this way: `does` and `attempts` refuse a
  reader, and `has` refuses a writer.
- A `Given` or `When ... has` saves instead of asserting: `has `owner.name` saved as "owner name"`.

**Waiting** for a task, a schedule, or a workflow to land is a
reactive read with a bound, never a sleep:

```gherkin
Then as "anonymous", `balance` on the `Account` for "<account id>" eventually has `amount=1.0` within 10 seconds
```

## Attempts, Aborts, and Tasks

```gherkin
When "alice" attempts a `withdraw` with `amount=50` on `Account` of "<account id>"
Then the attempt aborts with `OverdraftError` with `amount=20`
And as "alice", `balance` on the `Account` for "<account id>" has `balance=30`

Then as "anonymous", `balance` on the `Account` for "ghost" aborts with `StateNotConstructed`
```

- `attempts` makes a call that may abort; `the attempt aborts with`
  names the declared error type and, optionally, its properties. A
  reader's abort is asserted on the read itself.
- **An uncaught non-Reboot error aborts with `Unknown`**: a
  validation `ValueError` in a servicer, an index out of range.
  Asserting `aborts with `Unknown`` is the spelling for a servicer
  bug or an undeclared refusal; the better fix is usually to declare
  an error and assert on that.

```gherkin
When "anonymous" spawns a `deposit` with `amount=15` on `Account` of "<account id>"
And the resulting task id is saved as "first"
Then "anonymous" awaits the `deposit` task "<first>" on `Account` within 30 seconds
And the result has `updated_balance=15`
```

`spawns` runs the call as a task; a task id a response carries is
saved and awaited the same way.

## Tags: `@wip` and `@blocked`

```gherkin
@wip
Feature: Users can sign in
  ...

  Rule: A user signs up once

    @blocked
    Scenario: Signing up twice under the same id
      The bank does not refuse a second sign-up yet: the customer's
      factory aborts with `StateAlreadyConstructed`, which the bank
      lets surface as `Unknown`. This waits for a declared error.

      Given ...
```

- **`@wip`** marks the feature, rule, or scenario being worked on.
  It runs as usual; the dashboard marks it in green and filters by
  it, so what is new is easy to see. Put it on the whole feature
  when the feature is new, move it down to the rules and scenarios
  as they are added, and take it off with the developer's agreement
  when the work is done.
- **`@blocked`** marks a scenario the application cannot pass yet,
  or one that needs a person to do something first (a credential, a
  decision, an external system). Its description, the paragraph
  right under the `Scenario:` line, says why; the scenario is
  skipped with that reason, and the dashboard marks it in red and
  filters by it.

The `feature` skill (`../../feature/SKILL.md`) is the workflow that
puts these tags on and takes them off.

## Custom Steps Are Plain Reboot Code

Write a custom step only for what the built-in steps cannot say: a
loop, an assertion on a mock, a stand-in's side channel. Its body
is the same code any Reboot caller writes:

```python
from bank.v1.account_rbt import Account
from reboot.bdd import parsers, then, when
from reboot.bdd.fixtures import World


@when(
    parsers.parse(
        '"{user}" does {count:d} deposits of {amount:d} on `Account` of '
        '"<{name}>"'
    )
)
async def _makes_deposits(
    world: World,
    user: str,
    name: str,
    count: int,
    amount: int,
) -> None:
    # The account is named by a saved value, the id the factory made
    # up, which the step reads from what the scenario has saved.
    context = world.context(user)
    for _ in range(count):
        await Account.ref(str(world.saved[name])).deposit(
            context,
            amount=amount,
        )
```

- Take the `world` fixture and get the context from
  `world.context(user)`, naming the user the step calls as, spelled
  in the step text the way the built-in steps spell it: a call
  starts with the user, a read with `as "alice",`. That context
  carries the token of a user the scenario declared; reach for
  `rbt.create_external_context()` only to step outside the
  scenario's identity on purpose.
- Call the generated clients directly. Never call through
  `World.call` or `World.request`; they are the built-in steps'
  internals.
- A saved value is read from `world.saved[name]`; the built-in
  substitution of `<name>` does not run on custom steps.
- A step may be `async def`; `reboot.bdd`'s `given` / `when` /
  `then` / `step` run it on the harness's event loop.
- **A fixture may save values** with `world.save('name', value)`,
  so that scenarios say `<name>`: a scripted model that learns a
  page id when a tool returns saves it for the scenario to assert
  on. Order the scenario so a step that recalls the name runs after
  the save is certain (a recall resolves when its step starts).

**Mocked externals assert through one-line custom steps.** A mock
replaces the external call in an autouse fixture, and a `Then` step
asserts on it:

```python
@pytest.fixture(autouse=True)
def send_email() -> Iterator[mock.AsyncMock]:
    with mock.patch('account_servicer.send_email') as mocked:
        yield mocked


@then('the welcome email was sent')
def _the_welcome_email_was_sent(send_email: mock.AsyncMock) -> None:
    # Reboot re-runs methods twice in development mode to validate
    # that they are idempotent, so the email sends twice.
    assert send_email.call_count == 2
```

**Model and dependency stand-ins are autouse fixtures**, and a
module's scenarios share its fixtures, so each stand-in gets a test
module of its own: an application with a scripted LLM has one
module per script, each running the feature files that script
serves.

## What Stays Outside a Feature File

A test that crashes the application in the middle of a method and
brings it back (`testing-failure-recovery.md`) is about Reboot's
recovery, not the application's behavior, and stays an
`IsolatedAsyncioTestCase` on the `Reboot()` harness
(`testing-harness.md`). Everything a user of the application can
observe belongs in a feature file.

## The Dashboard

`rbt dashboard` (the `dashboard` skill) shows the Features page:
each feature as a card with its rules and scenarios, the methods it
exercises, the methods no feature exercises, the `@wip` and
`@blocked` marks, and, for browser scenarios, the last run's video
and screenshots. Point the developer there to review scenarios; it
needs `reboot[dev]` installed.
