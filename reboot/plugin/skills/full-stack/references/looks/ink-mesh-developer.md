---
version: alpha
name: ink-mesh-developer
description: "Near-white canvas with ink-black actions, a fine grey border ladder, soft stacked shadows, tightly tracked geometric sans with monospace labels and soft-plus-deep status chips; suits developer tools, dashboards, admin consoles and dense operations tools."

colors:
  primary: "#151515"
  on-primary: "#ffffff"
  ink: "#151515"
  body: "#4b4b4b"
  mute: "#868686"
  hairline: "#e9e9e9"
  hairline-strong: "#9f9f9f"
  canvas: "#ffffff"
  canvas-soft: "#f8f8f8"
  canvas-soft-2: "#f3f3f3"
  link: "#3f65eb"
  link-deep: "#3657c9"
  link-bg-soft: "#d3dffa"
  success: "#3f65eb"
  error: "#cb4c1f"
  error-soft: "#f2d0ce"
  error-deep: "#a73c17"
  warning: "#e4a91e"
  warning-soft: "#f6eccc"
  warning-deep: "#9b5c11"
  violet: "#811fb6"
  violet-soft: "#d8c6e8"
  violet-deep: "#51217c"
  cyan: "#44ddcc"
  cyan-soft: "#a4f9f1"
  cyan-deep: "#12b7a4"
  highlight-pink: "#fb0962"
  highlight-magenta: "#e73665"
  gradient-cool-start: "#3f72e9"
  gradient-cool-end: "#0fd8e0"
  gradient-violet-start: "#811fb6"
  gradient-violet-end: "#fb0962"
  gradient-warm-start: "#f5522d"
  gradient-warm-end: "#e4cd37"
  selection-bg: "#151515"
  selection-fg: "#f0f0f0"

colors-dark:
  primary: "#e8e8e8"
  on-primary: "#121212"
  ink: "#e8e8e8"
  body: "#a7a7a7"
  mute: "#707070"
  hairline: "#202020"
  hairline-strong: "#575757"
  canvas: "#121212"
  canvas-soft: "#1b1b1b"
  canvas-soft-2: "#1e1e1e"
  link: "#4a72f9"
  link-deep: "#5076ec"
  link-bg-soft: "#212d49"
  success: "#4a72f9"
  error: "#d5562a"
  error-soft: "#4b2726"
  error-deep: "#cd5e3b"
  warning: "#e4a91e"
  warning-soft: "#382d01"
  warning-deep: "#ae6e2a"
  violet: "#9337ca"
  violet-soft: "#d8c6e8"
  violet-deep: "#7e51af"
  cyan: "#44ddcc"
  cyan-soft: "#083532"
  cyan-deep: "#12b7a4"
  highlight-pink: "#fb0962"
  highlight-magenta: "#e73665"
  gradient-cool-start: "#3f72e9"
  gradient-cool-end: "#0fd8e0"
  gradient-violet-start: "#9337ca"
  gradient-violet-end: "#fb0962"
  gradient-warm-start: "#f5522d"
  gradient-warm-end: "#e4cd37"
  selection-bg: "#e8e8e8"
  selection-fg: "#1b1b1b"

typography:
  display-xl:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 48px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -2.4px
  display-lg:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -1.28px
  display-md:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.96px
  display-sm:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.6px
  body-lg:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0px
  body-md:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md-strong:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
  body-sm:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: -0.28px
  body-sm-strong:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.28px
  caption:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  caption-mono:
    fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  code:
    fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  button-md:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  button-lg:
    fontFamily: 'Manrope, Inter, system-ui, -apple-system, sans-serif'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill-sm: 64px
  pill: 100px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 96px
  6xl: 128px
  section: 192px

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
    textColor: "{colors.mute}"
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
    typography: "{typography.display-sm}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.canvas-soft}"
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
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.mute}"
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
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.sm}"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.sm}"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
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
    textColor: "{colors.mute}"
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

# ink-mesh-developer

## Character
An app in this look is near-white and exact: ink-black type and actions, a fine grey ladder for every border and state, and barely-there stacked shadows. Colour appears only as small status chips in soft and deep pairs; the mesh gradient is decoration for one empty state at most. Headings are a geometric sans with tight negative tracking, and every small label, ID, path and table header is monospace. Controls are compact, 28 to 40px tall, with small square-ish corners in the app and pills only for standalone actions.

