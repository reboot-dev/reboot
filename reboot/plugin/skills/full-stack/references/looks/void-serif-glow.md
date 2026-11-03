---
version: alpha
name: void-serif-glow
description: "True black canvas, off-white text, translucent-white hairlines, a single white button, code wells in mono and small bright status dots, with a literary serif kept for rare headline figures; suits developer tools, API consoles, logs and monitoring dashboards."

colors:
  primary: "#fdfdff"
  primary-on: "#000000"
  ink: "#fdfdff"
  body: "rgba(253, 253, 255,0.86)"
  charcoal: "rgba(253, 253, 255,0.7)"
  mute: "#a3a6a7"
  ash: "#8a9092"
  stone: "#484c4f"
  on-light: "#000000"
  on-light-mute: "rgba(0, 13, 34,0.7)"
  canvas: "#000000"
  surface-card: "#0b0b0d"
  surface-elevated: "#121214"
  surface-deep: "#07070b"
  hairline: "rgba(255, 255, 255,0.06)"
  hairline-strong: "rgba(255, 255, 255,0.14)"
  divider-soft: "rgba(255, 255, 255,0.04)"
  accent-orange: "#fe8758"
  accent-orange-glow: "rgba(250, 102, 80,0.22)"
  accent-yellow: "#fec97f"
  accent-blue: "#19a8fb"
  accent-blue-glow: "rgba(31, 134, 219,0.34)"
  accent-green: "#70ff87"
  accent-green-glow: "rgba(115, 255, 135,0.18)"
  accent-red: "#fe326b"
  accent-red-glow: "rgba(254, 50, 107,0.34)"
  link: "#19a8fb"
  surface-light: "#f4f9ff"

colors-light:
  primary: "#1a1a1c"
  primary-on: "#fafafa"
  ink: "#1a1a1c"
  body: "rgba(26, 26, 28, 0.86)"
  charcoal: "rgba(26, 26, 28, 0.7)"
  mute: "#4d5051"
  ash: "#5b6062"
  stone: "#909598"
  on-light: "#fafafa"
  on-light-mute: "rgba(223, 237, 253, 0.7)"
  canvas: "#fafafa"
  surface-card: "#d3d3d7"
  surface-elevated: "#cbcbce"
  surface-deep: "#d8d8df"
  hairline: "rgba(26, 26, 26, 0.06)"
  hairline-strong: "rgba(26, 26, 26, 0.14)"
  divider-soft: "rgba(26, 26, 26, 0.04)"
  accent-orange: "#de6b3b"
  accent-orange-glow: "rgba(236, 89, 68, 0.22)"
  accent-yellow: "#b28135"
  accent-blue: "#1492da"
  accent-blue-glow: "rgba(31, 134, 219, 0.34)"
  accent-green: "#02a038"
  accent-green-glow: "rgba(14, 160, 56, 0.18)"
  accent-red: "#fe326b"
  accent-red-glow: "rgba(254, 50, 107, 0.34)"
  link: "#0179b8"
  surface-light: "#1a1e22"

typography:
  display-xxl:
    fontFamily: 'Fraunces'
    fontSize: 96px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.96px
    fontFeature: "ss01, ss04, ss11"
  display-xl:
    fontFamily: 'Fraunces'
    fontSize: 76.8px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.768px
    fontFeature: "ss01, ss04, ss11"
  display-lg:
    fontFamily: 'Geist'
    fontSize: 56px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -2.8px
    fontFeature: "ss01, ss04, ss11"
  heading-md:
    fontFamily: 'Inter'
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: -0.4px
  heading-sm:
    fontFamily: 'Inter'
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: -0.3px
  subtitle:
    fontFamily: 'Geist'
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.3
    fontFeature: "ss01, ss04, ss11"
  body-lg:
    fontFamily: 'Inter'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: 'Geist'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.8px
    fontFeature: "ss01, ss04, ss11"
  body-sm:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
  button-md:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43
  button-sm:
    fontFamily: 'Geist'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: 0.35px
    fontFeature: "ss01, ss03, ss04"
  caption:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  caption-emph:
    fontFamily: 'Helvetica'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.0
  code-md:
    fontFamily: 'Geist Mono'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.6

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
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
  xxxl: 48px
  section: 96px
  band: 128px

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
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.heading-md}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.surface-card}"
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
    backgroundColor: "{colors.surface-card}"
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
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-on}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
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
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
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
    textColor: "{colors.mute}"
    typography: "{typography.caption}"
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

