---
version: alpha
name: cream-journal-serif
description: "Cream paper canvas, warm near-black ink, earth-tone tints for status, one blue pill action, a thin serif for page titles over a quiet grotesque sans; suits booking, client portals, wellness and CRM apps at relaxed density."

colors:
  primary: "#4e6cdb"
  on-primary: "#ffffff"
  stone: "#4c4943"
  on-stone: "#ffffff"
  clay: "#6e4a3d"
  espresso: "#3c271f"
  gold: "#aa8023"
  ochre: "#b89c53"
  gold-soft: "#d8b467"
  gold-pale: "#d8c781"
  gold-deep: "#655515"
  forest: "#204733"
  olive: "#5e7466"
  sage: "#839c7c"
  sage-mute: "#7b8e76"
  sage-pale: "#cfdac1"
  canvas: "#faf4eb"
  surface: "#ffffff"
  surface-grey: "#efefef"
  silver: "#cfcdca"
  ink-band: "#000000"
  ink-band-soft: "#1b1b1e"
  ink: "#1e1d1c"
  ash: "#858482"
  mute: "#aaa7a2"
  on-dark: "#ffffff"
  hairline: "#e4dfd6"
  error: "#db5616"

colors-dark:
  primary: "#5675e5"
  stone: "#b2aea7"
  on-stone: "#0b0b0b"
  clay: "#835d50"
  espresso: "#e2cdc6"
  gold: "#aa8023"
  ochre: "#b89c53"
  gold-soft: "#d8b467"
  gold-pale: "#d8c781"
  gold-deep: "#766629"
  forest: "#476e58"
  olive: "#7a8b80"
  sage: "#839c7c"
  sage-mute: "#7b8e76"
  sage-pale: "#273215"
  canvas: "#15110b"
  surface: "#0b0b0b"
  surface-grey: "#1a1a1a"
  silver: "#302e2c"
  ink-band: "#fcfcfc"
  ink-band-soft: "#eaeaee"
  ink: "#e9e7e6"
  ash: "#706f6d"
  mute: "#504e49"
  on-dark: "#0b0b0b"
  hairline: "#242019"
  error: "#db5616"
  on-primary: "#14110e"

typography:
  display:
    fontFamily: 'Fraunces'
    fontSize: 110px
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: 0
  display-2:
    fontFamily: 'Fraunces'
    fontSize: 80px
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: 0
  heading-1:
    fontFamily: 'Fraunces'
    fontSize: 68px
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: 0
  heading-2:
    fontFamily: 'Fraunces'
    fontSize: 40px
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: 0
  heading-3:
    fontFamily: 'Hanken Grotesk'
    fontSize: 40px
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: 0
  title:
    fontFamily: 'Hanken Grotesk'
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: 0
  lead:
    fontFamily: 'Fraunces'
    fontSize: 24px
    fontWeight: 100
    lineHeight: 1.25
    letterSpacing: 0
  body-lg:
    fontFamily: 'Hanken Grotesk'
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body:
    fontFamily: 'Hanken Grotesk'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: 'Hanken Grotesk'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  button:
    fontFamily: 'Hanken Grotesk'
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0
  ui:
    fontFamily: 'Hanken Grotesk'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  caption:
    fontFamily: 'Hanken Grotesk'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  eyebrow:
    fontFamily: 'Hanken Grotesk'
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 1px

rounded:
  none: 0px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 24px
  xl: 40px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    height: "56px"
    padding: "0 24px"
  app-nav-item:
    description: "A link in the navigation."
    textColor: "{colors.mute}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.mute}"
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
    backgroundColor: "{colors.surface}"
    textColor: "{colors.mute}"
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
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.stone}"
    textColor: "{colors.on-stone}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.stone}"
    textColor: "{colors.on-stone}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
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
    textColor: "{colors.mute}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.error}"
    typography: "{typography.body-sm}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.surface}"
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
    textColor: "{colors.mute}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# cream-journal-serif

## Character
A warm, calm app on cream paper rather than white, with near-black warm ink and one clear blue pill for the main action. Earth tones (gold, clay, olive, sage) carry status and categories in soft tints. A thin high-contrast serif names pages and big figures; a quiet grotesque sans does all the work. Shapes are soft: round buttons, generously rounded cards.

