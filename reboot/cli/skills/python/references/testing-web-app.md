---
title: Drive the Web App from Scenarios
impact: MEDIUM
impactDescription: A user-facing flow that is only tested at the backend leaves the page, the session cookie, and CORS untested; a page without accessible markup cannot be driven at all
tags: testing, bdd, web-app, playwright, frontend, vite, aria, accessible-name, recordings, sign-in
---

## Drive the Web App from Scenarios

> **Critical:** the web app steps find things the way a person
> does: a button by what it says, a field by its label, a table by
> its caption. They never take a CSS selector. A page the steps
> cannot find things on has an accessibility bug, and the fix is in
> the markup, not in the scenario.

A scenario opens the application's web app in a real browser, run
through Playwright, against the same backend its backend steps call.
Backend steps and web app steps mix in one scenario, so a scenario
can set up through the API, act in the browser, and assert on
state:

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

`testing-features.md` covers the backend steps and the shape of a
feature; this reference covers what the browser adds. The
[`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic)
example's `tests/web_test.py` and the scenarios of its
`opening_accounts.feature`, `transfers.feature`, and
`sign_in.feature` are the reference.

## What the Project Installs

Add Playwright to the dev group next to `reboot[dev]`, then install
a browser once:

```toml
[dependency-groups]
dev = [
    "reboot[dev]==<version>",
    "playwright>=1.55.0",
    "pytest-playwright>=0.7.1",
    ...
]
```

```sh
uv sync
uv run playwright install chromium
cd frontend && npm install   # the web app's own dependencies
```

With `playwright` and `pytest-playwright` present, the `reboot`
pytest plugin registers the web app steps and records every browser
scenario; without them the backend steps still work.

## The `frontend` Fixture and the Application

Each scenario serves the web app fresh, once its backend is up. A
project with a Vite project under its root defines the `frontend`
fixture with `reboot.bdd.vite.vite` and the directory:

```python
import pytest
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from reboot.bdd import scenarios
from reboot.bdd.frontend import Frontend
from reboot.bdd.vite import vite
from typing import Iterator


@pytest.fixture
def frontend() -> Iterator[Frontend]:
    with vite(directory='frontend') as frontend:
        yield frontend


@pytest.fixture
def application(frontend: Frontend) -> Application:
    # A web app calls the backend from its own origin.
    assert frontend.origin is not None
    development = Development()
    return Application(
        servicers=[...],
        # The harness is neither `rbt dev run` nor `rbt serve`, so
        # name the Development picker for both.
        oauth=OAuth(
            provider=OAuthProviderByEnvironment(
                dev=development,
                prod=development,
            ),
            # The app's origin is the only one Envoy lets read
            # `/whoami` cross-origin, as a deployment lists its host.
            allowed_origins=[frontend.origin],
        ),
    )


scenarios('opening_accounts.feature', 'transfers.feature', 'sign_in.feature')
```

The app is served the way it is deployed: from its own origin (a
Vite dev server on `localhost`), calling the backend cross-origin at
its `127.0.0.1` address. The browser treats those as different
sites, so the session cookie, the `whoami` probe, and Envoy's CORS
allow-list are exercised the way production exercises them. The
`application` fixture takes `frontend` so the app can allow that
origin.

A project that serves its web app some other way defines
`frontend` against its own `Frontend` subclass. A mobile app or an
MCP host would get its own phrase against its own fixture; `in the web app` always means this one.

## The Steps

Every step names the user acting, a user the scenario declared.
**Each user gets a browser of their own**, so two users can be in
the app in one scenario.

| Step                                                                          | What it does                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `"alice" opens the web app`                                                   | Opens the app's origin in alice's browser (`at "/path"` for another page) |
| `"alice" clicks the "Open Account" button in the web app`                     | Clicks the element of that role and accessible name                       |
| `"alice" fills "Amount ($)" in the web app with `250``                        | Fills the field with that label                                           |
| `"alice" selects "<first account id>" in "From Account" in the web app`       | Picks an option in the select with that label                             |
| `"alice" checks "Remember me" in the web app` / `unchecks`                    | Sets the checkbox with that label                                         |
| `"alice" presses "Enter" in the web app`                                      | Presses a key in the focused element                                      |
| `"alice" sees "$1000" in the web app`                                         | Asserts the text is visible now                                           |
| `"alice" sees "$1000" in the "Your Accounts" table in the web app`            | Asserts the text within that element                                      |
| `"alice" eventually sees "$1000" in the web app within 10 seconds`            | Waits for the text, at most that long                                     |
| `"alice" does not see "<carol account id>" in the web app`                    | Asserts the text is absent                                                |
| `"alice" sees the "Sign in" button in the web app is enabled` / `is disabled` | Asserts the element's state                                               |
| `"alice" sees the web app at "/accounts"`                                     | Asserts the page's path                                                   |
| `"alice" saves the text of the "account-id" element in the web app as "id"`   | Reads an element by test id into a saved value                            |
| `"bob" is signed in to the web app with their user id saved as "bob id"`      | Binds bob's browser session to bob (below)                                |
| `"bob" is signed out of the web app`                                          | Waits for bob's session to end (below)                                    |

- The **roles** a step may name are a closed list: `button`,
  `link`, `tab`, `checkbox`, `radio`, `menuitem`, `option`, `row`,
  `table`. The name is the element's accessible name, matched
  exactly.
- **Quoted text may say `<name>`** for a saved value: `sees "<alice account id>" in the "Your Accounts" table`.
- `eventually sees` takes `within`; `sees` looks now and takes
  none. A backend change the page shows after a reactive read is
  always `eventually`.
- The one step that reads a value out of the page, `saves the text of the "..." element`, names it by `data-testid`; nothing else
  does.

## Signing In Is Clicked Through, Then Bound

An unauthenticated user signs in the way a person does, and then a
binding step ties their browser's session to their name:

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
  And as "ben", `balances` on the `User` for "<ben user id>" aborts with `Unauthenticated`
```

- The Development picker lists its accounts as links named by
  identity, so `clicks the "Ben" link` picks one. A custom identity
  provider's login page is driven with the same generic steps; only
  the binding step is Reboot's.
- `is signed in to the web app` waits for the browser to come back
  to the app and asks the backend who the session is; from then on
  `as "ben",` backend steps call as the signed-in user, and `<ben user id>` is their opaque id. The `with their user id saved as`
  part is optional.
- `is signed out of the web app` waits for the session to end and
  returns the user to calling with no token.
- A scenario that does not test sign-in itself declares its people
  with `is an authenticated user`; their browsers arrive signed in.

## The App Must Have Accessible Markup

The steps locate elements through the accessibility tree, so the
page has to expose one. What the steps need, and what the React
code must therefore do:

- **A field's label is paired with it.** `<label htmlFor="amount">`
  with `<input id="amount">`, or the input nested inside the label.
  `fills "Amount ($)"` finds the input through that pairing; a
  placeholder or a heading beside the field does not count.
- **A button, link, tab, or menu item says what it does** in its
  text, or in `aria-label` when it is only an icon. `clicks the "Sign out" button` matches that text exactly.
- **A table, list, or region that a step names has a caption or a
  labelled heading:** `<table aria-labelledby="your-accounts">`
  with `<h2 id="your-accounts">Your Accounts</h2>`, or a
  `<caption>`. `sees "$1000" in the "Your Accounts" table` looks
  only inside it.
- **A select is a `<select>` with a paired label**, and its
  `<option>`s say the value a scenario would pick, such as the
  account id.
- **A value a scenario needs to read back** (an id the app made up)
  carries `data-testid`, on the element whose text is exactly that
  value. This is the only place a test id belongs; a button with a
  test id is a button without a name.
- **Text that changes on a backend event** (a balance, a status)
  must be rendered as text the page shows, not only as an attribute
  or a canvas.

Build the page with these from the start, whether or not a scenario
drives it yet: they are the same properties a screen reader needs.

## Recordings

Every browser scenario is recorded: a video of each user's browser
and a screenshot after the step that opened the app for them and
after each assertion step, with the asserted element scrolled into
view and outlined. They land beside the feature file:

```
tests/opening_accounts.feature
tests/opening_accounts.recordings/
  opening-a-first-account-in-the-web-app/
    3f9c2a1b7d4e6f80/
      alice.webm
      2.png
      5.png
```

- The directory under the scenario's is named by a digest of what
  the scenario runs (its name, background steps, steps, examples),
  so recordings of an older version of the scenario are
  recognizable as stale, and a run keeps only the current one. An
  outline's examples all write the same files, so the last
  example's are kept.
- **`*.recordings/` is in `.gitignore`**: running the tests makes
  them, and the dashboard's Features page shows the last run's, a
  video link per user and a gallery of screenshots on the feature's
  page. A browser scenario with no recordings shows "not recorded
  yet", with a copy button beside the scenario's name to hand to
  whoever runs the tests.
- The browser is paced so the video can be followed:
  `--recording-slowmo` (milliseconds after each browser operation,
  default 500) and `--recording-dwell` (how long an assertion's
  result stays on screen, default 1000); `0` for either turns that
  pacing off. Only the browser is paced; the page and the backend
  run at full speed.

## Running

```sh
uv run pytest tests/web_test.py
uv run pytest tests/web_test.py -k "first account"
uv run pytest tests/web_test.py --recording-slowmo=0 --recording-dwell=0
```

A CI script without a browser or `node_modules` runs the backend
suite with `--ignore=tests/web_test.py`, as the bank's
`.tests/test.sh` does.
