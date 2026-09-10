# Specify your application with features

The behavior of a Reboot application is written down as **feature
files**: Gherkin `.feature` files in `backend/tests/` that describe,
in sentences, what someone can do with the application and what
happens when they do. One file is three things at once:

- the **specification** you and your coding agent agree on before
  the code is written, and review afterwards;
- the **tests**: `pytest` runs every scenario against your
  application, through built-in steps that know how to call it;
- what the [developer dashboard](/rbt_cli)'s Features page shows:
  each feature with its rules and scenarios, the methods it
  exercises, and recordings of the scenarios that drive your web
  app.

This page is about writing them. For the test harness underneath,
and for tests that a scenario cannot express, see
[Test your application](/testing).

## A feature file

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/withdrawals.feature) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/withdrawals.feature -->

```gherkin
Feature: Customers can withdraw from an account
  A customer takes money out of an account, but never more than the
  account holds.

  Background:
    Given the application is up
    And "anonymous" is an unauthenticated user

  Scenario: Withdrawing part of the balance leaves the rest
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "account id"
    When "anonymous" does a `deposit` with `amount=100.0` on `Account` of "<account id>"
    And "anonymous" does a `withdraw` with `amount=40.0` on `Account` of "<account id>"
    Then as "anonymous", `balance` on the `Account` for "<account id>" has `amount=60.0`

  Rule: Overdrafts are refused
    An account never goes below zero: a withdrawal for more than the
    balance aborts, saying by how much it fell short.

    Scenario Outline: Withdrawing more than the balance aborts with the shortfall
      Given "anonymous" creates an `Account` via `open`
      And the resulting state id is saved as "account id"
      When "anonymous" does a `deposit` with `amount=<deposit>` on `Account` of "<account id>"
      And "anonymous" attempts a `withdraw` with `amount=<withdrawal>` on `Account` of "<account id>"
      Then the attempt aborts with `OverdraftError` with `amount=<shortfall>`

      Examples:
        | deposit | withdrawal | shortfall |
        | 0.0     | 50.50      | 50.50     |
        | 20.0    | 50.50      | 30.50     |
```

<!-- MARKDOWN-AUTO-DOCS:END -->

- A **feature** is one capability, named as a sentence about the
  activity, with a paragraph saying what it is for. One file per
  capability, named for it: `withdrawals.feature`,
  `transfers.feature`. Not `account.feature`: that names a state
  type, and the dashboard already indexes those.
- A **rule** is a business invariant the capability obeys, the kind
  you would want to verify formally: a balance never goes below
  zero; money is conserved by a transfer; a customer sees only their
  own accounts. State it once, in the rule's name and description.
  A scenario that only shows what an operation does needs no rule
  around it and sits at the feature's top level.
- A **scenario** is one concrete example, named for the situation,
  not the rule again. A `Scenario Outline` with an `Examples` table
  runs the same example at several values.
- The **background** is what every scenario starts from.

## Setting up

Install the `reboot[dev]` extra, at the same version as `reboot`,
in your development environment; it carries what the built-in steps
and the dashboard's Features page run on. With `uv`:

```toml
[project]
dependencies = [
    "reboot==<version>",
]

[dependency-groups]
dev = [
    "reboot[dev]==<version>",
    "pytest>=7.4.2",
]
```

An application packaged for `rbt serve` installs plain `reboot`.
`rbt dashboard` refuses to start without the extra, and
`rbt dev run` says so.

Then, beside your feature files, a test module that says which
application they run against:

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/interest_test.py&lines=5-22) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/interest_test.py -->

```py
import pytest
from account_servicer import AccountServicer
from bank_servicer import BankServicer
from customer_servicer import CustomerServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios
from reboot.std.collections.v1.sorted_map import sorted_map_library


@pytest.fixture
def application() -> Application:
    return Application(
        servicers=[AccountServicer, BankServicer, CustomerServicer],
        libraries=[sorted_map_library()],
    )


scenarios('interest.feature')
```

<!-- MARKDOWN-AUTO-DOCS:END -->

The `application` fixture returns the `Application` the scenarios
run against, the same one your `main.py` builds, or a variant: the
bank's `full_bank_test.py` runs most of its features against
servicers with authorizers and interest turned off, and
`interest_test.py` runs `interest.feature` against one with
interest on. `scenarios(...)` names the feature files. Nothing
imports the steps: `reboot[dev]` registers them with `pytest`.

