---
name: deploy
description: Deploy a finished Reboot app to production on Reboot Cloud with `rbt cloud up` — one container that runs the backend and serves the built MCP Apps and web app from it, same-origin, so there is no second host, no cross-origin configuration and no cross-site cookie trouble. Covers the Dockerfile that builds the frontend into the image, the `.rbtrc` `serve run` lines that serve it, the OAuth and `allowed_origins` production checks, and verification; and what hosting the web app on a CDN of your own (Cloudflare Pages, Firebase, Vercel, ...) costs instead.
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, AskUserQuestion
---

# deploy — Put a Reboot App in Production

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

Take an existing, working Reboot app and put it on the internet with
`rbt cloud up`. **One container does all of it:** the backend runs on
**Reboot Cloud**, and the same backend serves the app's built
frontend — the MCP Apps under `/__/frontend/` and the web app (a
React SPA) at `/` — from the image. The browser, the backend and the
OAuth flow are all on one origin, the app's
`https://<application-id>.<cell>.rbt.cloud:9991`, so there is no
second host to publish to, no backend URL to bake into the frontend,
no `allowed_origins` to keep in sync and no cross-site cookie to lose.

> This skill **deploys** an app; it does not build or modify one
> beyond production configuration. To build, see the
> [`mcp-app` skill](../mcp-app/SKILL.md) and the
> [web-app skill](../web-app/SKILL.md); to run locally, see the
> [run skill](../run/SKILL.md).

## When to Use

- A finished Web App, MCP App, or dual-frontend app should go to
  production.
- The app is already in production and needs a new revision: the
  same `rbt cloud up` rolls it forward (Step 4).

## Step 1 — Gather inputs (ask early, in one pass)

Ask the user for everything below up front (one `AskUserQuestion`
round, or one message), so no later step stalls:

1. **Reboot Cloud access**: `REBOOT_CLOUD_API_KEY`, and the
   organization (needed the first time the app is created) — see
   `python/references/lifecycle-reboot-cloud.md`. The application
   name is in `.rbtrc`, where `rbt cloud up` reads it from:

   ```sh
   serve run --application-name=<app>
   cloud up --application-name=<app>
   cloud down --application-name=<app> --expunge
   cloud logs --application-name=<app>
   ```

   Add those lines, with the `serve run --application-name`'s name,
   if they are missing rather than asking.

2. **Production OAuth**, if the app has `oauth=`: which provider,
   and its client id and secret (delivered as Cloud secrets, see
   `python/references/lifecycle-secrets.md`).

Export the secrets as environment variables; never pass them as
command-line flags (they would be visible in the process listing).

## Step 2 — Production readiness

Checks that commonly bite on first deploy:

- **A real OAuth provider.** `Development()` is dev-only; the
  `prod=` provider must be set
  (`mcp-app/references/auth-oauth-providers.md` has the
  per-provider details, including registering the backend's
  `https://<application-id>.<cell>.rbt.cloud:9991/__/oauth/callback`
  redirect URI with the IdP once the URL is known).
- **`allowed_origins=[]`.** In production an app with `oauth=` must
  set `OAuth(allowed_origins=...)` explicitly; startup fails
  otherwise. With the backend serving the web app, the app's only
  browser origin is the backend's own, which is always trusted, so
  the right value is the empty list: `allowed_origins=[]`. Only a
  web app hosted elsewhere (see the end of this skill) lists an
  origin here.
- **Authorizers everywhere.** Every externally reachable method
  needs an authorizer — calls without one are denied in
  production (`python/references/servicer-authorizer.md`).
- **No baked-in backend URL.** The React client finds the backend at
  the page's own origin when the backend serves the page, so
  `frontend/web/.env.production` must not set `VITE_REBOOT_URL`;
  delete the file if that is all it holds. A `VITE_REBOOT_URL`
  pointing anywhere else turns every call cross-origin and breaks
  sign-in.

## Step 3 — The container serves the frontend

`rbt cloud up` builds the `Dockerfile` at the project root. The
image must build the frontend and `rbt serve run` must be told where
the builds landed; `python/references/lifecycle-dockerfile.md` is the
canonical layout, and its "bundled frontend" variant is the one for
any app with a `frontend/`. The two halves:

1. **The `Dockerfile`** copies `frontend/` in before `rbt generate`,
   then builds it, so that `frontend/dist/mcp/<name>/` (the MCP Apps)
   and `frontend/dist/web/` (the web app) are in the image:

   ```dockerfile
   COPY api/ api/
   COPY .rbtrc .rbtrc
   COPY frontend/ frontend/
   RUN rbt generate
   RUN cd frontend && npm ci && npm run build
   COPY backend/src/ backend/src/
   CMD ["rbt", "serve", "run"]
   ```

   `npm run build` builds the frontend: `vite build` for a web app
   alone, or the shell's `node build.mjs`, which builds every MCP App
   and the web app in one go. The
   `.dockerignore` keeps `frontend/node_modules/` and
   `frontend/dist/` out of the build context; they are rebuilt in
   the image.

