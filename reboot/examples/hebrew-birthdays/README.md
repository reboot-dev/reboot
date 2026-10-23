# Hebrew Birthdays

A Reboot app that tracks the Hebrew (Jewish calendar) birthdays of the
people you care about, and tells you when each one falls on the
Gregorian calendar this year — the date everyone forgets, because it
moves.

It has three front ends on one backend, and they share one list per
person, because they all sign in to the same `User`:

- **Web** (`frontend/web/`): a responsive SPA that works on a phone's
  browser too, and can be added to a home screen.
- **Mobile** (`frontend/mobile/`): a React Native (Expo) app for iOS
  and Android, signing in natively with PKCE.
- **MCP** (`frontend/mcp/`): tools and embedded UIs for Claude,
  ChatGPT, and other MCP clients: "add my grandmother, born March 10,
  1950", "whose Hebrew birthdays are in the next month?", "show me
  Eli's birthday card".

## What it knows about the Hebrew calendar

- Someone born **after sunset** was born on the next Hebrew day.
- You can enter a **Gregorian** date of birth, or the **Hebrew** day,
  month and year if that is what the family remembers.
- When a year lacks the date of birth, the birthday follows the common
  custom (the one Hebcal uses): Adar of a common year becomes **Adar
  II** in a leap year, Adar I/II become Adar in a common year, and
  **30 Cheshvan**, **30 Kislev** and **30 Adar I** become 1 Kislev,
  1 Tevet and 1 Nisan in years without them.
- A Hebrew birthday **begins at sunset the evening before** its
  Gregorian date, which the apps point out.

The arithmetic is in `backend/src/hebrew_calendar.py`, on top of
[`pyluach`](https://github.com/simlist/pyluach).

## Run it

Prerequisites: `uv`, Node.js (with npm 11 for the install; `npx
npm@11` works), and Docker (or an `envoy` binary).

```sh
uv sync
(cd frontend && npx npm@11 install)
uv run rbt generate
```

Then, in two shells (plain ports; drop `--config=ports` and use
`npm run dev` to use [portless](https://github.com/vercel-labs/portless)
names instead):

```sh
uv run rbt dev run --config=ports
(cd frontend && npm run dev:ports)
```

- Web app: http://localhost:9991 — click "Sign in" and pick (or make
  up) a Development identity.
- MCP: http://localhost:9991 is also the setup wizard for connecting
  Claude or ChatGPT (through a public tunnel, which the wizard walks
  you through); the endpoint is http://localhost:9991/mcp.
- Mobile: `cd frontend/mobile && npm run ios` (or `android`, `web`).
  On a physical device, set `EXPO_PUBLIC_REBOOT_URL` to
  `http://<your-LAN-IP>:9991`.

## Tests

```sh
uv run pytest                    # Every feature in tests/*.feature.
uv run mypy backend/ tests/
(cd frontend && npm run build && npm test)
(cd frontend/mobile && npx tsc --noEmit)
```

`tests/web_test.py` drives the web app in Chromium
(`uv run playwright install chromium` once); run
`uv run pytest --ignore=tests/web_test.py` without a browser.

## Before production

`backend/src/main.py` uses the `Development` sign-in picker and
`prod=None`, so a production deploy refuses to start until you choose a
real OAuth provider (e.g. `Google(...)`); choose it before real users
have data, since user ids are per provider.
