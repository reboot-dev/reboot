---
version: alpha
name: banded-enterprise-blue
description: "White workspace under a light-grey global bar and module tab rail, flat tinted bands instead of borders or shadows, one acting blue, 8px controls on square regions, one variable sans; suits enterprise admin tools, CRM, back-office operations and multi-module business apps."

colors:
  primary: "#1660a3"
  primary-deep: "#084a86"
  on-primary: "#ffffff"
  navy: "#032f5a"
  sky: "#5cbff2"
  canvas: "#ffffff"
  chrome: "#f3f4f5"
  band: "#e8eaec"
  band-blue: "#e9f6fd"
  band-lavender: "#f5f2fd"
  ink: "#000000"
  ink-lead: "#3a3a3a"
  ink-body: "#1c3342"
  ink-list: "#2f4859"
  ink-meta: "#415c6f"
  ink-nav: "#525252"
  hairline: "#415c6f"

colors-dark:
  primary: "#2269ad"
  primary-deep: "#2c67a6"
  navy: "#406a99"
  sky: "#5cbff2"
  canvas: "#121212"
  chrome: "#171718"
  band: "#1b1d1e"
  band-blue: "#0f191e"
  band-lavender: "#18161d"
  ink: "#e8e8e8"
  ink-lead: "#959595"
  ink-body: "#688092"
  ink-list: "#668094"
  ink-meta: "#668196"
  ink-nav: "#808080"
  hairline: "#4f6a7e"
  on-primary: "#e8e8e8"

typography:
  display:
    fontFamily: 'Inter'
    fontSize: 57px
    fontWeight: 700
    lineHeight: 62.7px
    letterSpacing: 0
  hero-title:
    fontFamily: 'Inter'
    fontSize: 36px
    fontWeight: 500
    lineHeight: 39.6px
    letterSpacing: 0
  section-title:
    fontFamily: 'Inter'
    fontSize: 32px
    fontWeight: 500
    lineHeight: 35.2px
    letterSpacing: 0
  lead:
    fontFamily: 'Inter'
    fontSize: 28px
    fontWeight: 400
    lineHeight: 30.8px
    letterSpacing: 0
  subhead:
    fontFamily: 'Inter'
    fontSize: 20px
    fontWeight: 500
    lineHeight: 22px
    letterSpacing: 0
  body-lg:
    fontFamily: 'Inter'
    fontSize: 20px
    fontWeight: 400
    lineHeight: 30px
    letterSpacing: 0
  body:
    fontFamily: 'Inter'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 27px
    letterSpacing: 0
  button:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 500
    lineHeight: 17.6px
    letterSpacing: 0
  link:
    fontFamily: 'Inter'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0
  nav-link:
    fontFamily: 'Inter'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 21px
    letterSpacing: 0
  list-item:
    fontFamily: 'Inter'
    fontSize: 15px
    fontWeight: 350
    lineHeight: 21px
    letterSpacing: 0
  caption:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
    letterSpacing: 0

rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px

spacing:
  xxs: 2px
  xs: 3px
  sm: 8px
  md: 9px
  lg: 10px
  xl: 12px
  xxl: 15px
  wide: 16px
  section: 20px
  giant: 24px
  max: 32px
  huge: 40px
  hero: 48px
  band: 56px
  page: 72px

components:
  app-masthead:
    description: "The bar across the top of every page: the app's name, the signed-in person, sign out."
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    height: "56px"
    padding: "0 24px"
  app-nav-item:
    description: "A link in the navigation."
    textColor: "{colors.ink-meta}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  app-nav-item-active:
    description: "The page you are on."
    backgroundColor: "{colors.band-blue}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  working-context:
    description: "What the whole app is working on, such as the business date, shown in the masthead."
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
  page-title:
    description: "A page's heading."
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  table-header:
    description: "A table's column headings."
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink-meta}"
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
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink-meta}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-tile:
    description: "One thing on a board, dragged between lanes."
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  status-pill:
    description: "A short status word on a tinted ground; each app status gets its own colour from the palette."
    backgroundColor: "{colors.band-blue}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.lg}"
    padding: "2px 8px"
  button-primary:
    description: "The one main action on a page."
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
    height: "44"
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
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
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
    textColor: "{colors.ink-meta}"
    typography: "{typography.caption}"
  field-error:
    description: "What is wrong with a field, under it."
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
  card:
    description: "A panel that groups one thing's details."
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dialog:
    description: "A box over the page that asks for one decision."
    backgroundColor: "{colors.chrome}"
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
    textColor: "{colors.ink-meta}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "32px"
  sign-in-panel:
    description: "The sign-in screen's panel."
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "28px"

---

# banded-enterprise-blue

## Character
A white enterprise workspace framed by a quiet light-grey global bar and a module tab rail. Regions are separated by flat tinted bands, not borders or shadows, and regions stay square while controls take an 8px corner. One blue does all the acting: the primary button, links and the active tab. A single variable sans carries every level, so hierarchy comes from size and weight, never from extra colour.

