---
version: alpha
name: lemon-catalogue
description: "Stark white and black with square cards and inputs, near-square buttons, one bold geometric sans, a full semantic palette and one sunlight-yellow action; suits operations tools, inventory, configurators, booking and service apps."

colors:
  primary: "#feecae"
  primary-deep: "#face1f"
  on-primary: "#000000"
  ink: "#000000"
  body: "#232323"
  charcoal: "#353535"
  mute: "#686868"
  ash: "#8c8c8c"
  stone: "#c6c6c6"
  on-dark: "#ffffff"
  on-dark-mute: "rgba(255, 255, 255,0.72)"
  canvas: "#ffffff"
  surface-soft: "#f9f9f9"
  surface-card: "#ffffff"
  surface-dark: "#000000"
  surface-deep: "#121212"
  hairline: "#f4f4f4"
  hairline-strong: "#000000"
  divider-dark: "rgba(255, 255, 255,0.16)"
  badge-new: "#feecae"
  link: "#06529b"
  error: "#bf6875"
  warning: "#faac61"
  success: "#a3c46c"
  info: "#2482b4"

colors-dark:
  primary: "#382d03"
  primary-deep: "#382d03"
  ink: "#e8e8e8"
  body: "#aaaaaa"
  charcoal: "#999999"
  mute: "#7e7e7e"
  ash: "#696969"
  stone: "#3d3d3d"
  on-dark: "#121212"
  on-dark-mute: "rgba(18, 18, 18, 0.72)"
  canvas: "#121212"
  surface-soft: "#191919"
  surface-card: "#121212"
  surface-dark: "#e8e8e8"
  surface-deep: "#bbbbbb"
  hairline: "#171717"
  hairline-strong: "#e8e8e8"
  divider-dark: "rgba(18, 18, 18, 0.16)"
  badge-new: "#382d03"
  link: "#3d7fcc"
  error: "#bf6875"
  warning: "#faac61"
  success: "#a3c46c"
  info: "#2482b4"
  on-primary: "#e8e8e8"

typography:
  display-xl:
    fontFamily: 'Inter Tight'
    fontSize: 56px
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: 0
  display-lg:
    fontFamily: 'Inter Tight'
    fontSize: 40px
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: 0
  display-md:
    fontFamily: 'Inter Tight'
    fontSize: 32px
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: 0
  heading-lg:
    fontFamily: 'Inter Tight'
    fontSize: 24px
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: 0
  heading-md:
    fontFamily: 'Inter Tight'
    fontSize: 20px
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: 0
  heading-sm:
    fontFamily: 'Inter Tight'
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: 0
  subtitle:
    fontFamily: 'Inter Tight'
    fontSize: 19.2px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  body-lg:
    fontFamily: 'Inter Tight'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: 'Inter Tight'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  body-sm:
    fontFamily: 'Inter Tight'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.57
    letterSpacing: 0
  button-lg:
    fontFamily: 'Inter Tight'
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: 0
  button-md:
    fontFamily: 'Inter Tight'
    fontSize: 14.4px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: 0.144px
  button-sm:
    fontFamily: 'Inter Tight'
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.13px
  caption:
    fontFamily: 'Inter Tight'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  overline:
    fontFamily: 'Inter Tight'
    fontSize: 10px
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: 0

rounded:
  none: 0px
  xs: 2px
  sm: 3px
  md: 4px
  pill: 46px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  xxxl: 40px
  section: 80px

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
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.surface-soft}"
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
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.mute}"
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
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.mute}"
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
    typography: "{typography.button-md}"
    rounded: "{rounded.xs}"
    padding: "14px 24px"
    height: "48px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
    height: "48px"
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
    rounded: "{rounded.md}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
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
    rounded: "{rounded.md}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "28px"

---

# lemon-catalogue

## Character
A stark, high-contrast app: white canvas, black ink, square tiles and near-square 2px buttons, with one sunlight yellow kept for the single most important action and "new" markers. Black panels can invert a sidebar or a summary block, but the working area stays white with faint hairlines between rows. One tight geometric sans carries everything, bold 700 for headings and 400 for body, which makes screens feel decisive and industrial. Pills appear only on filter chips and badges.