Run the suite with `pytest`, one scenario with `pytest -k "part of its name"`, and what is being worked on with `pytest -m wip`.

## Who calls

Every scenario declares its people, and every step that calls says
who:

```gherkin
Given "alice" is an authenticated user
And "admin" has the bearer token "secret-admin-token"
And "bob" is an unauthenticated user
```

`is an authenticated user` mints a token for that user through the
same path a real sign-in takes, so your [`User`](/users/overview)
for them is auto-constructed, and your
[authorizers](/users/authorization) see a real caller. `has the bearer token` names someone by a raw token your own
[`TokenVerifier`](/users/tokens) accepts. `is an unauthenticated user` declares someone whose calls carry no token.

A call starts with the user, and a read starts with `as "alice",`.
There is no current user and no anonymous call; a scenario with one
unauthenticated caller names them `"anonymous"`.

## Calling, saving, and asserting

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/opening_accounts.feature&lines=17-25) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/opening_accounts.feature -->

```gherkin
Scenario: Opening an account with a deposit
  Given "anonymous" is an unauthenticated user
  And "anonymous" creates a `Bank` via `create`
  And the resulting state id is saved as "bank id"
  And "anonymous" does a `sign_up` with `customer_id="ann@example.com"` on `Bank` of "<bank id>"
  When "anonymous" does an `open_account` with `initial_deposit=100.0` on `Customer` of "ann@example.com"
  And the resulting `account_id` is saved as "account id"
  Then as "anonymous", `balance` on the `Account` for "<account id>" has `amount=100.0`
```

<!-- MARKDOWN-AUTO-DOCS:END -->

- **`creates`** calls a factory. Leave the id out and the factory
  makes one up; save it on the next line with
  `the resulting state id is saved as "bank id"`, and say
  `<bank id>` from then on. Give an id only when it means something
  to the application:

  ```gherkin
  Given "alice" creates an `Account` of "alice" via `open`
  ```

- **`does`** calls a writer, transaction, or workflow. The request's
  properties come right after the method, as `path=value` pairs in
  backticks, joined by `and`. Values are JSON (with JSON5's
  leniencies), and a dotted path nests:

  ```gherkin
  When "alice" does a `set_owner` with `owner={name: "Frank", tags: ["vip"]}` on `Account` of "<account id>"
  And "alice" does a `set_owner` with `owner.name="Frankie"` and `owner.tags=["pro"]` on `Account` of "<account id>"
  ```

- **A call does one thing; its result is saved on the next line:**
  `` the resulting `account_id` is saved as "account id" ``. A saved
  name is a quoted string and may have spaces.
- **`has`** reads and asserts. A path reaches into the response, and
  two more predicates say a length and a containment (a substring
  of a string, an element of a list, or a key of a map). A reader
  that takes properties is given them after the method, the way a
  call is:

  ```gherkin
  Then as "alice", `balances` on the `Customer` for "ann@example.com" has `balances` of length `1` and `balances[0].balance=25.0`
  And as "anonymous", `all_customer_ids` on the `Bank` for "<bank id>" has `customer_ids` containing `"alice"`
  And as "alice", `has_at_least` with `amount=50` on the `Account` for "<account id>" has `enough=true`
  ```

- **`the result has`** asserts on the last call's response:
  `` the result has `updated_balance=150` ``.

To wait for something asynchronous, a [task](/tasks), a scheduled
call, a workflow, read reactively with a bound. Never sleep:

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/interest.feature&lines=13-16) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/interest.feature -->

```gherkin
Scenario: A new account earns its first period's interest
  Given "anonymous" creates an `Account` via `open`
  And the resulting state id is saved as "account id"
  Then as "anonymous", `balance` on the `Account` for "<account id>" eventually has `amount=1.0` within 10 seconds
```

<!-- MARKDOWN-AUTO-DOCS:END -->

## Errors, attempts, and tasks

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/withdrawals.feature&lines=16-31) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/withdrawals.feature -->