## Color roles
- Page canvas: `{colors.canvas}`.
- Raised surface (cards, panels, drawers): `{colors.surface}`; secondary panels `{colors.surface-grey}`.
- Hairline and borders: `{colors.hairline}`; stronger input borders `{colors.silver}`.
- Text primary `{colors.ink}`, secondary `{colors.stone}`, muted `{colors.ash}`; disabled `{colors.mute}`.
- Primary action: `{colors.primary}` fill with `{colors.on-primary}` text.
- Secondary action: `{colors.stone}` fill with `{colors.on-stone}` text, or a `{colors.stone}` outline on `{colors.canvas}`.
- Link: `{colors.primary}`.
- Focus ring: 2px `{colors.primary}`.
- Selected / active: `{colors.sage-pale}` fill with `{colors.forest}` text, or a `{colors.stone}` outline pill.
- Error: `{colors.error}` border and message text.
- Dark side rail or dark mode: `{colors.ink-band-soft}` with `{colors.on-dark}` text.

**Status accents**
- Good: `{colors.forest}` text on a `{colors.sage-pale}` tint.
- Attention: `{colors.gold-deep}` text on a `{colors.gold-pale}` tint.
- Problem: `{colors.error}` text or border.
- In progress: `{colors.primary}`.
- Neutral: `{colors.stone}` text on `{colors.surface-grey}`.
- Category extras: `{colors.clay}`, `{colors.olive}`, `{colors.ochre}`.
Pair every status with a label; the earth tones are close in value.

## Type roles
- Page title: `{typography.heading-2}` (40px serif, light) on overview screens; `{typography.title}` on dense screens.
- Section heading: `{typography.title}`.
- Item / card title: `{typography.body}` set at weight 600, or `{typography.body-lg}` in roomy cards.
- Body: `{typography.body-sm}`; `{typography.body}` for reading text in a detail view.
- UI label: `{typography.ui}`; buttons `{typography.button}`.
- Caption / meta: `{typography.caption}`; column headers `{typography.eyebrow}`.
- Numbers: `{typography.body-sm}` or `{typography.ui}` with tabular figures where the sans offers them; a big figure in `{typography.heading-1}`.
- `{typography.display}` (110px), `{typography.display-2}` (80px) and `{typography.heading-1}` (68px) are for one rare headline figure, never a page title.

## Shape and density
- Radii: buttons, tabs and tags `{rounded.full}`; inputs `{rounded.md}`; cards, panels, dialogs and toasts `{rounded.lg}`; image tiles `{rounded.xl}`; small chips `{rounded.sm}`.
- Spacing: `{spacing.xs}` inside chips, `{spacing.sm}` between controls, `{spacing.md}` card gaps, `{spacing.lg}` card padding, `{spacing.xl}` between page regions.
- Density is relaxed. Table rows 44 to 48px, cells padded `{spacing.sm}` by `{spacing.md}`, `{colors.hairline}` dividers, `{colors.surface}` header row. Boards: white cards on cream columns.
- Depth: mostly flat, with hairlines and the cream-to-white shift. Dialogs and toasts get a soft, warm, low-opacity shadow.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface` ground, `ink` text, `hairline` edge, `body` type.
- `app-nav-item`: a link in the navigation. `mute` text, `sm` corners, `body` type.
- `app-nav-item-active`: the page you are on. `surface` ground, `ink` text, `sm` corners, `body` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `display` type.
- `table-header`: a table's column headings. `surface` ground, `mute` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `board-lane`: a column of a board. `surface` ground, `mute` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `surface` ground, `ink` text, `full` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `full` corners, `button` type.
- `button-secondary`: every other action. `stone` ground, `on-stone` text, `full` corners, `button` type.
- `text-input`: a form field. `stone` ground, `on-stone` text, `md` corners, `body-sm` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `field-label`: a form field's label. `mute` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `error` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `dialog`: a box over the page that asks for one decision. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `mute` text, `hairline` edge, `lg` corners, `body` type.
- `sign-in-panel`: the sign-in screen's panel. `surface` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.

## Do / Don't
- Do keep the canvas cream and reserve white for cards and inputs.
- Do keep blue for the single main action, links and focus.
- Do use earth-tone tints for status, always with a word.
- Do use the serif only for page titles and big figures.
- Don't set body, tables or forms in the serif.
- Don't use the 68px and larger sizes as page titles.
- Don't add hard or dark shadows.
- Don't use `{colors.error}` for anything but errors.
