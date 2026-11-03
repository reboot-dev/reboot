---
version: alpha
name: warm-neutral-ladder
description: "White canvas with a ladder of warm greys for depth, one charcoal for every action, gold active bar, heavy sans headings with an occasional serif, small radii and no shadows; suits enterprise operations tools, CRM, finance and data-heavy admin apps."

colors:
  primary: "#332f2c"
  primary-pressed: "#494440"
  on-primary: "#ffffff"
  brand-mark: "#c75221"
  ink: "#181715"
  ink-deep: "#23201e"
  canvas: "#ffffff"
  canvas-soft: "#fdfbfa"
  canvas-tint: "#f7f6f4"
  canvas-warm: "#f3f1ef"
  hairline: "#e6e3df"
  divider: "#ebe9e6"
  field-border: "#d6d1cc"
  link: "#296c96"
  accent-gold: "#e8d67c"
  accent-gold-soft: "#f2e8aa"
  band-teal: "#d8e7e7"
  band-forest: "#325946"
  focus: "#3a7fa6"
  error: "#ce531b"
  disabled-ink: "#b0aaa4"

colors-dark:
  primary: "#ccc7c3"
  primary-pressed: "#b4aeaa"
  on-primary: "#121212"
  brand-mark: "#c75221"
  ink: "#e9e8e5"
  ink-deep: "#dedad7"
  canvas: "#121212"
  canvas-soft: "#171515"
  canvas-tint: "#181716"
  canvas-warm: "#1b1a19"
  hairline: "#252320"
  divider: "#211f1d"
  field-border: "#332f2b"
  link: "#4284af"
  accent-gold: "#362e04"
  accent-gold-soft: "#352e04"
  band-teal: "#1b2626"
  band-forest: "#456d59"
  focus: "#3a7fa6"
  error: "#ce531b"
  disabled-ink: "#55504b"

typography:
  display-serif-xl:
    fontFamily: 'Georgia'
    fontSize: 56px
    fontWeight: 400
    lineHeight: 67.2px
    letterSpacing: 0
  display-serif-lg:
    fontFamily: 'Georgia'
    fontSize: 40px
    fontWeight: 400
    lineHeight: 48px
    letterSpacing: 0
  display-serif-md:
    fontFamily: 'Georgia'
    fontSize: 36px
    fontWeight: 400
    lineHeight: 43.2px
    letterSpacing: 0
  display-sans-lg:
    fontFamily: 'Inter'
    fontSize: 40px
    fontWeight: 300
    lineHeight: 52px
    letterSpacing: 0
  display-sans-md:
    fontFamily: 'Inter'
    fontSize: 32px
    fontWeight: 300
    lineHeight: 44px
    letterSpacing: 0
  heading-xl:
    fontFamily: 'Inter'
    fontSize: 28px
    fontWeight: 800
    lineHeight: 33.6px
    letterSpacing: 0
  heading-lg:
    fontFamily: 'Inter'
    fontSize: 24px
    fontWeight: 800
    lineHeight: 28.8px
    letterSpacing: 0
  heading-md:
    fontFamily: 'Inter'
    fontSize: 20px
    fontWeight: 800
    lineHeight: 24px
    letterSpacing: 0
  heading-sm:
    fontFamily: 'Inter'
    fontSize: 18px
    fontWeight: 800
    lineHeight: 21.6px
    letterSpacing: 0
  heading-card:
    fontFamily: 'Inter'
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: 0
  lead:
    fontFamily: 'Inter'
    fontSize: 24px
    fontWeight: 400
    lineHeight: 33.6px
    letterSpacing: 0
  body:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 22.4px
    letterSpacing: 0
  body-loose:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 350
    lineHeight: 24px
    letterSpacing: 0
  body-strong:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 700
    lineHeight: 22.4px
    letterSpacing: 0
  label:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 16.8px
    letterSpacing: 0
  label-strong:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0
  caption:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 15px
  full: 9999px

spacing:
  xs: 10px
  sm: 12px
  md: 16px
  lg: 18px
  xl: 20px
  xxl: 24px
  xxxl: 32px
  section: 48px
  gutter: 72px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    height: "56px"
    padding: "0 24px"
  app-nav-item:
    description: "A link in the navigation."
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.heading-lg}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
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
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
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
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "10px 16px"
  button-secondary:
    description: "Every other action."
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    borderColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "10px 16px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.field-border}"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
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
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.error}"
    typography: "{typography.caption}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "20px"
  toast:
    description: "A short confirmation that disappears by itself."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  empty-state:
    description: "What a list or board says when it has nothing in it yet, and how to add the first."
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# warm-neutral-ladder

## Character
A restrained enterprise app built on a ladder of warm greys instead of a palette. Each step up the ladder marks a deeper zone: sidebar, table header, hover, panel. One dark charcoal carries every action, a soft gold bar marks the active tab, and the red is held back for the wordmark alone. Headings are a heavy sans with a Georgia serif for overview titles; controls have small 4px corners and nothing casts a shadow.

