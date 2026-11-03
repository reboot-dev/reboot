---
version: alpha
name: flat-square-enterprise
description: "Flat white and light-grey surfaces, charcoal ink, square corners everywhere, one saturated blue action, Source Sans with a full green-yellow-red-blue status set and compact hairline tables; suits dense operations tools, admin consoles, CRM and enterprise dashboards."

colors:
  primary: "#1777cb"
  on-primary: "#ffffff"
  ink: "#181818"
  ink-muted: "#545454"
  ink-subtle: "#8e8e8e"
  canvas: "#ffffff"
  surface-1: "#f7f7f7"
  surface-2: "#e2e2e2"
  inverse-canvas: "#181818"
  inverse-surface-1: "#282828"
  inverse-ink: "#ffffff"
  inverse-ink-muted: "#c8c8c8"
  hairline: "#e2e2e2"
  hairline-strong: "#181818"
  blue-60: "#165c9e"
  blue-80: "#0b4377"
  blue-hover: "#0669b9"
  semantic-success: "#58a135"
  semantic-warning: "#fec152"
  semantic-error: "#db2b52"
  semantic-info: "#1777cb"

colors-dark:
  primary: "#2580d5"
  ink: "#e8e8e8"
  ink-muted: "#a0a0a0"
  ink-subtle: "#676767"
  canvas: "#121212"
  surface-1: "#171717"
  surface-2: "#252525"
  inverse-canvas: "#e8e8e8"
  inverse-surface-1: "#d3d3d3"
  inverse-ink: "#121212"
  inverse-ink-muted: "#3c3c3c"
  hairline: "#252525"
  hairline-strong: "#e8e8e8"
  blue-60: "#2568ab"
  blue-80: "#35689f"
  blue-hover: "#0669b9"
  semantic-success: "#58a135"
  semantic-warning: "#fec152"
  semantic-error: "#e6385b"
  semantic-info: "#2580d5"
  on-primary: "#121212"

typography:
  display-xl:
    fontFamily: 'Source Sans 3'
    fontSize: 76px
    fontWeight: 300
    lineHeight: 1.17
    letterSpacing: -0.5px
  display-lg:
    fontFamily: 'Source Sans 3'
    fontSize: 60px
    fontWeight: 300
    lineHeight: 1.17
    letterSpacing: -0.4px
  display-md:
    fontFamily: 'Source Sans 3'
    fontSize: 42px
    fontWeight: 300
    lineHeight: 1.20
    letterSpacing: 0
  headline:
    fontFamily: 'Source Sans 3'
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: 0
  card-title:
    fontFamily: 'Source Sans 3'
    fontSize: 24px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0
  subhead:
    fontFamily: 'Source Sans 3'
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
  body-lg:
    fontFamily: 'Source Sans 3'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  body:
    fontFamily: 'Source Sans 3'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0.16px
  body-sm:
    fontFamily: 'Source Sans 3'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: 0.16px
  body-emphasis:
    fontFamily: 'Source Sans 3'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.29
    letterSpacing: 0.16px
  caption:
    fontFamily: 'Source Sans 3'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0.32px
  button:
    fontFamily: 'Source Sans 3'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: 0.16px
  eyebrow:
    fontFamily: 'Source Sans 3'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: 0.16px

rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    height: "56px"
    padding: "0 24px"
  app-nav-item:
    description: "A link in the navigation."
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    borderColor: "{colors.hairline}"
    padding: "8px 12px"
  table-row:
    description: "One row of a table."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    padding: "10px 12px"
  list-row:
    description: "One item in a list that is not a table."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    padding: "12px 16px"
  board-lane:
    description: "A column of a board."
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  status-pill:
    description: "A short status word on a tinted ground; each app status gets its own colour from the palette."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "11px 16px"
  select:
    description: "A dropdown."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  field-label:
    description: "A form field's label."
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.semantic-error}"
    typography: "{typography.body-sm}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "20px"
  toast:
    description: "A short confirmation that disappears by itself."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  empty-state:
    description: "What a list or board says when it has nothing in it yet, and how to add the first."
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# flat-square-enterprise

## Character
An app in this look is rigorous and calm: white canvas, light grey fields and bands, charcoal ink, and one saturated blue for the main action, links and focus. Every corner is square and every container is drawn with a 1px hairline or a change of surface, never a shadow. Type is Source Sans 3 with slight positive tracking on body text, light weights only at large sizes, and sentence-case labels. It is built for density: compact rows, full status colours, and a strict 4px grid.

