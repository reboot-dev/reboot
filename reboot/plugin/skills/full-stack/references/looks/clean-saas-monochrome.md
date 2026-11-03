---
version: alpha
name: clean-saas-monochrome
description: "White canvas, light-grey 12px cards, near-black 8px buttons, geometric display titles over Inter, and colour kept for status and small badges; suits scheduling, booking, CRM, project and admin tools, from sparse to fairly dense."

colors:
  primary: "#101010"
  primary-active: "#232323"
  primary-disabled: "#e3e5e9"
  ink: "#101010"
  body: "#373d4d"
  muted: "#6a6e7c"
  muted-soft: "#878787"
  hairline: "#e3e5e9"
  hairline-soft: "#f1f2f4"
  canvas: "#ffffff"
  surface-soft: "#f6f7f8"
  surface-card: "#f3f3f3"
  surface-strong: "#e3e5e9"
  surface-dark: "#0f0f0f"
  surface-dark-elevated: "#191919"
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  on-dark-soft: "#9f9fa8"
  brand-accent: "#5d77ee"
  success: "#0eb393"
  warning: "#dea52f"
  error: "#e64b1a"
  badge-orange: "#ec9729"
  badge-pink: "#eb467c"
  badge-violet: "#9a52e2"
  badge-emerald: "#34ccab"

colors-dark:
  primary: "#e8e8e8"
  primary-active: "#cfcfcf"
  primary-disabled: "#202225"
  ink: "#e8e8e8"
  body: "#aab1c1"
  muted: "#7b7f8d"
  muted-soft: "#6f6f6f"
  hairline: "#202225"
  hairline-soft: "#1e1e20"
  canvas: "#121212"
  surface-soft: "#1b1c1c"
  surface-card: "#191919"
  surface-strong: "#202225"
  surface-dark: "#e9e9e9"
  surface-dark-elevated: "#dcdcdc"
  on-primary: "#121212"
  on-dark: "#121212"
  on-dark-soft: "#54545c"
  brand-accent: "#5d77ee"
  success: "#0eb393"
  warning: "#dea52f"
  error: "#e64b1a"
  badge-orange: "#ec9729"
  badge-pink: "#eb467c"
  badge-violet: "#9a52e2"
  badge-emerald: "#34ccab"

typography:
  display-xl:
    fontFamily: "Manrope, Inter, sans-serif"
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -2px
  display-lg:
    fontFamily: "Manrope, Inter, sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -1.5px
  display-md:
    fontFamily: "Manrope, Inter, sans-serif"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -1px
  display-sm:
    fontFamily: "Manrope, Inter, sans-serif"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.5px
  title-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.3px
  title-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  title-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
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
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
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
    backgroundColor: "{colors.surface-soft}"
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
    backgroundColor: "{colors.surface-soft}"
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
    padding: "12px 20px"
    height: "40px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "40px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: "40px"
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
    textColor: "{colors.error}"
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

# clean-saas-monochrome

## Character
An app in this look is calm and monochrome: a white canvas, light-grey cards, and near-black buttons that carry every primary action. Colour is rationed to status and small category badges; links and actions stay black. Page titles use a tight geometric display face while everything else is Inter, and shapes are soft but businesslike: 8px controls, 12px cards, pill segment switchers.

## Color roles
- Page canvas: `{colors.canvas}`; side bars and table headers: `{colors.surface-soft}`.
- Raised surface (cards, panels, drawers): `{colors.surface-card}`, or `{colors.canvas}` with a `{colors.hairline}` border when it sits on grey.
- Hairline and borders: `{colors.hairline}`; row dividers inside cards: `{colors.hairline-soft}`.
- Text primary `{colors.ink}`; secondary `{colors.body}`; muted `{colors.muted}`; faint meta `{colors.muted-soft}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; pressed `{colors.primary-active}`; disabled `{colors.primary-disabled}`.
- Secondary action: `{colors.canvas}` with `{colors.ink}` text and a `{colors.hairline}` border.
- Link: `{colors.ink}` underlined; `{colors.brand-accent}` only for links inside dense text where black would vanish.
- Focus ring: 2px `{colors.brand-accent}`.
- Selected / active: `{colors.canvas}` chip inside a `{colors.surface-soft}` group, or a `{colors.surface-strong}` row fill.
- Error: `{colors.error}`.

**Status accents** (dot or tinted pill with a text label; never colour alone):
- Good: `{colors.success}`.
- Attention: `{colors.warning}`.
- Problem: `{colors.error}`.
- In progress: `{colors.brand-accent}`.
- Neutral / draft: `{colors.muted}`.
- Category tags, not status: `{colors.badge-orange}`, `{colors.badge-pink}`, `{colors.badge-violet}`, `{colors.badge-emerald}`.

## Type roles
- Page title: `{typography.display-sm}` (28px display face).
- Section heading: `{typography.title-lg}` (22px).
- Item / card title: `{typography.title-sm}` (16px, 600); `{typography.title-md}` for a detail panel header.
- Body: `{typography.body-sm}` in tables and forms; `{typography.body-md}` for longer text.
- UI label: `{typography.caption}` for field labels and badges; `{typography.button}` for buttons; `{typography.nav-link}` for navigation.
- Caption / meta: `{typography.caption}` on `{colors.muted}`.
- Numbers: `{typography.body-sm}` or `{typography.title-sm}` with tabular figures (Inter has them); IDs and keys in `{typography.code}`.
- `{typography.display-xl}` (64px) is for one rare headline figure; `{typography.display-lg}` (48px) and `{typography.display-md}` are not for page titles.

## Shape and density
- Radii: buttons, inputs, tabs `{rounded.md}`; small menu items `{rounded.sm}`; cards and panels `{rounded.lg}`; dialogs `{rounded.xl}`; badges and segment groups `{rounded.pill}`; avatars `{rounded.full}`.
- Rhythm: `{spacing.xs}` within controls, `{spacing.sm}` between related items, `{spacing.md}` card padding in dense views, `{spacing.lg}` between panels, `{spacing.xl}` between page sections.
- Density: table rows 40px (36px compact), cell padding `{spacing.xs}` by `{spacing.sm}`; board columns on `{colors.surface-soft}` with white cards and `{spacing.xs}` gaps.
- Depth: grey-on-white tint first, hairline second; a faint shadow only for menus, popovers and dialogs.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface-card` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `muted` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `surface-soft` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface-strong` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `display-sm` type.
- `table-header`: a table's column headings. `surface-strong` ground, `muted` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `surface-strong` ground, `muted` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface-soft` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `md` corners, `button` type.
- `button-secondary`: every other action. `canvas` ground, `ink` text, `md` corners, `button` type.
- `text-input`: a form field. `canvas` ground, `ink` text, `md` corners, `body-md` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `error` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `muted` text, `hairline` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.

## Do / Don't
**Do**
- Keep one black primary button per screen or dialog.
- Put lists and tables on white and group them in grey cards.
- Use the pill segment switcher for view modes.
- Give each status a dot or pill and a text label.
- Use tabular figures for counts, money and times.

**Don't**
- Don't make actions blue or pastel; actions stay black.
- Don't use the 48px or 64px display sizes for page titles.
- Don't use badge pastels as status colours.
- Don't stack shadows on resting cards.
- Don't round cards beyond `{rounded.xl}`.