## Color roles
- Page canvas: `{colors.canvas}`; grouped areas sit on `{colors.surface-soft}`.
- Raised surface (cards, panels, drawers): `{colors.surface-card}` with a `{colors.hairline-strong}` or `{colors.hairline}` border; dark sidebars and summary panels use `{colors.surface-dark}`, with insets on `{colors.surface-deep}`.
- Hairlines and borders: `{colors.hairline}` between rows, `{colors.hairline-strong}` on outlines and inputs; `{colors.divider-dark}` inside dark panels.
- Text primary `{colors.ink}`, secondary `{colors.charcoal}`, muted `{colors.mute}`; placeholder `{colors.ash}`; on dark `{colors.on-dark}` and `{colors.on-dark-mute}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}` text; pressed `{colors.primary-deep}`.
- Secondary action: `{colors.surface-dark}` with `{colors.on-dark}` text; tertiary is an outline on `{colors.canvas}`.
- Link: `{colors.ink}` underlined; `{colors.link}` only as a fallback for plain text links.
- Focus ring: 2px `{colors.hairline-strong}` outline offset 2px.
- Selected / active: `{colors.surface-soft}` row with a 2px `{colors.ink}` left bar; selected chips invert to `{colors.surface-dark}`.
- Error: `{colors.error}`.
- **Status accents**: good `{colors.success}`; attention `{colors.warning}`; problem `{colors.error}`; in progress `{colors.info}`; neutral `{colors.mute}`; new `{colors.badge-new}`. Success and warning are light on white, so use them as dot or badge fills with `{colors.ink}` text, always with the word.

## Type roles
- Page title: `{typography.display-md}`.
- Section heading: `{typography.heading-lg}`.
- Item / card title: `{typography.heading-sm}`; group headers `{typography.heading-md}`.
- Body: `{typography.body-md}`; dense tables and panels `{typography.body-sm}`.
- UI label: `{typography.button-md}`; chips and small actions `{typography.button-sm}`; overline labels `{typography.overline}`, uppercase.
- Caption / meta: `{typography.caption}`.
- Numbers: `{typography.body-sm}` with tabular figures where the font offers them; headline figures in `{typography.heading-lg}`.
- `{typography.display-xl}` (56px) is for a rare headline figure, never a page title. Display and heading line height is 0.95, so allow room when titles wrap.

## Shape and density
- Radii: buttons and icon buttons `{rounded.xs}`; tabs and small chips `{rounded.sm}`; inline tags `{rounded.md}`; cards, tiles, tables and inputs `{rounded.none}`; filter chips and badges `{rounded.pill}`; swatches and avatars `{rounded.full}`.
- Rhythm: `{spacing.xs}` inside controls, `{spacing.md}` between fields, `{spacing.xl}` card padding, `{spacing.xxl}` between panels.
- Density: table rows 40px with `{spacing.sm}` cell padding and `{colors.hairline}` dividers; list rows 48px; board cards padded `{spacing.md}`.
- Depth: colour blocking and outlines. A faint shadow only on sticky bars, menus and dialogs.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface-card` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `mute` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `surface-soft` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface-soft` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `heading-lg` type.
- `table-header`: a table's column headings. `surface-soft` ground, `mute` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `surface-soft` ground, `mute` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface-soft` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `xs` corners, `button-md` type.
- `button-secondary`: every other action. `canvas` ground, `ink` text, `hairline` edge, `md` corners, `button-md` type.
- `text-input`: a form field. `canvas` ground, `ink` text, `none` corners, `body-md` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `mute` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `error` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `mute` text, `hairline` edge, `md` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-md` type.

## Do / Don't
- Do keep yellow for one primary action and "new" markers.
- Do pair yellow only with black text.
- Do keep cards, tables and inputs square.
- Do use semantic colours for status, each with a label.
- Do use a black sidebar or summary panel to anchor a white workspace.
- Don't put yellow on large surfaces or body text.
- Don't use grey text lighter than `{colors.mute}` for content.
- Don't add shadows to cards.
- Don't use pills for primary buttons.
- Don't use display sizes for page titles.
