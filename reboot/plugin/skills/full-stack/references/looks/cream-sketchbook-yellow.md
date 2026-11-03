---
version: alpha
name: cream-sketchbook-yellow
description: "Warm cream canvas with white bordered cards, olive ink, one yellow-orange primary action, pastel status tints, small 4-6px corners and IBM Plex Sans with monospace; suits developer tools, analytics dashboards, internal operations tools and documentation-heavy apps."

colors:
  primary: "#eeb118"
  primary-pressed: "#d69b11"
  primary-active: "#ac811f"
  on-primary: "#24261e"
  ink: "#24261e"
  body: "#4f5148"
  charcoal: "#35362e"
  mute: "#6e7065"
  ash: "#9d9e94"
  stone: "#b8b9b1"
  hairline: "#c1c3b9"
  hairline-soft: "#dee1d4"
  on-dark: "#ffffff"
  canvas: "#f0f1eb"
  surface-soft: "#e7e9e2"
  surface-card: "#ffffff"
  surface-doc: "#fefefc"
  surface-dark: "#24261e"
  link-blue: "#444cd7"
  link-teal: "#3278a9"
  accent-blue: "#5083e3"
  accent-blue-soft: "#e2edfa"
  accent-red: "#cd4e28"
  accent-red-soft: "#fadbd4"
  accent-green: "#259075"
  accent-green-soft: "#dbf1e6"
  accent-purple: "#88459e"
  accent-purple-soft: "#eedbef"
  focus-ring: "rgba(94, 128, 247,0.5)"

colors-dark:
  primary: "#eeb118"
  primary-pressed: "#d69b11"
  primary-active: "#ac811f"
  ink: "#e7e9df"
  body: "#adafa5"
  charcoal: "#d0d2c8"
  mute: "#898b7f"
  ash: "#595950"
  stone: "#3f4039"
  hairline: "#363830"
  hairline-soft: "#202218"
  on-dark: "#080808"
  canvas: "#11120e"
  surface-soft: "#1c1d17"
  surface-card: "#080808"
  surface-doc: "#080807"
  surface-dark: "#e7e9df"
  link-blue: "#5f70fd"
  link-teal: "#387eaf"
  accent-blue: "#5083e3"
  accent-blue-soft: "#101820"
  accent-red: "#cd4e28"
  accent-red-soft: "#44241d"
  accent-green: "#259075"
  accent-green-soft: "#0c1b15"
  accent-purple: "#8e4ba4"
  accent-purple-soft: "#291f2a"
  focus-ring: "rgba(94, 128, 247, 0.5)"
  on-primary: "#11120f"

typography:
  display-xl:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0
  display-lg:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 24px
    fontWeight: 800
    lineHeight: 1.33
    letterSpacing: -0.6px
  heading-lg:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 21px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.5px
  heading-md:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0
  heading-sm:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0
    textTransform: uppercase
  heading-sm-mixed:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.56
    letterSpacing: 0
  body-md:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-strong:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.71
    letterSpacing: 0
  body-sm-strong:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.71
    letterSpacing: 0
  body-xs:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: 0
  caption-md:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.71
    letterSpacing: 0
  caption-sm:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  caption-xs:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: 0
    textTransform: uppercase
  utility-xs:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: 0
    textTransform: uppercase
  link-md:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  button-md:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0
  button-sm:
    fontFamily: 'IBM Plex Sans Variable'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0
  code-sm:
    fontFamily: 'ui-monospace'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0
  code-xs:
    fontFamily: 'Source Code Pro'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: 0

rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
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
    backgroundColor: "{colors.accent-blue-soft}"
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
    typography: "{typography.body-sm}"
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
    typography: "{typography.body-sm}"
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
    backgroundColor: "{colors.accent-blue-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-secondary:
    description: "Every other action."
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  text-input:
    description: "A form field."
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
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
    typography: "{typography.body-sm}"
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

# cream-sketchbook-yellow

## Character
An app in this look sits on a warm cream canvas with white bordered cards and olive-charcoal ink, like a tidy engineering notebook. The yellow-orange is spent only on the primary action; four pastel tints carry status and notices. One family, IBM Plex Sans, does everything from bold headings to dense metadata, with a monospace for IDs and code. Corners are small (4 to 6px), borders are thin, and there are no shadows.

## Color roles
- Page canvas: `{colors.canvas}`; sub-navigation and recessed strips: `{colors.surface-soft}`.
- Raised surface (cards, panels, drawers): `{colors.surface-card}`; long reading panels `{colors.surface-doc}`; inverted code panels `{colors.surface-dark}`.
- Hairline and borders: `{colors.hairline}`; in-card row dividers `{colors.hairline-soft}`.
- Text primary `{colors.ink}`, secondary `{colors.body}` (emphasis `{colors.charcoal}`), muted `{colors.mute}`; disabled `{colors.ash}`, faintest `{colors.stone}`.
- Primary action: `{colors.primary}` with `{colors.on-primary}`; pressed `{colors.primary-pressed}`, deep pressed `{colors.primary-active}`.
- Secondary action: `{colors.surface-soft}` with `{colors.ink}`.
- Link: `{colors.link-blue}`; in long text `{colors.link-teal}`.
- Focus ring: `{colors.focus-ring}` outline plus a 2px `{colors.accent-blue}` border on fields.
- Selected / active: `{colors.surface-card}` lifted tab on cream, or `{colors.ink}` filled pill with `{colors.on-dark}`.
- Error: `{colors.accent-red}` text and border on `{colors.accent-red-soft}`.

