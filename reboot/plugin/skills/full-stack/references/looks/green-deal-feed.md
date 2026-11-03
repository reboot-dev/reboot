---
version: alpha
name: green-deal-feed
description: "Cool-grey canvas stacked with compact white 8px cards, one green for every action and money figure, fully round pill controls and a two-weight humanist sans; suits high-volume feeds, marketplaces, queues, CRM and dense operations boards."

colors:
  primary: "#4e9f24"
  on-primary: "#ffffff"
  green-strong: "#34760c"
  discount-surface: "#ddf7dc"
  hot: "#c41747"
  cold: "#0f528f"
  warm: "#f45a33"
  premium: "#6259d7"
  canvas: "#f0f2f4"
  surface: "#ffffff"
  ink: "#000000"
  body: "#696b6e"
  muted: "#a5a7aa"
  hairline: "#dcdee1"
  warning-surface: "#f9f2c5"
  warning-text: "#9c551c"

colors-dark:
  primary: "#4e9f24"
  green-strong: "#34760c"
  discount-surface: "#183618"
  hot: "#c81d4a"
  cold: "#2b69a8"
  warm: "#f45a33"
  premium: "#6259d7"
  canvas: "#101213"
  surface: "#0b0b0b"
  ink: "#e8e8e8"
  body: "#7b7d80"
  muted: "#494b4d"
  hairline: "#1b1c1e"
  warning-surface: "#352e04"
  warning-text: "#b66d37"
  on-primary: "#111212"

typography:
  display:
    fontFamily: 'Mulish'
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0
  heading-lg:
    fontFamily: 'Mulish'
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  heading:
    fontFamily: 'Mulish'
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0
  lead:
    fontFamily: 'Mulish'
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  body:
    fontFamily: 'Mulish'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  ui:
    fontFamily: 'Mulish'
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0
  caption:
    fontFamily: 'Mulish'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0
  micro:
    fontFamily: 'Mulish'
    fontSize: 10px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  mono:
    fontFamily: 'monospace'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  xs: 2px
  sm: 4px
  md: 8px
  full: 540px
  circle: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 40px

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
    typography: "{typography.heading-lg}"
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
    typography: "{typography.ui}"
    rounded: "{rounded.full}"
    padding: "0px 14px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "9px 35px"
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
    rounded: "{rounded.md}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
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
    rounded: "{rounded.md}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "28px"

---

# green-deal-feed

## Character
An app in this look is a dense, scannable feed: a cool-grey canvas stacked with compact white cards, one confident green for every action and money figure, and fully round pill controls. Type is a humanist sans at two weights, 500 and 700, so hierarchy comes from size and bold rather than many styles. A small set of functional accents (red, blue, orange, violet) marks status and votes, never decoration.

## Color roles
- Page canvas: `{colors.canvas}`.
- Raised surface (cards, panels, drawers): `{colors.surface}`.
- Hairline and borders: `{colors.hairline}`.
- Text primary `{colors.ink}`; secondary `{colors.body}`; muted `{colors.muted}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; strong text-on-tint green: `{colors.green-strong}`.
- Secondary action: `{colors.surface}` pill with a `{colors.hairline}` border and `{colors.ink}` text.
- Link: `{colors.green-strong}`.
- Focus ring: 2px `{colors.cold}`.
- Selected / active: `{colors.discount-surface}` fill with `{colors.green-strong}` text.
- Error: `{colors.hot}`.

**Status accents** (each as a small badge with a text label):
- Good: `{colors.green-strong}` on `{colors.discount-surface}`.
- Attention: `{colors.warning-text}` on `{colors.warning-surface}`.
- Problem: `{colors.hot}`.
- In progress: `{colors.cold}`.
- Rising / needs a look: `{colors.warm}`.
- Neutral: `{colors.body}` on `{colors.canvas}`.
- Highlight / priority: `{colors.premium}`.

## Type roles
- Page title: `{typography.heading-lg}` (24px, 700).
- Section heading: `{typography.heading}` (20px, 700).
- Item / card title: `{typography.lead}` (18px, 500) on cards; `{typography.body}` in rows.
- Body: `{typography.body}` (16px, 500).
- UI label: `{typography.ui}` (14px, 700) for buttons, tabs and column heads.
- Caption / meta: `{typography.caption}`; counters and tiny tags `{typography.micro}`.
- Numbers: `{typography.ui}` or `{typography.heading}` in 700 with tabular figures; codes in `{typography.mono}`.
- `{typography.display}` (48px) is for a single headline figure on a summary view, not a page title.

## Shape and density
- Radii: buttons, search, chips and toggles `{rounded.full}`; cards, panels and dialogs `{rounded.md}`; small badges `{rounded.sm}`; avatars `{rounded.circle}`.
- Rhythm: tight. `{spacing.xs}` inside controls, `{spacing.sm}` between items, `{spacing.md}` card padding, `{spacing.lg}` between panels, `{spacing.xl}` between sections.
- Density: high. List and table rows 36 to 40px, cell padding `{spacing.sm}` by `{spacing.md}`; board cards `{spacing.md}` padded with `{spacing.sm}` gaps.
- Depth: hairlines and the grey gutter; a soft shadow only for menus, sticky bars and dialogs.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface` ground, `ink` text, `hairline` edge, `body` type.
- `app-nav-item`: a link in the navigation. `muted` text, `sm` corners, `body` type.
- `app-nav-item-active`: the page you are on. `surface` ground, `ink` text, `sm` corners, `body` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface` ground, `ink` text, `full` corners, `caption` type.
- `page-title`: a page's heading. `ink` text, `heading-lg` type.
- `table-header`: a table's column headings. `surface` ground, `muted` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `board-lane`: a column of a board. `surface` ground, `muted` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface` ground, `ink` text, `hairline` edge, `md` corners, `caption` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `full` corners, `ui` type.
- `button-secondary`: every other action. `canvas` ground, `ink` text, `hairline` edge, `md` corners, `body` type.
- `text-input`: a form field. `surface` ground, `ink` text, `full` corners, `body` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `field-label`: a form field's label. `muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `primary` text, `caption` type.
- `card`: a panel that groups one thing's details. `surface` ground, `ink` text, `hairline` edge, `md` corners, `body` type.
- `dialog`: a box over the page that asks for one decision. `surface` ground, `ink` text, `hairline` edge, `md` corners, `body` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `caption` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `muted` text, `hairline` edge, `md` corners, `body` type.
- `sign-in-panel`: the sign-in screen's panel. `surface` ground, `ink` text, `hairline` edge, `md` corners, `body` type.

## Do / Don't
**Do**
- Keep green for actions and money only.
- Pill every button, chip and search field; keep cards at 8px.
- Run lists and tables tight with hairline separators.
- Pair each status colour with a text label.
- Bold numbers and use tabular figures.

**Don't**
- Don't use red or blue for anything but their status and vote meanings.
- Don't add a third font weight.
- Don't shadow resting cards.
- Don't square off pills.
- Don't let orange or violet become decoration.