## Color roles
- Page canvas: `{colors.canvas}`.
- Raised surface (cards, panels, drawers): `{colors.canvas}` with a `{colors.hairline}` border, or `{colors.surface-1}` for grouped bands; dark side panels `{colors.inverse-canvas}` and `{colors.inverse-surface-1}`.
- Hairline and borders: `{colors.hairline}`; strong rules and input underlines `{colors.hairline-strong}`.
- Text primary: `{colors.ink}`.
- Text secondary: `{colors.ink-muted}`.
- Text muted: `{colors.ink-subtle}`; on dark `{colors.inverse-ink-muted}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; hover `{colors.blue-hover}`; pressed `{colors.blue-80}`.
- Secondary action: `{colors.ink}` fill with `{colors.inverse-ink}`; tertiary is `{colors.primary}` text with a blue border.
- Link: `{colors.primary}`; hover `{colors.blue-60}`.
- Focus ring: 2px `{colors.primary}` outline, square.
- Selected / active: `{colors.surface-2}` row fill, or a 2px `{colors.primary}` underline on tabs.
- Error: `{colors.semantic-error}`; destructive buttons use it as fill.

**Status accents**
- Good / done: `{colors.semantic-success}`.
- Attention / warning: `{colors.semantic-warning}` as a fill or icon behind `{colors.ink}` text (too light for text on white).
- Problem / failed: `{colors.semantic-error}`.
- In progress / info: `{colors.semantic-info}`.
- Neutral / draft: `{colors.ink-subtle}` on `{colors.surface-1}`.

## Type roles
- Page title: `{typography.headline}` (32px).
- Section heading: `{typography.card-title}` (24px), or `{typography.subhead}` for lighter sections.
- Item / card title: `{typography.body-emphasis}`.
- Body: `{typography.body-sm}` in tables and lists; `{typography.body}` in forms and detail panes.
- UI label: `{typography.button}` for buttons; `{typography.eyebrow}` for sentence-case group labels.
- Caption / meta: `{typography.caption}`.
- Numbers: `{typography.body-sm}` with `tabular-nums` (Source Sans 3 has tabular figures).
- `{typography.display-xl}` (76px) and `{typography.display-lg}` (60px) are for a rare headline figure only, never page titles; `{typography.display-md}` suits a single KPI value.

## Shape and density
- Controls, cards, panels: `{rounded.none}`.
- Small badges: `{rounded.xs}`; dropdown menus `{rounded.sm}`; status pills `{rounded.pill}`; avatars `{rounded.full}`.
- Rhythm: `{spacing.xxs}` and `{spacing.xs}` inside controls, `{spacing.md}` to `{spacing.lg}` inside cards, `{spacing.lg}` between panels, `{spacing.xxl}` between page regions.
- Tables: 32px compact, 40px default and 48px tall rows; `{spacing.xs}` by `{spacing.md}` cell padding; `{colors.hairline}` row rules; optional `{colors.surface-1}` zebra.
- Boards and lists: cards `{spacing.xs}` apart, columns separated by a hairline.
- Depth: surface change and hairlines; a light shadow only on menus and dialogs.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface-1` ground, `ink` text, `hairline` edge, `body` type.
- `app-nav-item`: a link in the navigation. `ink-muted` text, `sm` corners, `body` type.
- `app-nav-item-active`: the page you are on. `surface-1` ground, `ink` text, `sm` corners, `body` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface-2` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `display-md` type.
- `table-header`: a table's column headings. `surface-2` ground, `ink-muted` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `board-lane`: a column of a board. `surface-2` ground, `ink-muted` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface-1` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface-1` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `none` corners, `button` type.
- `button-secondary`: every other action. `ink` ground, `inverse-ink` text, `none` corners, `button` type.
- `text-input`: a form field. `surface-1` ground, `ink` text, `none` corners, `body` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `field-label`: a form field's label. `ink-muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `semantic-error` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-1` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `dialog`: a box over the page that asks for one decision. `surface-1` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `ink-muted` text, `hairline` edge, `lg` corners, `body` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-1` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.

## Do / Don't
**Do**
- Keep every control and container square.
- Use the full status set (green, yellow, red, blue) with an icon and label.
- Run tables at compact density with tabular figures.
- Separate regions with hairlines and the grey surface.
- Keep labels and headings in sentence case.

**Don't**
- Don't round buttons, inputs or cards.
- Don't use blue for status or decoration beyond actions, links and focus.
- Don't set yellow text on white; use it as a fill or icon.
- Don't add drop shadows to cards.
- Don't set page titles in the 60px or 76px display styles.
