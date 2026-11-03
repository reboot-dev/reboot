---
version: alpha
name: newsprint-orange-live
description: "Flat white newsroom paper with dense bold Roboto headings, hairline rules, black pill actions, an orange marker bar on section labels and a dedicated live-red for urgent states; suits newsroom desks, live incident feeds, content moderation and dispatch tools."

colors:
  primary: "#fc9451"
  on-primary: "#ffffff"
  live-red: "#c32652"
  ink: "#000000"
  charcoal: "#353535"
  slate: "#5b5b5b"
  canvas: "#ffffff"
  soft: "#f2f2f2"
  hairline: "#dadada"
  silver: "#c0c0c0"
  indigo: "#1e316a"
  night-navy: "#0d1432"
  network-canvas: "#1a1a1a"
  gold: "#e9a02f"
  amber: "#fda660"
  select-gold: "#fbca7e"
  rail-teal: "#38d0bf"
  rail-red: "#be1436"
  mist: "#dfdfdf"
  graphite: "#343434"

colors-dark:
  primary: "#fc9451"
  live-red: "#c32652"
  ink: "#e8e8e8"
  charcoal: "#999999"
  slate: "#7f7f7f"
  canvas: "#121212"
  soft: "#1f1f1f"
  hairline: "#252525"
  silver: "#343434"
  indigo: "#4c64a2"
  night-navy: "#5a668a"
  network-canvas: "#b3b3b3"
  gold: "#e9a02f"
  amber: "#fda660"
  select-gold: "#3e2904"
  rail-teal: "#38d0bf"
  rail-red: "#c51f3c"
  mist: "#222222"
  graphite: "#9a9a9a"
  on-primary: "#121212"

typography:
  headline-xl:
    fontFamily: 'Roboto'
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  headline-lg:
    fontFamily: 'Roboto'
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0
  headline-md:
    fontFamily: 'Roboto'
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0
  headline-sm:
    fontFamily: 'Roboto'
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: 0
  network-display:
    fontFamily: 'Roboto'
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  section-eyebrow:
    fontFamily: 'Roboto'
    fontSize: 24px
    fontWeight: 300
    lineHeight: 1.2
    letterSpacing: 0
  label-black:
    fontFamily: 'Roboto'
    fontSize: 14px
    fontWeight: 900
    lineHeight: 1
    letterSpacing: 0
  body:
    fontFamily: 'Roboto'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: 'Roboto'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  caption:
    fontFamily: 'Roboto'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  button:
    fontFamily: 'Roboto'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0

rounded:
  xs: 2px
  sm: 4px
  md: 10px
  lg: 18px
  xl: 22px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
  huge: 30px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    height: "56px"
    padding: "0 24px"
  app-nav-item:
    description: "A link in the navigation."
    textColor: "{colors.slate}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.headline-xl}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.slate}"
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
    backgroundColor: "{colors.primary}"
    textColor: "{colors.slate}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  status-pill:
    description: "A short status word on a tinted ground; each app status gets its own colour from the palette."
    backgroundColor: "{colors.primary}"
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
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.slate}"
    rounded: "{rounded.xl}"
    padding: "0px 15px"
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
    textColor: "{colors.slate}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.canvas}"
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
    textColor: "{colors.slate}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# newsprint-orange-live

## Character
An app in this look reads like a newsroom wire desk: flat white paper, dense bold Roboto headings, hairline rules and no shadows. Orange is a marker, not a control: it fronts section labels and marks the active nav item, while every action is a compact black pill. A dedicated red signals what is live, urgent or failing. Hierarchy comes from the wide Roboto weight range, 300 for section labels up to 900 for tiny status tags. A dark variant uses near-black and indigo surfaces with gold accents.

