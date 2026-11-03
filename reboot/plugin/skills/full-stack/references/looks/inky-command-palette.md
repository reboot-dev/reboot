---
version: alpha
name: inky-command-palette
description: "Near-black keyboard-first interface with a four-step surface ladder, 1px hairlines and no shadows, one white primary button, keycaps and status accents on soft tints; suits developer tools, launchers, and dense operations and monitoring apps."

colors:
  primary: "#ffffff"
  primary-pressed: "#e6e6e6"
  on-primary: "#000000"
  ink: "#f2f2f4"
  body: "#cbcbcb"
  charcoal: "#d1d1d2"
  mute: "#9a9a9b"
  ash: "#68696a"
  stone: "#414143"
  on-dark: "#ffffff"
  on-dark-mute: "rgba(255, 255, 255,0.72)"
  canvas: "#060709"
  surface: "#0c0c0c"
  surface-elevated: "#0f1010"
  surface-card: "#111111"
  button-fg: "#171819"
  hairline: "#232627"
  hairline-soft: "rgba(255, 255, 255,0.08)"
  hairline-strong: "rgba(255, 255, 255,0.16)"
  accent-blue: "#49c0f2"
  accent-blue-soft: "rgba(73, 192, 242,0.15)"
  accent-red: "#f65f73"
  accent-red-soft: "rgba(246, 95, 115,0.15)"
  accent-green: "#6dcd89"
  accent-green-soft: "rgba(109, 205, 137,0.15)"
  accent-yellow: "#febe56"
  accent-yellow-soft: "rgba(254, 190, 86,0.15)"
  hero-stripe-start: "#f6556b"
  hero-stripe-end: "#9a112e"
  key-bg-start: "#111111"
  key-bg-end: "#0c0c0c"

colors-light:
  primary: "#131313"
  primary-pressed: "#222222"
  on-primary: "#fcfcfc"
  ink: "#1a1a1c"
  body: "#353535"
  charcoal: "#313132"
  mute: "#5b5b5c"
  ash: "#818283"
  stone: "#b0b0b2"
  on-dark: "#131313"
  on-dark-mute: "rgba(19, 19, 19, 0.72)"
  canvas: "#f8fafe"
  surface: "#f2f2f2"
  surface-elevated: "#ebeded"
  surface-card: "#ebebeb"
  button-fg: "#e0e2e3"
  hairline: "#cdd1d3"
  hairline-soft: "rgba(19, 19, 19, 0.08)"
  hairline-strong: "rgba(19, 19, 19, 0.16)"
  accent-blue: "#2896c1"
  accent-blue-soft: "rgba(20, 122, 159, 0.15)"
  accent-red: "#eb556a"
  accent-red-soft: "rgba(206, 57, 83, 0.15)"
  accent-green: "#3b9d5c"
  accent-green-soft: "rgba(27, 132, 69, 0.15)"
  accent-yellow: "#b7811d"
  accent-yellow-soft: "rgba(154, 107, 15, 0.15)"
  hero-stripe-start: "#f25268"
  hero-stripe-end: "#9a112e"
  key-bg-start: "#ebebeb"
  key-bg-end: "#f2f2f2"

typography:
  display-xl:
    fontFamily: 'Inter'
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0
    fontFeature: '"calt", "kern", "liga", "ss03"'
  display-lg:
    fontFamily: 'Inter'
    fontSize: 56px
    fontWeight: 500
    lineHeight: 1.17
    letterSpacing: 0.2px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  heading-xl:
    fontFamily: 'Inter'
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: 0.2px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  heading-lg:
    fontFamily: 'Inter'
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: 0
    fontFeature: '"calt", "kern", "liga", "ss03"'
  heading-md:
    fontFamily: 'Inter'
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.2px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  heading-sm:
    fontFamily: 'Inter'
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.2px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  body-lg:
    fontFamily: 'Inter'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
    fontFeature: '"calt", "kern", "liga", "ss03"'
  body-md:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
    fontFeature: '"calt", "kern", "liga", "ss03"'
  body-strong:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.2px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  body-sm:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
    fontFeature: '"calt", "kern", "liga", "ss03"'
  body-sm-strong:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: 0.2px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  caption-md:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.1px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  caption-sm:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.4px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  link-md:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.3px
    fontFeature: '"calt", "kern", "liga", "ss03"'
  button-md:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: 0.2px
    fontFeature: '"calt", "kern", "liga", "ss03"'

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 16px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 96px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    height: "56px"
    padding: "0 24px"
  app-nav-item:
    description: "A link in the navigation."
    textColor: "{colors.mute}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.accent-blue-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.heading-lg}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.mute}"
    typography: "{typography.body-sm}"
    borderColor: "{colors.hairline}"
    padding: "8px 12px"
  table-row:
    description: "One row of a table."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    padding: "10px 12px"
  list-row:
    description: "One item in a list that is not a table."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    padding: "12px 16px"
  board-lane:
    description: "A column of a board."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.mute}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  status-pill:
    description: "A short status word on a tinted ground; each app status gets its own colour from the palette."
    backgroundColor: "{colors.accent-blue-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "transparent"
    textColor: "{colors.on-dark}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
  select:
    description: "A dropdown."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  field-label:
    description: "A form field's label."
    textColor: "{colors.mute}"
    typography: "{typography.body-sm}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.accent-red}"
    typography: "{typography.body-sm}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
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
    textColor: "{colors.mute}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# inky-command-palette

