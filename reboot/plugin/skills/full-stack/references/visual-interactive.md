---
title: Visual and Interactive — Every Web Feature Is Seen and Handled
impact: HIGH
impactDescription: A web app's features are views a person looks at and acts on directly — a board, a timeline, a map — built in one look, with drag and drop, double-click, right-click and hover, each proven by a scenario.
tags: surface, web-app, look, design-md, tokens, drag-and-drop, gestures, scenarios
---

## Visual and Interactive

A web app built here is **highly visual and interactive**: each
feature is a view a person reads at a glance and acts on with the
pointer, not a table and a form. Tables stay for long lists that are
searched, never as a feature's main view.

### The look (the design, A3; the foundation, B1 and B7)

Two parts. **The structure comes from a look; the identity comes from
the app.** A borrowed look's palette gives an app some other product's face; the builds that read best take their colours and display face from the prompt's own words and the domain's own statuses, and read as that business.

- **The look, for structure**: pick one from
  [`looks/README.md`](looks/README.md) by its **ops fit** (staff using
  it all day take a 4 or 5; a consumer-facing app can go
  lower). It gives the type scale, spacing, radii, density, depth and
  components. Never read a look in full before it is chosen.
- **The app's palette, for identity**: from the prompt's words and
  the domain ("premium, handmade" → warm paper, deep forest, brass,
  a serif for headings; "a kids' coding club" → something else
  entirely), a small set: `canvas`, `surface`, `ink`, `ink-soft`,
  `line`, `action` (with `on-action`), `accent`, `danger`, and **one
  `status-<name>` per state the domain's things move through, named
  in its words** (`status-open`, `status-in-progress`, `status-blocked`,
  `status-done`), each distinct at a glance
  and legible on `canvas`. Optionally a `brand-display` typography
  role: a display face that fits the words, for page titles and the
  brand only.

Name both in the design in one line each, with a clause of why
("structure from flat-square-enterprise for density; a forest, paper
and brass palette with a serif for a boutique brand"); the user
changes either at "Build this design?".

In the foundation:

```sh
cp <skill>/references/looks/<look>.md DESIGN.md
```

Then `frontend/web/src/tokens.css`, written with Write from
`DESIGN.md`'s front matter: the look, in CSS. Every token becomes a
variable on `:root`, named for its key:

- each key under `colors:` → `--color-<key>`;
- each under `rounded:` → `--radius-<key>`; under `spacing:` →
  `--space-<key>`;
- each role under `typography:` → `--font-<role>` (its `fontFamily`),
  `--text-<role>` (`fontSize`), `--weight-<role>` (`fontWeight`),
  `--leading-<role>` (`lineHeight`), `--tracking-<role>`
  (`letterSpacing`);
- `color-scheme: light` on `:root` (`dark` for a dark look);
- then the look's other theme: every key of its `colors-dark:` block
  (`colors-light:` for a dark look) as the same `--color-<key>`, inside
  `@media (prefers-color-scheme: dark)` (or `light`), on `:root`, with
  its own `color-scheme`.

Values exactly as `DESIGN.md` writes them, nothing added and nothing
left out; the file is the look's, never edited afterwards.

**The app's palette** is `frontend/web/src/palette.css`, written with
Write: each colour a `--color-app-*` variable (`--color-app-action`,
`--color-app-status-blocked`) on `:root`, then the same names again
inside `@media (prefers-color-scheme: dark)` (or `light`, for a dark
look) with their other-theme values. An other-theme value keeps its
hue: a colour used for text or a mark moves in lightness until it
reads on that theme's canvas (4.5:1 for text, 3:1 for a fill); a pale
tint becomes a deep tint of the same hue, and the reverse; a label on
a fill is whichever of the theme's canvas or ink reads on it. Then in
`DESIGN.md`, at the top of the body, a `## This app` section: the
palette's names, each with both values, which role each fills (it
overrides the look's own colour roles), what each status colour
means, and `brand-display` if a display face was chosen. Only
`tokens.css` and `palette.css` carry `prefers-color-scheme`; never a
page.

`DESIGN.md` sits beside `AGENTS.md` and is the app's look from now
on; read it once, here. `tokens.css`, then `palette.css`, are
imported first in `main.tsx`; load the fonts it names from Google Fonts in
`index.html`. **Pages use only its variables**: colour from the
app's palette (`var(--color-app-action)`,
`var(--color-app-status-blocked)`), everything else from the look
(`var(--radius-md)`, `var(--space-lg)`, `var(--text-body)`): no hex
code, no pixel size of their own. **Every look defines the same
components**, by the same names: `app-masthead`, `app-nav-item`
(`-active`), `working-context`, `page-title`, `table-header`,
`table-row`, `list-row`, `board-lane`, `board-tile`, `status-pill`,
`button-primary`, `button-secondary`, `text-input`, `select`,
`field-label`, `field-error`, `card`, `dialog`, `toast`, `empty-state`,
`sign-in-panel`; a page is built from these. A component the look lacks is added
to `DESIGN.md` first, in its words, then built.

### The app shell (the foundation, B7)

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
  in the brand display face, never a blank page.

### A feature's view (the design, A1; the loop, C3)

Each feature names its **view** and its **gesture** in the design.
The view is one page of the page map, or a section of one (the
full-stack skill's A3), beside the plain pages every thing gets: a list
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

### The gesture steps (the foundation, B6)

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

### The proof (the loop, C4)

The feature's browser scenario performs its **gesture**, then asserts
what the view and the backend show:

```gherkin
When "alice" drags the "Task: Write the brief" listitem onto the "In progress" region in the web app
Then "alice" eventually sees "Write the brief" in the "In progress" region in the web app within 10 seconds
And as "alice", `get` on the `Task` for <task id> eventually has `state="in_progress"` within 10 seconds
```

The recording on the dashboard's Features page then shows the app
being handled, not forms being filled.
