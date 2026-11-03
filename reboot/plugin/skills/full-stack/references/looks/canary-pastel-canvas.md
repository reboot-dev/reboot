---
version: alpha
name: canary-pastel-canvas
description: "Stark white canvas, black pill buttons, rounded geometric sans and pastel sticky-note tints for tags and board cards, with canary yellow kept for highlights; suits collaboration boards, project trackers, booking and friendly team-productivity apps."

colors:
  primary: "#1e1e20"
  on-primary: "#ffffff"
  brand-yellow: "#ffd488"
  brand-yellow-deep: "#fbbe6f"
  yellow-light: "#fff8e9"
  yellow-dark: "#7f6124"
  brand-blue: "#1f76f2"
  blue-450: "#3f84ff"
  blue-pressed: "#0e51ad"
  brand-coral: "#fba2af"
  coral-light: "#fecdd4"
  coral-dark: "#630819"
  brand-rose: "#ffdfff"
  rose-light: "#ffe6f9"
  brand-pink: "#ffe6f9"
  brand-teal: "#3ec1a7"
  teal-light: "#d1fef3"
  moss-dark: "#2a7a70"
  brand-orange-light: "#ffecdf"
  brand-red: "#ffd9df"
  brand-red-dark: "#e7cace"
  success-accent: "#4eb666"
  canvas: "#ffffff"
  surface: "#fafbfd"
  surface-soft: "#fcfdfe"
  surface-yellow: "#fef8eb"
  surface-pricing-featured: "#f8f6ff"
  hairline: "#e3e5eb"
  hairline-soft: "#f1f3f6"
  hairline-strong: "#cacdd8"
  ink-deep: "#000c33"
  ink: "#1e1e20"
  charcoal: "#2e2e36"
  slate: "#575f6e"
  steel: "#6d7582"
  stone: "#9197a5"
  muted: "#a7aab8"
  on-dark: "#ffffff"
  on-dark-muted: "#a7aab8"
  footer-bg: "#1e1e20"

colors-dark:
  primary: "#e7e7ea"
  on-primary: "#121212"
  brand-yellow: "#3d2a04"
  brand-yellow-deep: "#fbbe6f"
  yellow-light: "#1a150b"
  yellow-dark: "#7f6124"
  brand-blue: "#1f76f2"
  blue-450: "#3f84ff"
  blue-pressed: "#2463c1"
  brand-coral: "#fba2af"
  coral-light: "#4d1a26"
  coral-dark: "#a4484d"
  brand-rose: "#411e42"
  rose-light: "#3d2438"
  brand-pink: "#3d2438"
  brand-teal: "#3ec1a7"
  teal-light: "#00372e"
  moss-dark: "#2a7a70"
  brand-orange-light: "#251910"
  brand-red: "#472028"
  brand-red-dark: "#3d2c2e"
  success-accent: "#4eb666"
  canvas: "#121212"
  surface: "#141416"
  surface-soft: "#141516"
  surface-yellow: "#1a150c"
  surface-pricing-featured: "#17151c"
  hairline: "#222327"
  hairline-soft: "#1d1f21"
  hairline-strong: "#32343d"
  ink-deep: "#647faf"
  ink: "#e7e7ea"
  charcoal: "#d1d1db"
  slate: "#929baa"
  steel: "#7c8491"
  stone: "#5d6370"
  muted: "#4e505d"
  on-dark: "#121212"
  on-dark-muted: "#4e505d"
  footer-bg: "#e7e7ea"

typography:
  hero-display:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 80px
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: -2px
  display-lg:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 60px
    fontWeight: 500
    lineHeight: 1.10
    letterSpacing: -1.5px
  heading-1:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 48px
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: -1px
  heading-2:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 36px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: -0.5px
  heading-3:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.25
  heading-4:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.30
  heading-5:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.40
  subtitle:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.50
  body-md:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
  body-md-medium:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.50
  body-sm:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
  body-sm-medium:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.50
  caption:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.40
  caption-bold:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.40
  micro:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.40
  micro-uppercase:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: 0.5px
  button-md:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.30
  stat-display:
    fontFamily: 'Plus Jakarta Sans'
    fontSize: 64px
    fontWeight: 500
    lineHeight: 1.10
    letterSpacing: -1.5px

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 20px
  xxxl: 28px
  feature: 32px
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
  section-sm: 48px
  section: 64px
  section-lg: 96px
  hero: 120px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.surface}"
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
    backgroundColor: "{colors.surface-soft}"
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
    backgroundColor: "{colors.surface-soft}"
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
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.surface}"
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
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    border: "1px solid {colors.hairline-strong}"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
    border: "1px solid {colors.hairline-strong}"
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
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.surface}"
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
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# canary-pastel-canvas

