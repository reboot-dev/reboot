---
version: alpha
name: spruce-mint-ledger
description: "White ledger with one deep spruce green for actions, mint washes for grouping, lime for attention, hairline rules, near-square corners and bold-versus-light Montserrat; suits finance, comparison, CRM and operations tools with dense tables and rate grids."

colors:
  primary: "#188465"
  primary-deep: "#136950"
  forest: "#0c4b3a"
  on-primary: "#ffffff"
  lime-hero: "#82ef53"
  lime-panel: "#ebffd4"
  lime-accent: "#dbfeb5"
  lime-ribbon: "#96f370"
  logo-lime: "#7ece5e"
  canvas: "#ffffff"
  canvas-soft: "#f9f9f9"
  mint-50: "#f1fefa"
  mint-100: "#e7fef9"
  mint-200: "#baf0e4"
  hairline: "#ededee"
  hairline-strong: "#dadbdc"
  ink: "#000000"
  body: "#3f4247"
  muted: "#66686c"
  faint: "#b3b5b7"
  link: "#325fbc"
  info: "#6499ea"
  error: "#df3b03"

colors-dark:
  primary: "#268d6e"
  primary-deep: "#207258"
  forest: "#37705d"
  lime-hero: "#82ef53"
  lime-panel: "#233405"
  lime-accent: "#223406"
  lime-ribbon: "#183709"
  logo-lime: "#7ece5e"
  canvas: "#121212"
  canvas-soft: "#191919"
  mint-50: "#0d1614"
  mint-100: "#071916"
  mint-200: "#03362f"
  hairline: "#1a1a1b"
  hairline-strong: "#242425"
  ink: "#e8e8e8"
  body: "#8b8e94"
  muted: "#7c7e82"
  faint: "#393b3d"
  link: "#4b7bda"
  info: "#6499ea"
  error: "#e33f0b"
  on-primary: "#121212"

typography:
  display-xl:
    fontFamily: 'Montserrat'
    fontSize: 52px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: 0
  display-lg:
    fontFamily: 'Montserrat'
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  heading-1:
    fontFamily: 'Montserrat'
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  heading-2:
    fontFamily: 'Montserrat'
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0
  heading-3:
    fontFamily: 'Montserrat'
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0
  heading-4:
    fontFamily: 'Montserrat'
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0
  stat-value:
    fontFamily: 'Montserrat'
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  body-lg:
    fontFamily: 'Montserrat'
    fontSize: 18px
    fontWeight: 300
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: 'Montserrat'
    fontSize: 16px
    fontWeight: 300
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: 'Montserrat'
    fontSize: 14px
    fontWeight: 300
    lineHeight: 1.5
    letterSpacing: 0
  ui-label:
    fontFamily: 'Montserrat'
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  ui-sm:
    fontFamily: 'Montserrat'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0
  caption:
    fontFamily: 'Montserrat'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  eyebrow:
    fontFamily: 'Montserrat'
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  micro:
    fontFamily: 'Montserrat'
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  none: 0px
  xxs: 1px
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 10px
  xxl: 12px
  xxxl: 16px
  tooltip: 20px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  section: 40px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.canvas-soft}"
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
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.canvas-soft}"
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
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.canvas-soft}"
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
    typography: "{typography.ui-label}"
    rounded: "{rounded.xs}"
    padding: "{spacing.md}"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.ui-label}"
    rounded: "{rounded.xs}"
    padding: "{spacing.md}"
  text-input:
    description: "A form field."
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
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
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.canvas-soft}"
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
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# spruce-mint-ledger

## Character
An app in this look is white and ledger-like: one deep spruce green for every action and active state, a ladder of mint washes for grouped panels, and thin grey rules instead of shadows. Lime is the emphasis colour green cannot be, used for tips and highlights. Type is Montserrat with a strong contrast between bold labels and light body text, and pure black headings. Corners stay nearly square (2 to 8px), which keeps tables and rate grids crisp.

