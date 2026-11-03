---
version: alpha
name: night-exchange-yellow
description: "Near-black canvas with lighter card surfaces, one yellow for primary actions, green and red for up and down, tabular number type and a light theme for forms; suits trading, finance, monitoring and dense all-day data dashboards."

colors:
  primary: "#fdd789"
  primary-active: "#fab94e"
  primary-disabled: "#413c22"
  ink: "#1a1c22"
  body: "#eceef1"
  body-on-light: "#1a1c22"
  muted: "#727f8d"
  muted-strong: "#949ca7"
  hairline-on-light: "#eceef1"
  hairline-on-dark: "#2d333b"
  border-strong: "#cfd3d8"
  canvas-light: "#ffffff"
  canvas-dark: "#0c1013"
  surface-card-dark: "#20252b"
  surface-elevated-dark: "#2d333b"
  surface-soft-light: "#fcfcfc"
  surface-strong-light: "#f7f7f7"
  on-primary: "#1a1c22"
  on-dark: "#ffffff"
  trading-up: "#5acc72"
  trading-down: "#f54f7c"
  accent-turquoise: "#48c1ad"
  info: "#278fe9"
  info-ring: "#278fe9"

colors-dark:
  primary: "#3b2b03"
  primary-active: "#fab94e"
  primary-disabled: "#6a654a"
  ink: "#e5e8f0"
  body: "#212224"
  body-on-light: "#e5e8f0"
  muted: "#6f7b88"
  muted-strong: "#575f69"
  hairline-on-light: "#1c1d1f"
  hairline-on-dark: "#c4ccd6"
  border-strong: "#2e3135"
  canvas-light: "#121212"
  canvas-dark: "#f6fbff"
  surface-card-dark: "#d7dde6"
  surface-elevated-dark: "#c4ccd6"
  surface-soft-light: "#151515"
  surface-strong-light: "#171717"
  on-dark: "#121212"
  trading-up: "#5acc72"
  trading-down: "#f54f7c"
  accent-turquoise: "#48c1ad"
  info: "#278fe9"
  info-ring: "#278fe9"
  on-primary: "#e5e8f0"

typography:
  hero-display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -1px
  display-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.5px
  display-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.3px
  display-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  title-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  title-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0
  title-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  number-display:
    fontFamily: "IBM Plex Sans, Inter, sans-serif"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.3px
  number-md:
    fontFamily: "IBM Plex Sans, Inter, sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  number-sm:
    fontFamily: "IBM Plex Sans, Inter, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  button:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0
  nav-link:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
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
  section: 80px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    height: "56px"
    padding: "0 24px"
  app-nav-item:
    description: "A link in the navigation."
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.surface-soft-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.surface-strong-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.display-sm}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.surface-strong-light}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    borderColor: "{colors.hairline-on-light}"
    padding: "8px 12px"
  table-row:
    description: "One row of a table."
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    padding: "10px 12px"
  list-row:
    description: "One item in a list that is not a table."
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    padding: "12px 16px"
  board-lane:
    description: "A column of a board."
    backgroundColor: "{colors.surface-strong-light}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    borderColor: "{colors.hairline-on-light}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  status-pill:
    description: "A short status word on a tinted ground; each app status gets its own colour from the palette."
    backgroundColor: "{colors.surface-soft-light}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
    height: "40px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    borderColor: "{colors.hairline-on-light}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  select:
    description: "A dropdown."
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  field-label:
    description: "A form field's label."
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    rounded: "{rounded.lg}"
    padding: "20px"
  toast:
    description: "A short confirmation that disappears by itself."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas-light}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  empty-state:
    description: "What a list or board says when it has nothing in it yet, and how to add the first."
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    rounded: "{rounded.lg}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.surface-card-dark}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline-on-light}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# night-exchange-yellow

## Character
An app in this look is a confident near-black workspace built for data: dark canvas, slightly lighter card surfaces, and one saturated yellow kept for the primary action and the active marker. Green and red mean up and down (good and bad) and nothing else. Every figure is set in a dedicated number face with tabular digits, corners are small (6 to 12px), and a light theme is used for focused forms and dialogs.