## Character
A bright, friendly workspace: stark white canvas, near-black ink, black pill buttons and a rounded geometric sans. Canary yellow is the signature but is rationed to tags, highlights and the odd promoted action, never the main button. Pastel tints (yellow, coral, teal, rose) work like sticky notes: they colour board cards, tags and status, while the chrome stays white and grey. Shapes are generous: full pills for buttons and tabs, 8px inputs, 16px cards.

## Color roles
- Page canvas: `{colors.canvas}`; side panels and table headers: `{colors.surface}`
- Raised surface (cards, panels, drawers): `{colors.canvas}` with a `{colors.hairline-soft}` border; nested wells `{colors.surface-soft}`
- Hairline and borders: `{colors.hairline}`; field borders `{colors.hairline-strong}`
- Text primary: `{colors.ink}`; secondary: `{colors.slate}`; muted: `{colors.steel}`; disabled `{colors.muted}`
- Primary action: `{colors.primary}` fill with `{colors.on-primary}` text
- Secondary action: transparent with `{colors.hairline-strong}` border and `{colors.ink}` text
- Link: `{colors.brand-blue}`
- Focus ring: `{colors.brand-blue}`
- Selected / active: `{colors.primary}` fill on pill tabs; selected rows `{colors.surface-yellow}` with a `{colors.brand-yellow}` edge
- Error: `{colors.coral-dark}` text on `{colors.coral-light}`

**Status accents** (tint fill with dark text, always with a label):
- Good: `{colors.success-accent}` dot, `{colors.moss-dark}` text on `{colors.teal-light}`
- Attention: `{colors.yellow-dark}` on `{colors.surface-yellow}`
- Problem: `{colors.coral-dark}` on `{colors.coral-light}`
- In progress: `{colors.brand-blue}` on `{colors.surface-pricing-featured}`
- Neutral: `{colors.steel}` on `{colors.surface}`
- Review / flagged: `{colors.ink}` on `{colors.brand-rose}`

Never rely on the tint alone; pair it with a word or icon.

## Type roles
- Page title: `{typography.heading-3}`
- Section heading: `{typography.heading-4}`; panel heading `{typography.heading-5}`
- Item / card title: `{typography.body-md-medium}`
- Body: `{typography.body-sm}` in dense views, `{typography.body-md}` in reading views
- UI label: `{typography.body-sm-medium}`; buttons `{typography.button-md}`
- Caption / meta: `{typography.caption}`; column headers `{typography.micro-uppercase}`
- Numbers: `{typography.body-sm-medium}` with tabular figures; KPI tiles `{typography.heading-2}`

`{typography.hero-display}`, `{typography.display-lg}`, `{typography.heading-1}` and `{typography.stat-display}` (48 to 80px) are for one rare headline figure, never page titles.

## Shape and density
- Controls: buttons, tabs, filters and badges `{rounded.full}`; inputs and search `{rounded.md}`; small tags `{rounded.sm}`.
- Cards: `{rounded.xl}` for records and panels; `{rounded.lg}` for compact board cards; tinted feature cards `{rounded.xxxl}` only for large empty-state or summary blocks.
- Spacing on a 4px base: `{spacing.xs}` inside controls, `{spacing.sm}` between fields, `{spacing.md}` card padding on boards, `{spacing.xl}` panel padding, `{spacing.xxl}` between page regions.
- Tables: 44px rows, `{spacing.sm}` by `{spacing.md}` cell padding, `{colors.hairline-soft}` row rules. Board cards: `{spacing.md}` padding, `{spacing.xs}` gap.
- Depth: hairlines first; a soft navy-tinted shadow only on menus, popovers and dragged cards.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `muted` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `surface-soft` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface-soft` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `display-lg` type.
- `table-header`: a table's column headings. `surface-soft` ground, `muted` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `surface-soft` ground, `muted` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface-soft` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `full` corners, `button-md` type.
- `button-secondary`: every other action. transparent ground, `ink` text, `full` corners, `button-md` type.
- `text-input`: a form field. `canvas` ground, `ink` text, `md` corners, `body-md` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `muted` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `primary` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `muted` text, `hairline` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.

## Do / Don't
Do:
- Keep chrome white and grey; let pastel tints colour content.
- Use a black pill for the one main action per view.
- Use the tints as sticky-note colours on board cards and status chips.
- Turn on tabular figures in tables and counters.
- Keep page titles at 28px and below.

Don't:
- Don't make canary yellow the primary button or a page background.
- Don't stack more than three tint colours in one row of cards.
- Don't put white text on the pastel tints.
- Don't use the 48 to 80px display sizes as headings.
- Don't use colour alone to carry a status.