## Color roles
- Page canvas: `{colors.canvas}`; dark variant `{colors.network-canvas}`.
- Raised surface (cards, panels, drawers): `{colors.canvas}` divided by rules, or `{colors.soft}` for a grouped panel; dark panels `{colors.indigo}` or `{colors.night-navy}`.
- Hairline and borders: `{colors.hairline}`; timeline rails `{colors.silver}`; strong rules `{colors.ink}`.
- Text primary: `{colors.ink}`; on dark `{colors.on-primary}`.
- Text secondary: `{colors.charcoal}`; dark variant body `{colors.graphite}` on light bands, `{colors.mist}` on dark.
- Text muted: `{colors.slate}`.
- Primary action: `{colors.ink}` pill with `{colors.on-primary}` text.
- Secondary action: `{colors.canvas}` with a `{colors.slate}` border and `{colors.ink}` text.
- Link: `{colors.ink}`, underlined on hover; dark variant active links `{colors.amber}`.
- Focus ring: 2px `{colors.primary}` outline.
- Selected / active: `{colors.primary}` bar beside the item, or `{colors.select-gold}` border on filters.
- Error: `{colors.live-red}`.

**Status accents**
- Live / problem / urgent: `{colors.live-red}`.
- Attention: `{colors.gold}` as a dot or bar with an `{colors.ink}` label.
- Good / done: `{colors.rail-teal}` as a dot or bar (too light for text) with a label.
- In progress: `{colors.indigo}`.
- Neutral / archived: `{colors.slate}`.
- Critical rail: `{colors.rail-red}` for a whole failing group.
Status always carries a word, such as LIVE, LATE or DONE, in `{typography.label-black}`.

## Type roles
- Page title: `{typography.headline-lg}` (32px); `{typography.headline-xl}` for a single detail view title.
- Section heading: `{typography.section-eyebrow}` uppercase, behind the orange bar.
- Item / card title: `{typography.headline-sm}`; larger cards `{typography.headline-md}`.
- Body: `{typography.body}`; dense lists `{typography.body-sm}`.
- UI label: `{typography.button}` for buttons; `{typography.label-black}` for status tags.
- Caption / meta: `{typography.caption}` in `{colors.slate}` for timestamps and bylines.
- Numbers: `{typography.body-sm}` with `tabular-nums` (Roboto has them); rank numerals `{typography.headline-lg}` in `{colors.slate}`.
- No size exceeds 40px; `{typography.network-display}` (36px) is for a dark-variant page title.

## Shape and density
- Controls: buttons `{rounded.lg}`; inputs `{rounded.xl}`; status tags `{rounded.xs}`; tooltips `{rounded.sm}`.
- Cards and panels: square, or `{rounded.md}` for thumbnails and media tiles.
- Pills, counters, avatars: `{rounded.full}`.
- Rhythm: `{spacing.xs}` inside controls, `{spacing.lg}` inside cards, `{spacing.sm}` to `{spacing.lg}` between cards, `{spacing.xxl}` to `{spacing.huge}` between page regions.
- Tables and lists: 40px rows, `{spacing.md}` by `{spacing.lg}` cell padding, `{colors.hairline}` rules.
- Timelines: `{colors.live-red}` dots on a `{colors.silver}` rail with timestamped items.
- Depth: flat; one dropdown shadow, `0 6px 12px rgba(0, 0, 0,0.175)`, for menus only.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `app-nav-item`: a link in the navigation. `slate` text, `sm` corners, `body` type.
- `app-nav-item-active`: the page you are on. `primary` ground, `ink` text, `sm` corners, `body` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `primary` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `headline-xl` type.
- `table-header`: a table's column headings. `primary` ground, `slate` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `board-lane`: a column of a board. `primary` ground, `slate` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `canvas` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `primary` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `md` corners, `button` type.
- `button-secondary`: every other action. `canvas` ground, `ink` text, `hairline` edge, `md` corners, `button` type.
- `text-input`: a form field. `canvas` ground, `ink` text, `slate` edge, `xl` corners, `body` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `field-label`: a form field's label. `slate` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `primary` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `canvas` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `dialog`: a box over the page that asks for one decision. `canvas` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `slate` text, `hairline` edge, `lg` corners, `body` type.
- `sign-in-panel`: the sign-in screen's panel. `canvas` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.

## Do / Don't
**Do**
- Keep screens flat and dense, separated by hairline rules.
- Use black pills for every action.
- Use orange only to mark section headings and the active item.
- Keep red for live, urgent and failed states.
- Timestamp every activity item in the caption style.

**Don't**
- Don't fill buttons or links with orange.
- Don't use red for decoration or ordinary emphasis.
- Don't add card shadows or tinted card fills.
- Don't set teal or gold as text on white.
- Don't mix the dark-variant gold and indigo into the light screens.