## Color roles
- Page canvas: `{colors.canvas}`.
- Raised surface (cards, panels, drawers): `{colors.canvas}` with a `{colors.hairline}` border; the ladder `{colors.canvas-soft}`, `{colors.canvas-tint}`, `{colors.canvas-warm}` marks sidebars, table headers and summary panels in that order.
- Hairline and borders: `{colors.hairline}`; row and column dividers `{colors.divider}`; input borders `{colors.field-border}`.
- Text primary `{colors.ink}`, secondary `{colors.primary-pressed}`, muted `{colors.primary-pressed}` at caption size; `{colors.disabled-ink}` only for disabled text.
- Dark chrome (sub-navigation bar): `{colors.ink-deep}` with `{colors.on-primary}` text.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; pressed `{colors.primary-pressed}`; disabled `{colors.canvas-soft}` with `{colors.disabled-ink}` text.
- Secondary action: transparent with a 1px `{colors.ink}` border and `{colors.ink}` text.
- Link: `{colors.link}`.
- Focus ring: 2px `{colors.focus}` offset 2px.
- Selected / active: `{colors.canvas-tint}` fill with `{colors.ink}` text; tabs get a `{colors.accent-gold-soft}` bar underneath.
- Error: `{colors.error}`.

**Status accents**:
- Good: `{colors.band-forest}`.
- Attention: `{colors.accent-gold}` as a dot or chip fill with `{colors.ink}` text.
- Problem: `{colors.error}`.
- In progress: `{colors.link}`; `{colors.band-teal}` as its chip fill.
- Neutral: `{colors.canvas-warm}` chip fill with `{colors.ink}` text.
- `{colors.brand-mark}` is never a status; keep it for the wordmark.

## Type roles
- Page title: `{typography.heading-xl}` (28px); an overview page may use `{typography.display-serif-md}`.
- Section heading: `{typography.heading-md}`.
- Item / card title: `{typography.heading-sm}`; dense rows `{typography.label-strong}`.
- Body: `{typography.body}`; longer notes `{typography.body-loose}`; emphasis `{typography.body-strong}`.
- UI label: `{typography.label}`; tabs and column headers `{typography.label-strong}`.
- Caption / meta: `{typography.caption}`.
- Numbers: `{typography.label}` and `{typography.body}` with tabular figures switched on; a summary figure in `{typography.display-sans-md}`.
- `{typography.display-serif-xl}` (56px) is for a rare headline figure, never a page title.

## Shape and density
- Buttons: `{rounded.xs}`; inputs and menus `{rounded.sm}`; cards, dialogs and toasts `{rounded.md}`; navigation tiles `{rounded.lg}`; summary panels `{rounded.xl}`; tables and bars `{rounded.none}`; chips `{rounded.full}`.
- Rhythm: `{spacing.xs}` inside controls, `{spacing.md}` between fields, `{spacing.xxl}` card padding, `{spacing.xxxl}` between page regions. `{spacing.section}` is for empty states; `{spacing.gutter}` is the page side margin on wide screens only.
- Density: table rows 40px with `{spacing.sm}` by `{spacing.md}` cell padding; list rows 44px; board cards padded `{spacing.md}` with `{spacing.xs}` gaps. Suits all-day use.
- Depth: the grey ladder plus hairlines. No shadows anywhere, including dialogs.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `canvas-soft` ground, `ink` text, `hairline` edge, `body` type.
- `app-nav-item`: a link in the navigation. `ink` text, `sm` corners, `body` type.
- `app-nav-item-active`: the page you are on. `canvas-soft` ground, `ink` text, `sm` corners, `body` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `canvas-soft` ground, `ink` text, `full` corners, `caption` type.
- `page-title`: a page's heading. `ink` text, `heading-lg` type.
- `table-header`: a table's column headings. `canvas-soft` ground, `ink` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `board-lane`: a column of a board. `canvas-soft` ground, `ink` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `canvas-soft` ground, `ink` text, `hairline` edge, `md` corners, `caption` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `canvas-soft` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `xs` corners, `label` type.
- `button-secondary`: every other action. `ink` text, `ink` edge, `xs` corners, `label` type.
- `text-input`: a form field. `canvas` ground, `ink` text, `field-border` edge, `sm` corners, `body` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `field-label`: a form field's label. `ink` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `error` text, `caption` type.
- `card`: a panel that groups one thing's details. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `dialog`: a box over the page that asks for one decision. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `caption` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `ink` text, `hairline` edge, `lg` corners, `body` type.
- `sign-in-panel`: the sign-in screen's panel. `canvas-soft` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.

## Do / Don't
Do:
- Climb the grey ladder for depth instead of adding colour.
- Use charcoal for every action button.
- Mark the active tab with the gold bar.
- Divide tables and panels with hairlines.
- Use tabular figures in every numeric column.

Don't:
- Don't use the wordmark red for errors or alerts nearby; keep them apart.
- Don't add shadows to cards or dialogs.
- Don't use `{colors.disabled-ink}` for readable text.
- Don't set table text in the serif.
- Don't paint full-width teal or forest bands across working screens.
