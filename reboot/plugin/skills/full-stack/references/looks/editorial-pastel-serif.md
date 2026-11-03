---
version: alpha
name: editorial-pastel-serif
description: "Off-white canvas, white soft-cornered cards, warm near-black ink, a light serif for titles over Inter, near-black pill actions and pastel tints for status; suits sparse consumer, creative, media and booking apps, not dense operations screens."

colors:
  primary: "#282423"
  primary-active: "#0b0908"
  ink: "#0b0908"
  body: "#4c4c4c"
  body-strong: "#282423"
  muted: "#756f67"
  muted-soft: "#a6a09c"
  hairline: "#e5e3e2"
  hairline-soft: "#eeedeb"
  hairline-strong: "#d4d1cf"
  canvas: "#f3f3f3"
  canvas-soft: "#f8f8f8"
  canvas-deep: "#0b0908"
  surface-card: "#ffffff"
  surface-strong: "#eeedeb"
  surface-dark: "#0b0908"
  surface-dark-elevated: "#1b1816"
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  on-dark-soft: "#a6a09c"
  gradient-mint: "#a9e0c9"
  gradient-peach: "#f1c0aa"
  gradient-lavender: "#bfb6dd"
  gradient-sky: "#a1c6e1"
  gradient-rose: "#e1b5c6"
  semantic-error: "#d42541"
  semantic-success: "#439c36"

colors-dark:
  primary: "#c7c2c1"
  primary-active: "#eae7e5"
  ink: "#eae7e5"
  body: "#989898"
  body-strong: "#c7c2c1"
  muted: "#837d75"
  muted-soft: "#544f4b"
  hairline: "#1c1b1a"
  hairline-soft: "#1b1a19"
  hairline-strong: "#292725"
  canvas: "#121212"
  canvas-soft: "#181818"
  canvas-deep: "#eae7e5"
  surface-card: "#0b0b0b"
  surface-strong: "#161514"
  surface-dark: "#eae7e5"
  surface-dark-elevated: "#d6d2cf"
  on-primary: "#0b0b0b"
  on-dark: "#0b0b0b"
  on-dark-soft: "#4f4a46"
  gradient-mint: "#043728"
  gradient-peach: "#f1c0aa"
  gradient-lavender: "#bfb6dd"
  gradient-sky: "#a1c6e1"
  gradient-rose: "#e1b5c6"
  semantic-error: "#e63b4f"
  semantic-success: "#439c36"

typography:
  display-mega:
    fontFamily: "'EB Garamond', 'Times New Roman', serif"
    fontSize: 64px
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: -1.92px
  display-xl:
    fontFamily: "'EB Garamond', serif"
    fontSize: 48px
    fontWeight: 300
    lineHeight: 1.08
    letterSpacing: -0.96px
  display-lg:
    fontFamily: "'EB Garamond', serif"
    fontSize: 36px
    fontWeight: 300
    lineHeight: 1.17
    letterSpacing: -0.36px
  display-md:
    fontFamily: "'EB Garamond', serif"
    fontSize: 32px
    fontWeight: 300
    lineHeight: 1.13
    letterSpacing: -0.32px
  display-sm:
    fontFamily: "'EB Garamond', serif"
    fontSize: 24px
    fontWeight: 300
    lineHeight: 1.2
    letterSpacing: 0
  title-md:
    fontFamily: "'Inter', sans-serif"
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: 0
  title-sm:
    fontFamily: "'Inter', sans-serif"
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.44
    letterSpacing: 0.18px
  body-md:
    fontFamily: "'Inter', sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.16px
  body-strong:
    fontFamily: "'Inter', sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0.16px
  body-sm:
    fontFamily: "'Inter', sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: 0.15px
  caption:
    fontFamily: "'Inter', sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption-uppercase:
    fontFamily: "'Inter', sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.96px
    textTransform: uppercase
  button:
    fontFamily: "'Inter', sans-serif"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: 0
  nav-link:
    fontFamily: "'Inter', sans-serif"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  none: 0px
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
  base: 16px
  md: 20px
  lg: 24px
  xl: 32px
  xxl: 48px
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
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.surface-strong}"
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
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
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
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
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
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: "40px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "44px"
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
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.semantic-error}"
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
    textColor: "{colors.muted}"
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

# editorial-pastel-serif