## Color roles
- Page canvas: `{colors.canvas}`; app chrome (global bar, side rail): `{colors.chrome}`.
- Raised surface (cards, panels, drawers): `{colors.canvas}` on a `{colors.chrome}` or `{colors.band}` ground; tinted panels use `{colors.band-blue}` or `{colors.band-lavender}`.
- Hairline and borders: `{colors.band}` for quiet dividers; `{colors.hairline}` for input borders and table rules.
- Text primary `{colors.ink}`, secondary `{colors.ink-body}`, muted `{colors.ink-meta}`; navigation text `{colors.ink-nav}`.
- Primary action: `{colors.primary}` fill, `{colors.on-primary}` text; pressed `{colors.primary-deep}`.
- Secondary action: `{colors.canvas}` fill with `{colors.primary-deep}` text and border.
- Link: `{colors.primary}`.
- Focus ring: 2px `{colors.primary}` outside a 2px `{colors.canvas}` gap.
- Selected / active: `{colors.band-blue}` row fill with a `{colors.primary}` edge bar.
- Error: the palette has no red; show errors as `{colors.ink}` text on `{colors.band}` with an error icon and a written message.

**Status accents.** The palette is narrow, so status is never colour alone; always pair a label or icon.
- Good / done: `{colors.navy}` text or dot.
- In progress: `{colors.primary}` text on `{colors.band-blue}`.
- Attention: bold `{colors.ink}` label on `{colors.band-lavender}`.
- Problem: bold `{colors.ink}` label plus icon on `{colors.band}`.
- Neutral / draft: `{colors.ink-meta}` text on `{colors.chrome}`.
- `{colors.sky}` is for dots and chart fills only, never text; it is too light on white.

## Type roles
- Page title: `{typography.section-title}` on overview screens, `{typography.subhead}` on working screens.
- Section heading: `{typography.subhead}`.
- Item / card title: `{typography.button}`.
- Body: `{typography.list-item}` in lists and tables; `{typography.body}` for longer reading text only.
- UI label: `{typography.button}` on buttons, `{typography.nav-link}` for nav and form labels.
- Caption / meta: `{typography.caption}`.
- Numbers: `{typography.list-item}` or `{typography.caption}` with tabular figures switched on.
- `{typography.display}` (57px) and `{typography.lead}` are for a rare headline figure or a sign-in screen, never page titles.

## Shape and density
- Radii: controls `{rounded.md}`; cards and dialogs `{rounded.md}` to `{rounded.lg}`; small chips `{rounded.sm}`; bars, rails and bands `{rounded.none}`.
- Rhythm: `{spacing.sm}` inside controls, `{spacing.wide}` between fields, `{spacing.giant}` card padding, `{spacing.max}` between regions.
- Tables and lists: 38px rows, cell padding `{spacing.xl} {spacing.wide}`, rules in `{colors.band}`.
- Boards: columns on `{colors.chrome}`, white cards with `{spacing.sm}` gaps.
- Depth: tint, not shadow. A panel lifts by sitting white on a tinted band; only dialogs and toasts take a soft shadow.

## Components

The same set in every look, each built from the tokens above. Pages
use these; a component an app needs and this set lacks is added to
`DESIGN.md` first, in the same terms.

- `app-masthead`: the bar across the top of every page: the app's name, the signed-in person, sign out. `chrome` ground, `ink` text, `hairline` edge, `body` type.
- `app-nav-item`: a link in the navigation. `ink-meta` text, `sm` corners, `body` type.
- `app-nav-item-active`: the page you are on. band blue ground, `ink` text, `sm` corners, `body` type.
- `working-context`: what the whole app is working on, such as the business date, shown in the masthead. `chrome` ground, `ink` text, `lg` corners, `caption` type.
- `page-title`: a page's heading. `ink` text, `display` type.
- `table-header`: a table's column headings. `chrome` ground, `ink-meta` text, `hairline` edge, `caption` type.
- `table-row`: one row of a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `list-row`: one item in a list that is not a table. `canvas` ground, `ink` text, `hairline` edge, `body` type.
- `board-lane`: a column of a board. `chrome` ground, `ink-meta` text, `md` corners, `caption` type.
- `board-tile`: one thing on a board, dragged between lanes. `chrome` ground, `ink` text, `hairline` edge, `md` corners, `caption` type.
- `status-pill`: a short status word on a tinted ground; each app status gets its own colour from the palette. band blue ground, `ink` text, `lg` corners, `caption` type.
- `button-primary`: the one main action on a page. `primary` ground, `on-primary` text, `md` corners, `button` type.
- `button-secondary`: every other action. `canvas` ground, `ink` text, `hairline` edge, `md` corners, `button` type.
- `text-input`: a form field. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `select`: a dropdown. `canvas` ground, `ink` text, `hairline` edge, `sm` corners, `body` type.
- `field-label`: a form field's label. `ink-meta` text, `caption` type.
- `field-error`: what is wrong with a field, under it. `primary` text, `caption` type.
- `card`: a panel that groups one thing's details. `chrome` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `dialog`: a box over the page that asks for one decision. `chrome` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.
- `toast`: a short confirmation that disappears by itself. `ink` ground, `canvas` text, `md` corners, `caption` type.
- `empty-state`: what a list or board says when it has nothing in it yet, and how to add the first. `ink-meta` text, `hairline` edge, `lg` corners, `body` type.
- `sign-in-panel`: the sign-in screen's panel. `chrome` ground, `ink` text, `hairline` edge, `lg` corners, `body` type.

## Do / Don't
Do:
- Group sections with tinted bands instead of drawing boxes.
- Keep one blue for action, link and the active tab.
- Use 15px list text in tables and lists; keep 18px for reading text.
- Turn on tabular figures in every numeric column.
- Keep the global bar and tab rail grey and quiet so content leads.

Don't:
- Don't put shadows on buttons, cards or panels.
- Don't add a second accent colour for decoration.
- Don't set text in `{colors.sky}`.
- Don't round bars, rails or bands.
- Don't signal status by tint alone.
