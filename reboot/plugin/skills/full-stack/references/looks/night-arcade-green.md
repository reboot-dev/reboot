---
version: alpha
name: night-arcade-green
description: "Dense near-black shell with one flat dark-grey surface step, heavy compact Inter, a vivid green main action and an electric blue second; suits live dashboards, media and event consoles, and dark operations tools."

colors:
  primary: "#49a92e"
  secondary: "#0f7dd1"
  on-primary: "#ffffff"
  canvas: "#121213"
  surface: "#2c2e33"
  hairline: "#2b2d31"
  ink: "#eef0f3"
  muted: "#949eac"
  faint: "#51555d"
  black: "#000000"

colors-light:
  primary: "#3f9f22"
  secondary: "#1f77c2"
  canvas: "#fafafb"
  surface: "#d1d3da"
  hairline: "#d2d5da"
  ink: "#191b1d"
  muted: "#545d6a"
  faint: "#a1a5ae"
  black: "#fcfcfc"
  on-primary: "#191b1d"

typography:
  display:
    fontFamily: 'Inter'
    fontSize: 33px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: 0
  heading:
    fontFamily: 'Inter'
    fontSize: 20px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 0
  title:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  body:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  ui:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  caption:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 12px
  card: 16px
  full: 999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
  xxxl: 32px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    height: "56px"
    padding: "0 24px"
  app-nav-item:
    description: "A link in the navigation."
    textColor: "{colors.muted}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
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
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  status-pill:
    description: "A short status word on a tinted ground; each app status gets its own colour from the palette."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
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
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "20px"
  toast:
    description: "A short confirmation that disappears by itself."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  empty-state:
    description: "What a list or board says when it has nothing in it yet, and how to add the first."
    textColor: "{colors.muted}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# night-arcade-green

## Character
A dense, dark app shell: near-black canvas, one flat dark-grey surface step, and light grey ink. A vivid green marks the main action and what is live or good; an electric blue marks the second action and what is new. Type is compact and heavy, with bold headings and semibold body text. Corners are 8 to 10px on controls and 16px on cards.

## Color roles
- Page canvas: `{colors.canvas}`; deepest wells and scrims `{colors.black}`.
- Raised surface (cards, panels, drawers): `{colors.surface}`.
- Hairline and borders: `{colors.hairline}`.
- Text primary `{colors.ink}`, secondary `{colors.muted}`, muted `{colors.faint}`.
- Primary action: `{colors.primary}` fill with `{colors.on-primary}` text.
- Secondary action: `{colors.secondary}` fill with `{colors.on-primary}` text, or `{colors.surface}` with `{colors.ink}` for quiet actions.
- Link: `{colors.secondary}`.
- Focus ring: 2px `{colors.secondary}`.
- Selected / active: `{colors.primary}` border or left bar, with `{colors.ink}` text on `{colors.surface}`.
- Error: the palette has no red. Use an error icon, message text in `{colors.ink}` and a `{colors.ink}` border; never colour alone.

**Status accents**
- Good / live: `{colors.primary}`.
- In progress / new: `{colors.secondary}`.
- Neutral: `{colors.muted}` text on `{colors.surface}`.
- Inactive: `{colors.faint}`.
- Attention and problem: no warm hue exists. Use an icon and label in `{colors.ink}` with an outline pill.
The palette is narrow, so status is always a word or icon first.

## Type roles
- Page title: `{typography.heading}`.
- Section heading: `{typography.title}`.
- Item / card title: `{typography.title}`.
- Body: `{typography.body}`.
- UI label: `{typography.ui}`.
- Caption / meta: `{typography.caption}`.
- Numbers: `{typography.ui}` or `{typography.body}` with tabular figures (Inter has them).
- `{typography.display}` (33px, weight 800) is for a key figure on a dashboard, not a page title.

## Shape and density
- Radii: buttons `{rounded.lg}`; quiet buttons `{rounded.xl}`; inputs and value buttons `{rounded.md}`; small tags `{rounded.sm}`; cards, panels and dialogs `{rounded.card}`; badges `{rounded.full}`.
- Spacing: `{spacing.xs}` inside badges, `{spacing.sm}` between controls, `{spacing.md}` cell padding, `{spacing.lg}` card padding, `{spacing.xxl}` between regions.
- Density is high. Table rows 36px, cells padded `{spacing.sm}` by `{spacing.md}`, `{colors.hairline}` dividers. Boards: `{colors.surface}` cards on `{colors.canvas}`, `{spacing.sm}` gaps.
- Depth: the canvas-to-surface step plus a hairline edge. A soft dark shadow only on menus, dialogs and docked panels.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface` ground, `ink` text, `hairline` edge, `body` type.
- `app-nav-item`: a link in the navigation. `muted` text, `sm` corners, `body` type.
- `app-nav-item-active`: the page you are on. `surface` ground, `ink` text, `sm` corners, `body` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface` ground, `ink` text, `full` corners, `caption` type.
- `page-title`: a page's heading. `ink` text, `display` type.
- `table-header`: a table's column headings. `surface` ground, `muted` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `board-lane`: a column of a board. `surface` ground, `muted` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface` ground, `ink` text, `hairline` edge, `md` corners, `caption` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `lg` corners, `body` type.
- `button-secondary`: every other action. `secondary` ground, `on-primary` text, `lg` corners, `body` type.
- `text-input`: a form field. `surface` ground, `ink` text, `md` corners, `body` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `field-label`: a form field's label. `muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `primary` text, `caption` type.
- `card`: a panel that groups one thing's details. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `dialog`: a box over the page that asks for one decision. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `caption` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `muted` text, `hairline` edge, `lg` corners, `body` type.
- `sign-in-panel`: the sign-in screen's panel. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.

## Do / Don't
- Do keep the surface ladder to two steps: canvas and surface.
- Do keep green for the main action and good states, blue for the second.
- Do run tables compact, 36px rows.
- Do label every status; there is no red or amber.
- Don't add heavy shadows to cards.
- Don't put green and blue buttons side by side with equal weight.
- Don't use light backgrounds inside the shell.
- Don't use `{colors.faint}` for text people need to read.