## Color roles
- Page canvas: `{colors.canvas}`; recessed regions and table headers: `{colors.canvas-soft}`.
- Raised surface (cards, panels, drawers): `{colors.canvas}` with a `{colors.hairline-strong}` border; grouped panels `{colors.mint-50}`.
- Hairline and borders: `{colors.hairline}`; card and input borders `{colors.hairline-strong}`.
- Text primary `{colors.ink}`, secondary `{colors.body}`, muted `{colors.muted}`; faint `{colors.faint}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; pressed `{colors.primary-deep}`.
- Secondary action: `{colors.canvas-soft}` with `{colors.primary}` text, or an outline in `{colors.hairline-strong}`.
- Link: `{colors.link}`; in-app navigation links `{colors.primary}`.
- Focus ring: 2px `{colors.info}` outline.
- Selected / active: `{colors.primary}` fill or indicator; selected rows `{colors.mint-100}`.
- Error: `{colors.error}` text, border and icon.
- Dark summary panels: `{colors.primary-deep}` or `{colors.forest}` with `{colors.on-primary}`.

**Status accents** (chip fill plus text tone; add an icon):
- Good: `{colors.forest}` on `{colors.mint-100}`.
- In progress: `{colors.info}` dot with a `{colors.body}` label.
- Attention: `{colors.ink}` on `{colors.lime-accent}`.
- Problem: `{colors.error}` on `{colors.canvas}` with an error icon.
- Neutral: `{colors.muted}` on `{colors.canvas-soft}`.

## Type roles
- Page title: `{typography.heading-2}`; section heading: `{typography.heading-3}`.
- Item / card title: `{typography.heading-4}`; compact titles `{typography.ui-label}`.
- Body: `{typography.body-md}`; dense rows `{typography.body-sm}`.
- UI label: `{typography.ui-label}`; small controls `{typography.ui-sm}`; column headers `{typography.eyebrow}`.
- Caption / meta: `{typography.caption}`; tiny tags `{typography.micro}`.
- Numbers: `{typography.stat-value}` for KPIs; `{typography.ui-sm}` in tables with tabular figures (Montserrat has them).
- `{typography.display-xl}` (52px) and `{typography.display-lg}` are for one rare headline figure, never page titles; `{typography.heading-1}` is the ceiling for a dashboard title.

## Shape and density
- Radii: buttons `{rounded.xs}`; inputs `{rounded.none}`; nav rows and chips `{rounded.sm}`; cards, panels, dialogs `{rounded.lg}`; badges `{rounded.xl}`; large tiles `{rounded.xxl}`; grouped panels `{rounded.xxxl}`; tooltips `{rounded.tooltip}`; icon circles `{rounded.full}`.
- Rhythm: `{spacing.xxs}` and `{spacing.xs}` inside controls, `{spacing.sm}` between fields, `{spacing.md}` grid gaps and button padding, `{spacing.xl}` card padding, `{spacing.section}` between page regions.
- Tables and lists: 40 to 44px rows, cell padding `{spacing.sm} {spacing.md}`, `{colors.hairline}` rules, eyebrow headers on `{colors.canvas-soft}`.
- Boards: bordered white cards on `{colors.mint-50}` columns with `{spacing.sm}` gaps.
- Depth: almost none; hairlines and mint washes, and one faint wide shadow for dialogs and toasts.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `canvas-soft` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `muted` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `canvas-soft` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `canvas-soft` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `display-lg` type.
- `table-header`: a table's column headings. `canvas-soft` ground, `muted` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `canvas-soft` ground, `muted` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `canvas-soft` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `canvas-soft` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `xs` corners, `ui-label` type.
- `button-secondary`: every other action. `canvas-soft` ground, `primary` text, `xs` corners, `ui-label` type.
- `text-input`: a form field. `ink` text, `none` corners, `body-md` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `error` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `muted` text, `hairline` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.

## Do / Don't
**Do**
- Use green for every action and active state, and nothing else.
- Separate rows with hairlines and group with mint.
- Keep corners at or under `{rounded.lg}` on controls and cards.
- Use bold labels over light body text for scanning.
- Reserve lime for tips and attention.

**Don't**
- Use green to mean success in chips beside green buttons; use mint fill with forest text.
- Add shadows to cards.
- Set page titles in display sizes.
- Fill whole pages with mint.
- Use the light body weight for numbers in tables.