```gherkin
Rule: Overdrafts are refused
  An account never goes below zero: a withdrawal for more than the
  balance aborts, saying by how much it fell short.

  Scenario Outline: Withdrawing more than the balance aborts with the shortfall
    Given "anonymous" creates an `Account` via `open`
    And the resulting state id is saved as "account id"
    When "anonymous" does a `deposit` with `amount=<deposit>` on `Account` of "<account id>"
    And "anonymous" attempts a `withdraw` with `amount=<withdrawal>` on `Account` of "<account id>"
    Then the attempt aborts with `OverdraftError` with `amount=<shortfall>`

    Examples:
      | deposit | withdrawal | shortfall |
      | 0.0     | 50.50      | 50.50     |
      | 20.0    | 50.50      | 30.50     |
```

<!-- MARKDOWN-AUTO-DOCS:END -->

`attempts` makes a call that may abort, and `the attempt aborts with` names the declared [error](/errors) and, optionally, its
properties. A reader's abort is asserted on the read:

```gherkin
Then as "bob", `balance` on the `Account` for "ghost" aborts with `StateNotConstructed`
```

An error your servicer raises without declaring it, a `ValueError`
say, aborts with `Unknown`; asserting that is possible, but
declaring the error is better.

`spawns` runs a call as a [task](/tasks); the next line saves the
task's id, and `awaits` waits for it, after which `the result has`
asserts on its response:

```gherkin
When "anonymous" spawns a `deposit` with `amount=15` on `Account` of "<account id>"
And the resulting task id is saved as "first"
Then "anonymous" awaits the `deposit` task "<first>" on `Account` within 30 seconds
And the result has `updated_balance=15`
```

## Work in progress and blocked scenarios

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/sign_up.feature&lines=16-29) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/sign_up.feature -->

```gherkin
Rule: A user signs up once
  Signing up under a customer id the bank already knows is refused,
  so no customer is ever counted twice.

  @blocked
  Scenario: Signing up twice under the same id
    The bank does not refuse a second sign-up yet: the customer's
    factory aborts with `StateAlreadyConstructed`, which the bank
    lets surface as `Unknown`. This waits for a declared error.

    Given "anonymous" does a `sign_up` with `customer_id="ann@example.com"` on `Bank` of "<bank id>"
    When "anonymous" attempts a `sign_up` with `customer_id="ann@example.com"` on `Bank` of "<bank id>"
    Then the attempt aborts with `AlreadySignedUp`
    And as "anonymous", `all_customer_ids` on the `Bank` for "<bank id>" has `customer_ids` of length `1`
```

<!-- MARKDOWN-AUTO-DOCS:END -->

- **`@wip`** on a feature, rule, or scenario marks it as being
  worked on. It runs as usual; the dashboard shows it in green and
  can filter to it, so what is new is easy to find. A coding agent
  puts it on a whole new feature, moves it down to rules and
  scenarios as they are written, and asks you before taking it off.
- **`@blocked`** on a scenario says the application cannot pass it
  yet, or that a person has to do something first. The paragraph
  under the `Scenario:` line says why; the scenario is skipped with
  that reason, and the dashboard shows it in red.

## Driving your web app

A scenario can open your web app in a real browser, driven with
[Playwright](https://playwright.dev), against the same backend its
other steps call:

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/opening_accounts.feature&lines=27-35) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/opening_accounts.feature -->

```gherkin
Scenario: Opening a first account in the web app
  Given "alice" is an authenticated user
  When "alice" opens the web app
  Then "alice" sees "Signed in as alice" in the web app
  When "alice" fills "Initial Deposit ($)" in the web app with `1000`
  And "alice" clicks the "Open Account" button in the web app
  Then "alice" eventually sees "$1000" in the "Your Accounts" table in the web app within 10 seconds
  When "alice" saves the text of the "account-id" element in the web app as "account id"
  Then as "alice", `balance` on the `Account` for "<account id>" has `amount=1000.0`
```

<!-- MARKDOWN-AUTO-DOCS:END -->

Each user gets a browser of their own, so two users can be in the
app in one scenario. The steps name things the way a person does:
a button, link, tab, checkbox, radio, menu item, option, row, or
table by what it says, and a field by its label. They never take a
selector, so your app needs accessible markup: a `<label htmlFor>`
paired with each input, buttons that say what they do, a table with
a labelled heading. The one step that reads a value out of the
page, `saves the text of the "account-id" element`, names it by
`data-testid`.

Quoted text may say `<name>` for a saved value. `eventually sees ... within 10 seconds` waits; `sees` looks now; `does not see`
asserts absence.

Signing in is clicked through the app like a person would, and
then bound to the user:

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/sign_in.feature&lines=17-30) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/sign_in.feature -->