## Character
A near-black, keyboard-first tool that feels like a command palette grown into a full app. Surfaces climb a faint four-step ladder and every edge is a 1px hairline; there are no shadows. One white button marks the main action, keycaps show shortcuts, and saturated accents appear only as small status markers on soft tints. Inter with its stylistic set on keeps text crisp at 13 to 16px; corners stay small at 6 to 10px.

## Color roles
- Page canvas: `{colors.canvas}`
- Raised surface (cards, panels, drawers): `{colors.surface}`; nested panels and inputs `{colors.surface-elevated}`; highlighted rows and keycaps `{colors.surface-card}`
- Hairline and borders: `{colors.hairline}`; subtle dividers `{colors.hairline-soft}`; hover outlines `{colors.hairline-strong}`
- Text primary: `{colors.ink}`; secondary: `{colors.body}`; muted: `{colors.mute}`; disabled `{colors.ash}`
- Primary action: `{colors.primary}` fill with `{colors.on-primary}` text
- Secondary action: `{colors.surface-elevated}` fill with `{colors.on-dark}` text
- Link: `{colors.on-dark}` underlined; `{colors.accent-blue}` for links inside body text
- Focus ring: `{colors.accent-blue}` at 1px outside a `{colors.hairline-strong}` edge
- Selected / active: `{colors.surface-card}` fill with `{colors.on-dark}` text
- Error: `{colors.accent-red}`

**Status accents** (text on its soft tint, with a label):
- Good: `{colors.accent-green}` on `{colors.accent-green-soft}`
- Attention: `{colors.accent-yellow}` on `{colors.accent-yellow-soft}`
- Problem: `{colors.accent-red}` on `{colors.accent-red-soft}`
- In progress / info: `{colors.accent-blue}` on `{colors.accent-blue-soft}`
- Neutral: `{colors.mute}` on `{colors.surface-elevated}`

Accents are for status and category markers only, never for buttons or panels.

## Type roles
- Page title: `{typography.heading-lg}`
- Section heading: `{typography.heading-sm}`
- Item / card title: `{typography.body-strong}`; compact rows `{typography.body-sm-strong}`
- Body: `{typography.body-sm}` in dense views, `{typography.body-md}` in reading views
- UI label: `{typography.body-sm-strong}`; buttons `{typography.button-md}`
- Caption / meta: `{typography.caption-md}`; timestamps and shortcuts `{typography.caption-sm}`
- Numbers: `{typography.body-sm}` with Inter tabular figures added to the feature list

`{typography.display-lg}` and `{typography.display-xl}` (56 to 64px) are for one rare headline figure; `{typography.heading-xl}` suits empty-state titles.

## Shape and density
- Controls: buttons and inputs `{rounded.md}`; palette rows `{rounded.sm}`; badges and keycaps `{rounded.xs}`; filter tabs `{rounded.full}`.
- Cards and panels: `{rounded.lg}`; large overlays such as the palette itself `{rounded.xl}`.
- Spacing: `{spacing.xs}` inside chips, `{spacing.sm}` between controls, `{spacing.lg}` card padding, `{spacing.xl}` panel padding, `{spacing.xxl}` between regions.
- Tables and lists: 32 to 36px rows, `{spacing.sm}` cell padding, `{colors.hairline-soft}` rules. Boards: `{spacing.sm}` gaps, `{spacing.md}` card padding.
- Depth: the surface ladder and hairlines only; no drop shadows.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface-card` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `mute` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `accent-blue-soft` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `heading-lg` type.
- `table-header`: a table's column headings. `surface` ground, `mute` text, `hairline` edge, `body-sm` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `surface` ground, `mute` text, `md` corners, `body-sm` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `accent-blue-soft` ground, `ink` text, `full` corners, `body-sm` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `md` corners, `button-md` type.
- `button-secondary`: every other action. transparent ground, `on-dark` text, `md` corners, `button-md` type.
- `text-input`: a form field. `surface-elevated` ground, `on-dark` text, `md` corners, `body-md` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `mute` text, `body-sm` type.
- `field-error`: what is wrong with a field, under it. `accent-red` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `mute` text, `hairline` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.

## Do / Don't
Do:
- Stay dark everywhere; there is no light mode.
- Build depth from the surface ladder and hairlines.
- Show keyboard shortcuts with keycaps.
- Keep rows tight and text at 13 to 16px.
- Use accents only as status markers on their soft tints.

Don't:
- Don't add drop shadows.
- Don't fill buttons or panels with the accent colours.
- Don't use the 56 to 64px display sizes as page titles.
- Don't pad cards beyond 24px.
- Don't turn off the stylistic set.