**Status accents** (dot or text in the strong tone, chip fill in the soft tone, ink label):
- Good: `{colors.accent-green}` on `{colors.accent-green-soft}`.
- In progress: `{colors.accent-blue}` on `{colors.accent-blue-soft}`.
- Attention: `{colors.primary-active}` text or dot, with `{colors.primary}` reserved for actions.
- Problem: `{colors.accent-red}` on `{colors.accent-red-soft}`.
- Neutral / note: `{colors.accent-purple}` on `{colors.accent-purple-soft}`, or `{colors.mute}` on `{colors.surface-soft}`.

## Type roles
- Page title: `{typography.display-lg}`; section heading: `{typography.heading-lg}`; panel heading `{typography.heading-md}`.
- Item / card title: `{typography.heading-sm-mixed}`; compact titles `{typography.body-strong}`.
- Body: `{typography.body-md}`; dense text `{typography.body-sm}`.
- UI label: `{typography.body-xs}`; buttons `{typography.button-md}`, chips `{typography.button-sm}`; group headers `{typography.utility-xs}` uppercase.
- Caption / meta: `{typography.caption-sm}`; badge text `{typography.caption-xs}`.
- Numbers: `{typography.body-sm-strong}` in tables with tabular figures (Plex has them); IDs and code `{typography.code-xs}`, blocks `{typography.code-sm}`.
- `{typography.display-xl}` (36px) is the largest size; keep it for a single summary figure.

## Shape and density
- Radii: buttons, inputs, cards, callouts `{rounded.md}`; small chips `{rounded.sm}`; inline code `{rounded.xs}`; filter pills `{rounded.full}`; structural bars `{rounded.none}`.
- Rhythm: `{spacing.xs}` and `{spacing.sm}` inside controls, `{spacing.md}` between rows of fields, `{spacing.lg}` grid gaps, `{spacing.xl}` card padding, `{spacing.xxl}` between page regions.
- Tables and lists: 36 to 40px rows, cell padding `{spacing.sm} {spacing.md}`, `{colors.hairline-soft}` rules inside a `{colors.hairline}` bordered card.
- Boards: white cards on cream with `{spacing.lg}` gaps, no shadow.
- Depth: hairline borders and the white-on-cream step only; the dark code panel is the one inverted surface.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `surface-card` ground, `ink` text, `hairline` edge, `body-md` type.
- `app-nav-item`: a link in the navigation. `mute` text, `sm` corners, `body-md` type.
- `app-nav-item-active`: the page you are on. `accent-blue-soft` ground, `ink` text, `sm` corners, `body-md` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `surface-soft` ground, `ink` text, `full` corners, `body-sm` type.
- `page-title`: a page's heading. `ink` text, `heading-lg` type.
- `table-header`: a table's column headings. `surface-soft` ground, `mute` text, `hairline` edge, `body-sm` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body-md` type.
- `board-lane`: a column of a board. `surface-soft` ground, `mute` text, `md` corners, `body-sm` type.
- `board-tile`: one thing on a board, dragged between lanes. `surface-card` ground, `ink` text, `hairline` edge, `md` corners, `body-sm` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. `accent-blue-soft` ground, `ink` text, `full` corners, `body-sm` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `md` corners, `button-md` type.
- `button-secondary`: every other action. `surface-soft` ground, `ink` text, `md` corners, `button-md` type.
- `text-input`: a form field. `surface-card` ground, `ink` text, `md` corners, `body-md` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body-md` type.
- `field-label`: a form field's label. `mute` text, `body-sm` type.
- `field-error`: what is wrong with a field, under it. `accent-red` text, `body-sm` type.
- `card`: a panel that groups one thing's details. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `dialog`: a box over the page that asks for one decision. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `body-sm` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `mute` text, `hairline` edge, `lg` corners, `body-md` type.
- `sign-in-panel`: the sign-in screen's panel. `surface-card` ground, `ink` text, `hairline` edge, `lg` corners, `body-md` type.

## Do / Don't
**Do**
- Keep the cream canvas and put data on white cards.
- Use the pastel tints for status chips and notices.
- Show IDs, keys and timestamps in monospace.
- Use hairlines to separate rows and panels.
- Keep the yellow for one primary action per view.

**Don't**
- Use yellow for warnings or status.
- Add drop shadows to cards or menus beyond a hairline.
- Fill large regions with pastel tints.
- Round cards past `{rounded.lg}`.
- Mix in a second type family besides the monospace.