```gherkin
Scenario: Signing in and out with the Development picker
  Given "ben" is an unauthenticated user
  When "ben" opens the web app
  And "ben" clicks the "Sign in" button in the web app
  And "ben" clicks the "Ben" link in the web app
  Then "ben" is signed in to the web app with their user id saved as "ben user id"
  When "ben" fills "Initial Deposit ($)" in the web app with `500`
  And "ben" clicks the "Open Account" button in the web app
  Then "ben" eventually sees "$500" in the "Your Accounts" table in the web app within 10 seconds
  And as "ben", `balances` on the `User` for "<ben user id>" eventually has `balances` of length `1` and `balances[0].balance=500.0` within 10 seconds
  When "ben" clicks the "Sign out" button in the web app
  Then "ben" is signed out of the web app
  And "ben" sees the "Sign in" button in the web app is enabled
  And as "ben", `balances` on the `User` for "<ben user id>" aborts with `Unauthenticated`
```

<!-- MARKDOWN-AUTO-DOCS:END -->

From `is signed in to the web app` on, `as "ben",` calls as the
signed-in user, and `<ben user id>` is their opaque id.

To serve the app, add `playwright` and `pytest-playwright` to your
dev dependencies, run `playwright install chromium` once, and give
the test module a `frontend` fixture. For a Vite project:

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/web_test.py&lines=34-37) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/web_test.py -->

```py
@pytest.fixture
def frontend() -> Iterator[Frontend]:
    with vite(directory='frontend') as frontend:
        yield frontend
```

<!-- MARKDOWN-AUTO-DOCS:END -->

The app is served from its own origin, calling the backend
cross-origin, so the session cookie and CORS are exercised the way
a deployment exercises them; the `application` fixture takes the
`frontend` and allows its origin:

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../reboot/examples/bank-pydantic/backend/tests/web_test.py&lines=50-78) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank-pydantic/backend/tests/web_test.py -->

```py
@pytest.fixture
def application(frontend: Frontend) -> Application:
    # A web app calls the backend from its own origin.
    assert frontend.origin is not None
    development = Development()
    return Application(
        servicers=[
            AccountServicerWithNoInterest,
            BankServicer,
            CustomerServicer,
            UserServicer,
        ],
        libraries=[sorted_map_library()],
        # Signing in constructs the user's `User`, which signs them up
        # with the bank `initialize` creates.
        initialize=initialize,
        # The app's origin is the only one Envoy lets read `/whoami`
        # cross-origin, as a deployment would list its web host.
        oauth=OAuth(
            provider=OAuthProviderByEnvironment(
                dev=development,
                prod=development,
            ),
            allowed_origins=[frontend.origin],
        ),
    )


scenarios('opening_accounts.feature', 'transfers.feature', 'sign_in.feature')
```

<!-- MARKDOWN-AUTO-DOCS:END -->

### Recordings

Every browser scenario is recorded: a video of each user's browser
and a screenshot after each assertion step, with the asserted
element outlined. They land in `<feature>.recordings/` beside the
feature file, under a directory named for the scenario and a digest
of its steps, so recordings of an older version of a scenario are
recognizable as stale. Add `*.recordings/` to your `.gitignore`:
running the tests makes them, and the dashboard's Features page
shows the last run's. A scenario with no recordings yet shows "not
recorded yet" there, with a button that copies its name for whoever
runs the tests. `--recording-slowmo` and `--recording-dwell`
(milliseconds) pace the browser so a video can be followed; `0`
turns either off.

## Custom steps

A step the built-in ones cannot say is a plain Reboot call. Take
the `world` fixture, get a context for the user the step names
with `world.context(user)`, which carries that user's token, and
call the generated clients:

<!-- MARKDOWN-AUTO-DOCS:START (CODE:src=../../tests/reboot/bdd/bdd_tests.py&lines=73-93) -->
<!-- The below code snippet is automatically added from ../../tests/reboot/bdd/bdd_tests.py -->

```py
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

<!-- MARKDOWN-AUTO-DOCS:END -->

A step may be `async def`. A saved value is read from
`world.saved[name]`, and a fixture can save one with
`world.save(name, value)` for scenarios to say as `<name>`. An
external service you mock in an autouse fixture is asserted through
a one-line custom step, `Then the welcome email was sent`.