## Color roles
- Page canvas: `{colors.canvas-soft}`; inset regions and table headers: `{colors.canvas-soft-2}`.
- Raised surface (cards, panels, drawers): `{colors.canvas}` with a `{colors.hairline}` border.
- Hairline and borders: `{colors.hairline}`; strong borders and hover outlines `{colors.hairline-strong}`.
- Text primary `{colors.ink}`, secondary `{colors.body}`, muted `{colors.mute}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`.
- Secondary action: `{colors.canvas}` with `{colors.ink}` and a `{colors.hairline}` border.
- Link: `{colors.link}`; hover `{colors.link-deep}`.
- Focus ring: 2px `{colors.link}` outline over a `{colors.link-bg-soft}` halo.
- Selected / active: `{colors.selection-bg}` with `{colors.selection-fg}` for selected rows and text; a `{colors.primary}` left bar on nav rows.
- Error: `{colors.error}` border and icon, `{colors.error-deep}` text, `{colors.error-soft}` fill.

**Status accents** (deep tone for text, soft tone for the chip fill):
- Good: `{colors.cyan-deep}` dot on `{colors.cyan-soft}` with an ink label (note `{colors.success}` is blue here; treat it as in progress).
- In progress: `{colors.link}` on `{colors.link-bg-soft}`.
- Attention: `{colors.warning-deep}` on `{colors.warning-soft}`.
- Problem: `{colors.error-deep}` on `{colors.error-soft}`.
- Neutral: `{colors.body}` on `{colors.canvas-soft-2}`.
- Special or queued: `{colors.violet-deep}` on `{colors.violet-soft}`.

## Type roles
- Page title: `{typography.display-md}`; section heading: `{typography.display-sm}`.
- Item / card title: `{typography.body-md-strong}`.
- Body: `{typography.body-md}`; dense rows `{typography.body-sm}`.
- UI label: `{typography.body-sm-strong}`; buttons `{typography.button-md}`, large `{typography.button-lg}`.
- Caption / meta: `{typography.caption}`; table headers, IDs and timestamps `{typography.caption-mono}`.
- Numbers: `{typography.body-sm}` with tabular figures (Manrope has them); code and logs `{typography.code}`.
- `{typography.display-xl}` (48px) and `{typography.display-lg}` are for a single headline figure or empty state, not page titles.

## Shape and density
- Radii: inputs, nav buttons, nav rows `{rounded.sm}`; cards, toasts `{rounded.md}`; dialogs and large panels `{rounded.lg}`; tags `{rounded.xs}`; standalone actions `{rounded.pill}`; tabs `{rounded.pill-sm}`; icon buttons `{rounded.full}`.
- Rhythm: `{spacing.xxs}` and `{spacing.xs}` inside controls, `{spacing.sm}` between fields, `{spacing.md}` grid gaps, `{spacing.lg}` card padding, `{spacing.xl}` between page regions.
- Tables and lists: 36 to 40px rows, cell padding `{spacing.xs} {spacing.sm}`, `{colors.hairline}` rules, monospace header on `{colors.canvas-soft}`.
- Inputs: 32px in toolbars, 40px in forms, 48px for a single prominent search.
- Depth: hairline borders by default; very soft stacked shadows only on menus, popovers, toasts and dialogs.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `canvas-soft` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `mute` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `canvas-soft` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `canvas-soft` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `display-sm` type.
- `table-header`: a table's column headings. `canvas-soft` ground, `mute` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `canvas-soft` ground, `mute` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `canvas-soft` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `canvas-soft` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `pill` corners, `button-lg` type.
- `button-secondary`: every other action. `canvas` ground, `ink` text, `pill` corners, `button-lg` type.
- `text-input`: a form field. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `mute` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `error` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `mute` text, `hairline` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.

## Do / Don't
**Do**
- Keep actions ink and let status chips carry the colour.
- Use monospace for IDs, paths, timestamps and headers.
- Separate everything with `{colors.hairline}` first.
- Keep controls 28 to 40px for dense screens.
- Pair soft fills with deep text for chips.

**Don't**
- Use the gradient tokens on controls, charts or status.
- Read `{colors.success}` as green.
- Add heavy single drop shadows.
- Set page titles in `{typography.display-xl}`.
- Use pills for inputs or table controls.