## Color roles
- Page canvas: `{colors.canvas-dark}`; light theme for forms and dialogs: `{colors.canvas-light}`.
- Raised surface (cards, panels, drawers): `{colors.surface-card-dark}`; menus and nested panels: `{colors.surface-elevated-dark}`; on light: `{colors.surface-soft-light}` / `{colors.surface-strong-light}`.
- Hairline and borders: `{colors.hairline-on-dark}`; on light `{colors.hairline-on-light}`, inputs `{colors.border-strong}`.
- Text primary `{colors.on-dark}`; secondary `{colors.body}`; muted `{colors.muted-strong}`, faint `{colors.muted}`. On light: `{colors.body-on-light}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; pressed `{colors.primary-active}`; disabled `{colors.primary-disabled}`.
- Secondary action: `{colors.surface-card-dark}` with `{colors.on-dark}`; on light `{colors.canvas-light}` with `{colors.ink}` and a border.
- Link: `{colors.primary}` on dark; `{colors.info}` on light.
- Focus ring: 2px `{colors.info-ring}`.
- Selected / active: `{colors.surface-elevated-dark}` row fill with a 2px `{colors.primary}` marker.
- Error: `{colors.trading-down}`.

**Status accents** (as text or a small dot with a label, never as card fills):
- Good: `{colors.trading-up}`.
- Attention: `{colors.primary-active}` as a small dot or label only, since the palette has no separate amber.
- Problem: `{colors.trading-down}`.
- In progress: `{colors.info}`.
- Neutral: `{colors.muted-strong}`.
- Secondary category: `{colors.accent-turquoise}`.

## Type roles
- Page title: `{typography.title-lg}` (24px, 600); `{typography.display-sm}` (32px) at most for a top-level overview.
- Section heading: `{typography.title-md}` (20px).
- Item / card title: `{typography.title-sm}` (16px, 600).
- Body: `{typography.body-md}` (14px); dense tables `{typography.body-sm}`.
- UI label: `{typography.caption}` for column heads and field labels; `{typography.button}` for buttons; `{typography.nav-link}` for navigation.
- Caption / meta: `{typography.caption}` on `{colors.muted}`.
- Numbers: `{typography.number-md}` and `{typography.number-sm}` in every table and card, tabular and right-aligned; `{typography.number-display}` (40px) for a single KPI.
- `{typography.hero-display}` (64px) and `{typography.display-lg}` (48px) are for one rare headline figure, never page titles.

## Shape and density
- Radii: small status buttons `{rounded.sm}`; buttons `{rounded.md}`; inputs and small cards `{rounded.lg}`; table cards and panels `{rounded.xl}`; one prominent top action may use `{rounded.pill}`.
- Rhythm: `{spacing.xxs}` and `{spacing.xs}` inside controls, `{spacing.sm}` between items, `{spacing.md}` panel padding, `{spacing.lg}` between panels.
- Density: high. Table rows 36 to 40px, cell padding `{spacing.xs}` by `{spacing.sm}`, hairline rules; board cards `{spacing.sm}` padded.
- Depth: flat colour steps from canvas to card to elevated; no glow, no gradients, a soft shadow only on menus.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface-card-dark` ground, `ink` text, `hairline-on-light` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `muted` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `surface-soft-light` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface-strong-light` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `display-sm` type.
- `table-header`: a table's column headings. `surface-strong-light` ground, `muted` text, `hairline-on-light` edge, `caption` type.
- `table-row`: one row of a table. `canvas-light` ground, `ink` text, `hairline-on-light` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas-light` ground, `ink` text, `hairline-on-light` edge, `body-md` type.
- `board-lane`: a column of a board. `surface-strong-light` ground, `muted` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface-card-dark` ground, `ink` text, `hairline-on-light` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface-soft-light` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `md` corners, `button` type.
- `button-secondary`: every other action. `canvas-light` ground, `ink` text, `hairline-on-light` edge, `md` corners, `button` type.
- `text-input`: a form field. `canvas-light` ground, `ink` text, `hairline-on-light` edge, `sm` corners, `body-md` type.
- `select`: a dropdown. `canvas-light` ground, `ink` text, `hairline-on-light` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `primary` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-card-dark` ground, `ink` text, `hairline-on-light` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `surface-card-dark` ground, `ink` text, `hairline-on-light` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas-light` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `muted` text, `hairline-on-light` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-card-dark` ground, `ink` text, `hairline-on-light` edge, `lg` corners, `body-md` type.

## Do / Don't
**Do**
- Keep yellow for the main action and the active marker only.
- Set every number in the number face with tabular figures.
- Use green and red only for direction and good / bad states.
- Switch focused forms and confirmations to the light theme.
- Keep tables dense with hairlines and right-aligned figures.

**Don't**
- Don't use yellow for body text or large fills.
- Don't fill cards with green or red.
- Don't put white text on yellow.
- Don't add gradients or glow to the canvas.
- Don't use the 48px or 64px display sizes for page titles.