## Character
An app in this look reads like a quiet print magazine: an off-white canvas, white cards with soft 16px corners, warm near-black ink, and a light-weight serif for page and section titles over Inter for everything else. There is no saturated action colour; the primary action is a near-black pill. The five pastels are used only as soft tints behind labels, so screens stay calm and roomy rather than dense.

## Color roles
- Page canvas: `{colors.canvas}`; quieter side areas: `{colors.canvas-soft}`.
- Raised surface (cards, panels, drawers): `{colors.surface-card}`; inset wells and icon backs: `{colors.surface-strong}`.
- Hairline and borders: `{colors.hairline}`; stronger input borders: `{colors.hairline-strong}`; row dividers: `{colors.hairline-soft}`.
- Text primary `{colors.ink}`; secondary `{colors.body}`; muted `{colors.muted}`; disabled `{colors.muted-soft}`.
- Primary action: `{colors.primary}` pill with `{colors.on-primary}`; pressed `{colors.primary-active}`.
- Secondary action: transparent pill with a `{colors.hairline-strong}` outline and `{colors.ink}` text.
- Link: `{colors.ink}` underlined.
- Focus ring: 2px `{colors.ink}` with a 2px `{colors.canvas}` gap.
- Selected / active: `{colors.surface-strong}` fill with `{colors.ink}` text.
- Error: `{colors.semantic-error}`.

**Status accents** (pastels are tints, not text; always pair with an ink label or glyph):
- Good: `{colors.semantic-success}` text, or `{colors.gradient-mint}` tint.
- Attention: `{colors.gradient-peach}` tint with ink text.
- Problem: `{colors.semantic-error}` text, or `{colors.gradient-rose}` tint.
- In progress: `{colors.gradient-sky}` tint with ink text.
- Neutral: `{colors.surface-strong}` with `{colors.muted}` text.
- Highlight / new: `{colors.gradient-lavender}` tint.

## Type roles
- Page title: `{typography.display-md}` (32px serif, 300).
- Section heading: `{typography.display-sm}` (24px serif, 300).
- Item / card title: `{typography.title-sm}` (18px Inter, 500); `{typography.body-strong}` in lists.
- Body: `{typography.body-md}`; `{typography.body-sm}` in tables.
- UI label: `{typography.caption-uppercase}` for column heads and small labels; `{typography.button}` for buttons; `{typography.nav-link}` for navigation.
- Caption / meta: `{typography.caption}` on `{colors.muted}`.
- Numbers: `{typography.body-strong}` with tabular figures (Inter has them); never set figures in the serif.
- `{typography.display-mega}` (64px) is for one rare headline figure on a summary screen; `{typography.display-xl}` (48px) likewise, never page titles.

## Shape and density
- Radii: buttons, badges and segment controls `{rounded.pill}`; inputs `{rounded.md}`; cards and panels `{rounded.xl}`; dialogs `{rounded.xxl}`; icons `{rounded.full}`.
- Rhythm: `{spacing.xs}` within controls, `{spacing.base}` between fields, `{spacing.lg}` card padding, `{spacing.xl}` between sections.
- Density: roomy. List rows 52px with a `{colors.hairline-soft}` divider; table cell padding `{spacing.sm}` by `{spacing.base}`. For long tables, tighten to 44px rows and keep the serif out of the grid.
- Depth: hairline plus one soft shadow on cards and dialogs.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface-card` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `muted` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `canvas-soft` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface-strong` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `display-sm` type.
- `table-header`: a table's column headings. `surface-strong` ground, `muted` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `surface-strong` ground, `muted` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `canvas-soft` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `pill` corners, `button` type.
- `button-secondary`: every other action. `canvas` ground, `ink` text, `hairline` edge, `md` corners, `button` type.
- `text-input`: a form field. `surface-card` ground, `ink` text, `md` corners, `body-md` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `semantic-error` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `muted` text, `hairline` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.

## Do / Don't
**Do**
- Use the light serif for page and section titles only.
- Keep one near-black pill as the main action per screen.
- Put status on pastel tints with ink text and a label.
- Leave generous space between cards and sections.
- Use Inter with tabular figures for every number.

**Don't**
- Don't print pastels as text or use them for buttons.
- Don't bold the serif or use it in tables.
- Don't add a bright accent colour for actions.
- Don't square off buttons; actions are pills.
- Don't expect this look to carry dense, all-day grids; it suits sparse screens.
