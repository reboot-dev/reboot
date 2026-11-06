---
title: Visual and Interactive — Every Web Feature Is Seen and Handled
impact: HIGH
impactDescription: A web app's features are views a person looks at and acts on directly — a board, a timeline, a map — built on the app's tokens, with drag and drop, double-click, right-click and hover, each proven by a scenario.
tags: surface, web-app, tokens, drag-and-drop, gestures, scenarios
---

## Visual and Interactive

A web app built here is **highly visual and interactive**: each
feature is a view a person reads at a glance and acts on with the
pointer, not a table and a form. Tables stay for long lists that are
searched, never as a feature's main view.

### The tokens (at the scaffold)

The app's design tokens are written once, in the foundation, and
pages use only them: `frontend/web/src/tokens.css`, written with
Write, every value a variable on `:root`:

- colour: `--color-canvas`, `--color-surface`, `--color-ink`,
  `--color-ink-soft`, `--color-line`, `--color-action` (with
  `--color-on-action`), `--color-danger`, and **one
  `--color-status-<name>` per state the domain's things move through,
  named in its words** (`--color-status-blocked`), each distinct at a
  glance and legible on the canvas;
- shape and space: `--radius-sm`, `--radius-md`, `--radius-lg`, and
  `--space-xs` to `--space-xl`;
- type: `--font-body` and `--font-display` (system faces), and
  `--text-sm` to `--text-xl`.

Plain and neutral: one action colour, and no theme beyond these.
`tokens.css` is imported first in `main.tsx`. **Pages use only its
variables**: no hex code, no pixel size of their own.

### The app shell (at the scaffold)

Every page sits in one shell, built before any page:

- **A masthead**: a brand mark and the app's name, with one context
  line under it ("12 projects · Operations"); the **navigation**, one
  link per top-level page of the page map, the current one marked
  (`aria-current="page"`); and on the right **the app's working
  context**, the control every page reads (a business date, a store's location, a team's week), then the user and sign-out.
- **The working context is the shell's, not a page's**: set once in
  the masthead, passed to every page; a page never asks for it again.
- **Sign-in is its own screen** in the app's identity (its name, one
  line of what it is for, one button), not a bare button.
- Loading and unavailable states are the shell's too: one calm line
  in the display face, never a blank page.

### A feature's view (the design, and the frontend build)

Each feature names its **view** and its **gesture** in the design.
The view is one page of the page map, or a section of one (the
frontend skill's "The page map"), beside the plain pages every thing gets: a list
that searches, a detail page at its own URL, a creation flow. The
gesture speeds up an action the view's buttons and menus already
offer; it is never the only way to act:

| the feature's things | its view | its gesture |
| --- | --- | --- |
| have a status that changes (tasks, tickets, orders) | a **board**: a tile per thing, coloured by status, grouped by where it is | drag a tile to another column; click to act |
| happen in time (bookings, shifts, deliveries) | a **timeline** or **calendar**: a bar per thing across days and lanes | drag a bar to another lane or day |
| have a place (seats, tables, desks) | a **plan**: the place drawn, things on it | drag onto a spot; hover for detail |
| are people (customers, members) | **cards** with a face or initials and what matters now | hover for a card, double-click to open |
| are numbers over time (revenue, sign-ups) | a **chart** with the figure that matters large | hover a point for its value |

Every view: state changes animate (a 150–200 ms transition on
colour, position and size); an empty view says what to do first;
another person's change appears live (a reactive reader re-renders;
never a refresh button). A right-click (or a "⋯" button, the same
menu) lists the actions on a thing.

### Gestures that work in a browser and in a scenario

- **Drag and drop is native HTML5**: the thing `draggable` with
  `onDragStart` setting its id on `dataTransfer`; the target's
  `onDragOver` calling `preventDefault()` and its `onDrop` calling
  the mutation. No drag library: the scenario's drag drives the
  browser's own events.
- **Every gesture has a click path too** (a "Move to…" menu item, an
  "Open" button), for the keyboard and for anyone who cannot drag.
- **Named for the scenario**: a thing that is dragged or
  double-clicked is a `listitem` (or `button`) whose `aria-label` is
  its kind and name (`aria-label="Task: Write the brief"`); a drop
  target is a `region` (`<section aria-label="In progress">`) named for
  where it is; a right-click menu is a `menu` of `menuitem`s.

### The gesture steps (before the first browser scenario)

The built-in web steps click, fill, select and press; these gestures
are the app's own (and a fifth that looks inside a region), in
`tests/conftest.py`, so every feature file can use
them:

```python
from playwright.sync_api import expect
from reboot.bdd import parsers, then, when
from reboot.bdd.web import WebApp

ROLE = r'"(?P<name>[^"]+)" (?P<role>[a-z]+)'


def _element(web_app: WebApp, user: str, role: str, name: str):
    return web_app.page(user=user).get_by_role(role, name=name, exact=True)


@when(parsers.re(r'"(?P<user>[^"]+)" drags the ' + ROLE +
                 r' onto the "(?P<target>[^"]+)" (?P<target_role>[a-z]+) in the web app'))
def _drags(web_app: WebApp, user: str, name: str, role: str,
           target: str, target_role: str) -> None:
    _element(web_app, user, role, name).drag_to(
        _element(web_app, user, target_role, target))


@when(parsers.re(r'"(?P<user>[^"]+)" double-clicks the ' + ROLE + r' in the web app'))
def _double_clicks(web_app: WebApp, user: str, name: str, role: str) -> None:
    _element(web_app, user, role, name).dblclick()


@when(parsers.re(r'"(?P<user>[^"]+)" right-clicks the ' + ROLE + r' in the web app'))
def _right_clicks(web_app: WebApp, user: str, name: str, role: str) -> None:
    _element(web_app, user, role, name).click(button="right")


@when(parsers.re(r'"(?P<user>[^"]+)" hovers over the ' + ROLE + r' in the web app'))
def _hovers(web_app: WebApp, user: str, name: str, role: str) -> None:
    _element(web_app, user, role, name).hover()


# Text inside a region, list item or menu: roles the built-in `sees`
# step does not take (it takes button, link, tab, checkbox, radio,
# menuitem, option, row and table), so the two never both match.
@then(parsers.re(r'"(?P<user>[^"]+)" eventually sees "(?P<text>[^"]+)" in the '
                 r'"(?P<name>[^"]+)" (?P<role>region|listitem|list|group|menu|dialog|gridcell) '
                 r'in the web app within (?P<seconds>\d+) seconds'))
def _sees_in_region(web_app: WebApp, user: str, text: str, name: str,
                    role: str, seconds: str) -> None:
    expect(_element(web_app, user, role, name)).to_contain_text(
        text, timeout=int(seconds) * 1000)
```

Their user and names are plain text (no `<saved value>`; a custom
step gets no substitution). Their roles are any ARIA role, not only
the built-in steps' list.

### The proof (the browser scenarios)

The feature's browser scenario performs its **gesture**, then asserts
what the view and the backend show:

```gherkin
When "alice" drags the "Task: Write the brief" listitem onto the "In progress" region in the web app
Then "alice" eventually sees "Write the brief" in the "In progress" region in the web app within 10 seconds
And as "alice", `get` on the `Task` for <task id> eventually has `state="in_progress"` within 10 seconds
```

The recording on the dashboard's Features page then shows the app
being handled, not forms being filled.
