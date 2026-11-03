---
version: alpha
name: cream-product-led
description: "Warm cream canvas with white hairline panels, charcoal type and buttons, modest 8 to 12px corners and one rationed orange for a special action; suits customer support, CRM, inbox and booking apps with medium-density lists and tables."

colors:
  primary: "#131313"
  on-primary: "#ffffff"
  ink: "#131313"
  ink-muted: "#646462"
  ink-subtle: "#7d7d7a"
  ink-tertiary: "#9ea1a7"
  canvas: "#f8f4ef"
  surface-1: "#ffffff"
  surface-2: "#eeeae4"
  inverse-canvas: "#000000"
  inverse-surface-1: "#333332"
  inverse-ink: "#ffffff"
  inverse-ink-muted: "#9ea1a7"
  hairline: "#d6d1c9"
  hairline-soft: "#eeeae4"
  signal-orange: "#fb6551"
  report-orange: "#f95d51"
  report-blue: "#5dbefc"
  report-green: "#6dde32"
  report-pink: "#fd3687"
  report-lime: "#d0dd3d"
  report-cyan: "#20b9c4"
  brand-blue: "#0e4786"
  semantic-error: "#c62841"
  semantic-success: "#6dde32"

colors-dark:
  primary: "#e8e8e8"
  on-primary: "#0b0b0b"
  ink: "#e8e8e8"
  ink-muted: "#888886"
  ink-subtle: "#70706d"
  ink-tertiary: "#505358"
  canvas: "#14110e"
  surface-1: "#0b0b0b"
  surface-2: "#1a1813"
  inverse-canvas: "#fcfcfc"
  inverse-surface-1: "#bebebd"
  inverse-ink: "#1d1d1d"
  inverse-ink-muted: "#505358"
  hairline: "#2d2923"
  hairline-soft: "#1f1d18"
  signal-orange: "#fb6551"
  report-orange: "#f95d51"
  report-blue: "#5dbefc"
  report-green: "#6dde32"
  report-pink: "#fd3687"
  report-lime: "#2e3103"
  report-cyan: "#20b9c4"
  brand-blue: "#3167a9"
  semantic-error: "#df4355"
  semantic-success: "#6dde32"

typography:
  display-xl:
    fontFamily: 'Inter'
    fontSize: 72px
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: -2.0px
  display-lg:
    fontFamily: 'Inter'
    fontSize: 56px
    fontWeight: 500
    lineHeight: 1.10
    letterSpacing: -1.4px
  display-md:
    fontFamily: 'Inter'
    fontSize: 40px
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: -0.8px
  headline:
    fontFamily: 'Inter'
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: -0.5px
  card-title:
    fontFamily: 'Inter'
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.3px
  subhead:
    fontFamily: 'Inter'
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: -0.2px
  body-lg:
    fontFamily: 'Inter'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: -0.1px
  body:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  body-sm:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  caption:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
  button:
    fontFamily: 'Inter'
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: 0
  eyebrow:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0
  mono:
    fontFamily: 'JetBrains Mono'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
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
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
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

# cream-product-led

## Character
An app in this look sits on a warm cream canvas with white panels lifted onto it by a hairline, charcoal type and charcoal buttons. It feels calm and editorial rather than bright. One orange is rationed to a single special action (an assistant or automation feature); everything else is charcoal, and status uses the small report palette. Type is Inter at 500 for headings and 400 for text, and corners stay modest at 8 to 12px.

## Color roles
- Page canvas: `{colors.canvas}`; recessed areas and alternate rows: `{colors.surface-2}`.
- Raised surface (cards, panels, drawers): `{colors.surface-1}`.
- Hairline and borders: `{colors.hairline}`; row dividers: `{colors.hairline-soft}`.
- Text primary `{colors.ink}`; secondary `{colors.ink-muted}`; muted `{colors.ink-subtle}`; disabled `{colors.ink-tertiary}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; pressed `{colors.inverse-canvas}`.
- Secondary action: `{colors.surface-1}` with `{colors.ink}` and a `{colors.hairline}` border.
- Link: `{colors.ink}` underlined.
- Focus ring: 2px `{colors.brand-blue}`.
- Selected / active: `{colors.surface-1}` lifted on cream (tabs, rows), or a `{colors.surface-2}` row fill inside white panels.
- Error: `{colors.semantic-error}`.
- Special action only: `{colors.signal-orange}`.

**Status accents** (a dot or 4px bar plus a text label; the greens and cyan are too bright for text on cream):
- Good: `{colors.semantic-success}`.
- Attention: `{colors.report-orange}`.
- Problem: `{colors.semantic-error}`.
- In progress: `{colors.report-blue}`.
- Waiting / handed off: `{colors.report-cyan}`.
- Neutral: `{colors.ink-tertiary}`.
Charts may also use `{colors.report-pink}` and `{colors.report-lime}`.

## Type roles
- Page title: `{typography.headline}` (28px, 500).
- Section heading: `{typography.card-title}` (22px).
- Item / card title: `{typography.subhead}` for a panel header; `{typography.body}` for list and table row titles.
- Body: `{typography.body-sm}` in tables and forms; `{typography.body}` for longer text.
- UI label: `{typography.eyebrow}` (14px, 500, sentence case); `{typography.button}` for buttons.
- Caption / meta: `{typography.caption}` on `{colors.ink-muted}`.
- Numbers: `{typography.body-sm}` with tabular figures (Inter has them); IDs and codes in `{typography.mono}`.
- `{typography.display-xl}` (72px) and `{typography.display-lg}` (56px) are for one rare headline figure, never page titles.

## Shape and density
- Radii: badges `{rounded.xs}`; tags `{rounded.sm}`; buttons and inputs `{rounded.md}`; cards and panels `{rounded.lg}`; dialogs `{rounded.xl}`; tab toggles `{rounded.pill}`; avatars `{rounded.full}`.
- Rhythm: `{spacing.xs}` within controls, `{spacing.sm}` between related items, `{spacing.lg}` panel padding, `{spacing.xl}` between page sections.
- Density: table rows 44px with cell padding `{spacing.sm}` by `{spacing.md}`; lists divided by `{colors.hairline-soft}`; board columns on cream with white cards `{spacing.md}` padded.
- Depth: white on cream plus a hairline. No resting shadows; a soft shadow only for menus and dialogs.

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
- `button-primary`: the one main action on a page. `ink` ground, `on-primary` text, `md` corners, `button` type.
- `button-secondary`: every other action. `surface-1` ground, `ink` text, `md` corners, `button` type.
- `text-input`: a form field. `surface-1` ground, `ink` text, `md` corners, `body` type.
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
- Keep the canvas cream and lift working panels onto white.
- Keep charcoal as the only action colour, with one primary per view.
- Pair every status dot or bar with a text label.
- Use hairlines and the white-on-cream step for structure.
- Use tabular figures for counts, times and money.

**Don't**
- Don't use the orange for generic actions, banners or status.
- Don't print the bright greens or cyan as text on cream.
- Don't use pure white as the page canvas.
- Don't pill-round buttons; pills are for segment toggles only.
- Don't use display sizes above 48px for page titles.
- Don't add drop shadows to resting cards.
