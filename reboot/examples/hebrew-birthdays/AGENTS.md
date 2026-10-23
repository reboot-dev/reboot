# Hebrew Birthdays

Tracks the Hebrew (Jewish calendar) birthdays of the people a user
cares about, and says when each falls on the Gregorian calendar. A
Reboot application, on Reboot 1.7.2: durable state types whose APIs
are Pydantic models in `api/` (not `.proto` files), with a web app, a
React Native (Expo) mobile app, and an MCP App in front, all signing
in to one `User` per person. Reboot's docs: https://docs.reboot.dev;
with the Reboot plugin installed, its skills know Reboot best.

## Setup, on a fresh clone

- `uv sync`, and `cd frontend && npx npm@11 install` (npm 10 crashes
  on this workspace with "Cannot read properties of null (reading
  'edgesOut')").
- `uv run rbt generate` (after the `npm install`: it writes the React
  code into `frontend/api/`).
- `uv run playwright install chromium`, once, for the browser scenarios.

## Commands

- **Run:** the Reboot plugin's `run` skill, which starts every process
  the app needs. Without it: `uv run rbt dev run`, and in a second
  shell `cd frontend && npm run dev`; the app is at
  https://hebrew-birthdays.localhost. Without portless,
  `uv run rbt dev run --config=ports` and `npm run dev:ports`; the app
  is at http://localhost:9991, and MCP clients connect at `/mcp`.
- **Mobile:** `cd frontend/mobile && npm start` (or `npm run ios`,
  `npm run android`, `npm run web`), with `EXPO_PUBLIC_REBOOT_URL` set
  to a backend the device can reach.
- **Dashboard** (the domain model, the features and their rules):
  `uv run rbt dashboard`, at https://dashboard-hebrew-birthdays.localhost/
  (without portless, `--config=ports`, at http://127.0.0.1:9871/).
- **Generate** after any change under `api/`: `uv run rbt generate`.
- **Test:** `uv run pytest`, then `uv run mypy backend/ tests/`; the
  frontend's `cd frontend && npm run build && npm test`, and
  `cd frontend/mobile && npx tsc --noEmit`.
- **Deploy:** the plugin's `deploy` skill, or `uv run rbt cloud up`.

## Where things live

| What                                           | Where                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| API: state types, methods, errors (the schema) | `api/birthdays/v1/user.py`, `api/birthdays/v1/person.py`          |
| Models and errors both APIs share              | `api/shared/models.py`                                            |
| Servicers: what each method does               | `backend/src/user_servicer.py`, `backend/src/person_servicer.py`  |
| Hebrew calendar rules (pure, no Reboot)        | `backend/src/hebrew_calendar.py`, `backend/src/birth_dates.py`    |
| Application: servicers, `oauth=`               | `backend/src/main.py`                                             |
| Example prompts for the MCP setup wizard       | `backend/src/example_prompts.py`                                  |
| Generated code, never edited                   | `backend/api/`, `frontend/api/`, rebuilt by `uv run rbt generate` |
| Web app                                        | `frontend/web/src/`                                               |
| MCP Apps                                       | `frontend/mcp/birthdays/`, `frontend/mcp/person/`                 |
| Mobile app                                     | `frontend/mobile/src/App.tsx`                                     |
| Date helpers shared by every frontend          | `frontend/common/dates.ts`                                        |
| Feature files: what the app must do            | `tests/*.feature`                                                 |
| Test modules                                   | `tests/*_test.py`                                                 |
| `rbt` settings, one per line, not YAML         | `.rbtrc`                                                          |

## Rules

1. A feature starts as a `@wip` feature file agreed in plain English,
   before the API or the code changes.
2. Once the app has persisted state or is deployed, the API only grows:
   add fields, methods and types, and never remove or rename one
   (schema evolution, in Reboot's docs).
3. Run `uv run rbt generate` after every API change, and never edit
   generated code.
4. Every servicer has a real `authorizer()`. Use `allow()` only for a
   method that is public in production, open to anyone, signed in or
   not; never to make a test or a page work. Tests run against the real
   authorizers: they call as a signed-in user
   (`create_external_context_as`) or as the app itself
   (`create_external_context(..., app_internal=True)`), as the Reboot
   plugin's `python` skill says in `references/testing-harness.md`.
5. All Hebrew calendar arithmetic happens in the backend
   (`hebrew_calendar.py`); the frontends only render what it returns
   and say what "today" is for the viewer, so the web, mobile and MCP
   apps can never disagree about a date.

When a file moves, a command changes, or a rule is learned, update
this file in the same change.