2. **`.rbtrc`'s `serve run` lines** point the backend at the builds.
   An MCP App app has the first line, a web app the second, a
   dual-frontend app both:

   ```sh
   serve run --mcp-app-dist-path=frontend/dist/mcp
   serve run --web-app-dist-path=frontend/dist/web
   ```

   `--web-app-dist-path` serves the SPA at `/`, with its `index.html`
   answering any path the app has no route or file for, so the SPA's
   own routing works on reload, the way `dev run --web-app` serves
   it from the dev server in development. The rest of the production
   lines (`--python`,
   `--application`, `--application-name`, `--tls=external`) are in
   `lifecycle-dockerfile.md`.

The web build is at `base: "/"` whether or not the app also has MCP
UIs, so keep any URL-path router's basename at `"/"`.

Try the same image locally before deploying if anything above
changed: `rbt dev run --config=dist` (after `cd frontend && npm run build`) serves the builds the way `rbt serve run` will.

## Step 4 — Deploy

With `REBOOT_CLOUD_API_KEY` exported:

```sh
rbt cloud up --organization=<org>
```

(`--organization` is only needed the first time; the application
name is the `.rbtrc`'s `cloud up --application-name`.) `rbt cloud up`
builds the image, pushes it
and rolls out a revision, then prints the app's URL,
`https://<application-id>.<cell>.rbt.cloud:9991`. That one URL is the
web app (`/`), the MCP endpoint (`/mcp`) and the API. Register
`<that URL>/__/oauth/callback` with the IdP now if Step 2 was waiting
on it; no redeploy is needed for that.

Later revisions are the same `rbt cloud up` again. Secrets go in with
`rbt cloud secret set` (`lifecycle-secrets.md`) and roll the app on
their own.

## Step 5 — Verify

With `URL=https://<application-id>.<cell>.rbt.cloud:9991`:

1. **The web app:** `curl -sSI "$URL/"` returns 200 with
   `content-type: text/html`, and so does a deep route
   (`curl -sSI "$URL/some/route"`, the SPA fallback). Reboot's own
   page at `/` instead means `--web-app-dist-path` is missing or names
   a directory the image did not build.
2. **The MCP Apps:**
   `curl -sSI "$URL/__/frontend/mcp/<name>/index.html"` (for a
   `UI(path="<name>")`, built to `frontend/dist/mcp/<name>/`)
   returns 200. A 404 means
   `--mcp-app-dist-path` is missing or the build is not in the image.
3. **In the browser** (the user, or a browser tool if one is
   available): open `$URL/`, sign in, and confirm signed-in data
   renders and updates live. Sign-in bounces through the backend's
   `/__/oauth/start` and back to `/`, same-origin.
4. **An MCP client**, for an app with MCP Apps: connect it to
   `$URL/mcp` and render one UI.

## Troubleshooting

- **Blank page, console full of MIME-type or 404 asset errors:**
  the build's `base` doesn't match where it is served; the web
  build must be at `base: "/"`.
- **Routes render nothing but the app loads at `/`:** router
  basename baked from `import.meta.env.BASE_URL`; keep it `"/"`.
- **Browser console shows CORS errors, or sign-in fails with an
  invalid-redirect error:** the page is calling a different origin
  than it was served from. A `VITE_REBOOT_URL` is baked into the
  build (Step 2); remove it and rebuild.
- **Startup fails naming `allowed_origins`:** `oauth=` without an
  explicit `allowed_origins`; set `[]` (Step 2).
- **The image builds locally but Cloud rejects it, or `rbt serve run` fails on boot:** the Dockerfile departs from the canonical
  layout (base image version, `CMD`, layer order); see
  `lifecycle-dockerfile.md`'s gotchas.

## Hosting the web app somewhere else

The web build in `frontend/dist/web/` is a plain SPA, so it _can_ be
published to a static host of the user's choosing instead —
Cloudflare Pages, Firebase Hosting, Vercel, Netlify, S3 — with the
backend still on Reboot Cloud. Only do this when the user asks for
it, and tell them what it costs first:

- **It is cross-site.** The app at `app.example.com` and the backend
  at `<application-id>.<cell>.rbt.cloud` are different sites, and
  the session cookie that keeps a user signed in is then a
  third-party cookie. Chrome allows it; Safari and Firefox strip it,
  so a signed-in session does not survive a reload there and the
  user signs in again every visit. Making sign-in work across those
  browsers needs the backend on the same site as the app
  (`api.example.com` beside `app.example.com`), which Reboot Cloud's
  upcoming **custom domains** feature provides; until then a
  separately hosted web app is Chrome-only for persistent sign-in.
- **Reboot Cloud is going to serve the web bundle from a CDN
  itself**, so the main reason to host the SPA elsewhere — edge
  delivery — is going away, and the setup below becomes something
  to undo.

If the user still wants it, the differences from the steps above
are: build with `VITE_REBOOT_URL=<the backend's URL>` in
`frontend/web/.env.production`, list the app's exact origin(s)
(`scheme://host`, no trailing slash) in `OAuth(allowed_origins=[...])`,
drop the `serve run --web-app-dist-path` line (the backend's `/` is then
Reboot's own page), then publish `frontend/dist/web/` with the host's
own tooling and point the domain at it. The MCP Apps stay in the image
either way; the backend serves them.
