---
version: alpha
name: deep-black-lavender
description: "Near-black blue-tinted canvas with a four-step charcoal surface ladder, hairline borders, light grey ink, compact 8px controls and one lavender-blue accent; suits dense issue trackers, developer tools, project boards and dark operations dashboards."

colors:
  primary: "#6d62c7"
  on-primary: "#ffffff"
  primary-hover: "#9286f3"
  primary-focus: "#6c61c6"
  ink: "#f5f6f6"
  ink-muted: "#ced4de"
  ink-subtle: "#888d96"
  ink-tertiary: "#60646b"
  canvas: "#020203"
  surface-1: "#0e0f10"
  surface-2: "#131415"
  surface-3: "#171819"
  surface-4: "#18191a"
  hairline: "#222429"
  hairline-strong: "#323238"
  hairline-tertiary: "#3c3c42"
  inverse-canvas: "#ffffff"
  inverse-surface-1: "#f3f4f4"
  inverse-surface-2: "#f4f5f5"
  inverse-ink: "#000000"
  brand-secure: "#7e79a6"
  semantic-success: "#289f65"
  semantic-overlay: "#000000"

colors-light:
  primary: "#6d62c7"
  primary-hover: "#897de9"
  primary-focus: "#6c61c6"
  ink: "#1a1b1b"
  ink-muted: "#2c3038"
  ink-subtle: "#60656d"
  ink-tertiary: "#81858c"
  canvas: "#f9fafe"
  surface-1: "#e1e3e4"
  surface-2: "#dbdcde"
  surface-3: "#d6d7d9"
  surface-4: "#d5d6d7"
  hairline: "#c6c9cf"
  hairline-strong: "#b8b8bf"
  hairline-tertiary: "#adadb4"
  inverse-canvas: "#151515"
  inverse-surface-1: "#1b1c1c"
  inverse-surface-2: "#1b1b1b"
  inverse-ink: "#fcfcfc"
  brand-secure: "#7e79a6"
  semantic-success: "#13814f"
  semantic-overlay: "#fcfcfc"
  on-primary: "#fafafc"

typography:
  display-xl:
    fontFamily: 'Inter'
    fontSize: 80px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -3.0px
  display-lg:
    fontFamily: 'Inter'
    fontSize: 56px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -1.8px
  display-md:
    fontFamily: 'Inter'
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -1.0px
  headline:
    fontFamily: 'Inter'
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: -0.6px
  card-title:
    fontFamily: 'Inter'
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.4px
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
    letterSpacing: -0.05px
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
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: 0
  eyebrow:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0.4px
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
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.surface-1}"
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
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.primary}"
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

# deep-black-lavender

## Character
An app in this look is a dense, quiet dark workspace: a near-black canvas with a faint blue tint, a four-step charcoal ladder for panels, and 1px hairlines between everything. Light grey ink carries the content, and a single lavender-blue marks the main action, focus and selection. Type is Inter at medium weights with tight negative tracking on headings, plus a monospace for ids and keys. Corners are small and consistent; depth comes from surface steps, not shadows.

## Color roles
- Page canvas: `{colors.canvas}`.
- Raised surface (cards, panels, drawers): `{colors.surface-1}`; menus and popovers `{colors.surface-3}`; nested or hovered `{colors.surface-2}`; deepest lift `{colors.surface-4}`.
- Hairline and borders: `{colors.hairline}`; stronger `{colors.hairline-strong}`; nested `{colors.hairline-tertiary}`.
- Text primary: `{colors.ink}`.
- Text secondary: `{colors.ink-muted}`.
- Text muted: `{colors.ink-subtle}`; disabled `{colors.ink-tertiary}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; hover `{colors.primary-hover}`; pressed `{colors.primary-focus}`.
- Secondary action: `{colors.surface-1}` with `{colors.ink}` and a `{colors.hairline}` border.
- Link: `{colors.primary-hover}` (legible on the dark canvas).
- Focus ring: 2px `{colors.primary-focus}` at 50% opacity.
- Selected / active: `{colors.surface-2}` fill with a `{colors.primary}` indicator bar.
- Error: no red token exists; use `{colors.ink}` text with an error icon, a `{colors.hairline-strong}` outline and the word "Error".
- Modal scrim: `{colors.semantic-overlay}` at about 60% opacity.

**Status accents** (the palette is narrow; status always carries a label or icon):
- Good / done: `{colors.semantic-success}`.
- In progress: `{colors.primary-hover}`.
- Attention: `{colors.ink}` on `{colors.surface-3}` with a warning icon.
- Problem: `{colors.inverse-canvas}` chip with `{colors.inverse-ink}` text and an icon.
- Neutral / backlog: `{colors.ink-subtle}` on `{colors.surface-2}`.
- Restricted / secure: `{colors.brand-secure}`.

## Type roles
- Page title: `{typography.headline}` (28px).
- Section heading: `{typography.card-title}`, or `{typography.subhead}` for lighter sections.
- Item / card title: `{typography.body}` at weight 500.
- Body: `{typography.body-sm}` in dense views; `{typography.body}` in detail panes.
- UI label: `{typography.button}` for buttons; `{typography.eyebrow}` for group labels.
- Caption / meta: `{typography.caption}`.
- Numbers: `{typography.body-sm}` with `tabular-nums` (Inter has them); ids and keys in `{typography.mono}`.
- `{typography.display-xl}` (80px) and `{typography.display-lg}` (56px) are for a rare headline figure only, never page titles; `{typography.display-md}` suits an empty state at most.

## Shape and density
- Controls: `{rounded.md}` for buttons and inputs; chips and badges `{rounded.xs}` or `{rounded.pill}`.
- Cards and panels: `{rounded.lg}`; large containers `{rounded.xl}`.
- Avatars: `{rounded.full}`.
- Rhythm: `{spacing.xs}` inside controls, `{spacing.md}` inside cards, `{spacing.lg}` between panels, `{spacing.xl}` between page regions.
- Tables and lists: 36px rows, `{spacing.xs}` by `{spacing.sm}` cell padding, `{colors.hairline}` row rules.
- Boards: columns on `{colors.canvas}`, cards on `{colors.surface-1}` `{spacing.xs}` apart.
- Depth: surface ladder plus hairlines; no drop shadows except a faint one on menus.

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
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `md` corners, `button` type.
- `button-secondary`: every other action. `surface-1` ground, `ink` text, `md` corners, `button` type.
- `text-input`: a form field. `surface-1` ground, `ink` text, `md` corners, `body` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `field-label`: a form field's label. `ink-muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `primary` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-1` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `dialog`: a box over the page that asks for one decision. `surface-1` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `ink-muted` text, `hairline` edge, `lg` corners, `body` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-1` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.

## Do / Don't
**Do**
- Step up the surface ladder for each level of nesting.
- Keep lavender to the main action, focus and selection.
- Use 36px rows and hairline rules in tables and lists.
- Set ids, keys and hashes in the monospace.
- Pair every status colour with a label or icon.

**Don't**
- Don't fill panels or sections with lavender.
- Don't add a second bright accent for decoration.
- Don't use page titles above 28px.
- Don't lift cards with drop shadows.
- Don't use true black `#000000` text on the dark canvas or as the canvas.