# void-serif-glow

## Character
A pure black workspace with off-white text, built from translucent-white hairlines and two near-black surface steps instead of shadows. The single bright surface is a small white button with black text, used once per view. UI runs in Inter, longer prose in Geist, code in Geist Mono; a literary serif appears only for a rare headline figure or empty state. Bright accents are kept small: status dots, badges and inline highlights, never fills.

## Color roles
- Page canvas: `{colors.canvas}`.
- Raised surface (cards, panels, drawers): `{colors.surface-card}`; menus, popovers and selected panels `{colors.surface-elevated}`; code and log wells `{colors.surface-deep}`.
- Hairlines and borders: `{colors.hairline-strong}` on cards and inputs, `{colors.hairline}` between rows, `{colors.divider-soft}` for faint grouping.
- Text primary `{colors.ink}`, secondary `{colors.body}` or `{colors.charcoal}`, muted `{colors.mute}`; tertiary `{colors.ash}`; disabled `{colors.stone}`.
- Primary action: `{colors.primary}` with `{colors.primary-on}` text; pressed `{colors.surface-light}`.
- Secondary action: `{colors.surface-elevated}` with `{colors.ink}` text and a `{colors.hairline-strong}` border.
- Link: `{colors.link}`.
- Focus ring: 1px `{colors.ink}` border plus a 2px `{colors.accent-blue}` outline.
- Selected / active: `{colors.surface-elevated}` row with `{colors.ink}` text and a `{colors.hairline-strong}` edge.
- Error: `{colors.accent-red}`.
- **Status accents**: good `{colors.accent-green}`; attention `{colors.accent-yellow}`; problem `{colors.accent-red}`; in progress `{colors.accent-blue}`; neutral `{colors.mute}`; a second warning tier `{colors.accent-orange}`. Use them as 8px dots or badge text beside a word; the matching glow tokens are only for a faint tint behind an alert, never a full panel.

## Type roles
- Page title: `{typography.heading-md}`.
- Section heading: `{typography.heading-sm}`.
- Item / card title: `{typography.button-md}` weight 500 in rows; `{typography.heading-sm}` on cards.
- Body: `{typography.body-sm}` for UI; `{typography.body-md}` for longer descriptions.
- UI label: `{typography.button-md}`; nav and pills `{typography.button-sm}`; emphatic small labels `{typography.caption-emph}`.
- Caption / meta: `{typography.caption}`.
- Numbers: `{typography.code-md}` for IDs, hashes and aligned figures; Inter tabular figures in `{typography.body-sm}` for counts.
- `{typography.display-xxl}` (96px), `{typography.display-xl}` and `{typography.display-lg}` are for a rare headline figure or empty state, never a page title.

## Shape and density
- Radii: inline tags `{rounded.xs}`; tabs and chips `{rounded.sm}`; buttons and inputs `{rounded.md}`; cards, panels and code wells `{rounded.lg}`; large panels `{rounded.xl}`; pills, dots and avatars `{rounded.full}`.
- Rhythm: `{spacing.sm}` inside controls, `{spacing.md}` between fields, `{spacing.xl}` card padding, `{spacing.xxl}` between panels.
- Density: table rows 36 to 40px with `{spacing.md}` cell padding and `{colors.hairline}` rules; list rows 40px; board cards padded `{spacing.lg}`.
- Depth: surface steps plus translucent hairlines. No drop shadows.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface-card` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `mute` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `surface-card` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface-card` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `heading-md` type.
- `table-header`: a table's column headings. `surface-card` ground, `mute` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `surface-card` ground, `mute` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface-card` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `primary-on` text, `md` corners, `button-md` type.
- `button-secondary`: every other action. `canvas` ground, `ink` text, `hairline` edge, `md` corners, `button-md` type.
- `text-input`: a form field. `surface-card` ground, `ink` text, `md` corners, `body-sm` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `mute` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `accent-red` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `mute` text, `hairline` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.

## Do / Don't
- Do keep one white button per view.
- Do separate surfaces with translucent hairlines.
- Do show code, IDs and logs in Geist Mono inside code wells.
- Do use accent colours only as small dots and badge text with a label.
- Do keep the canvas true black.
- Don't fill buttons or panels with accent colours.
- Don't add drop shadows.
- Don't use the serif for page titles or labels.
- Don't use display sizes for page titles.
- Don't put glow washes behind working tables.
