---
name: deploy
description: Deploy a finished Reboot app to production — the backend on Reboot Cloud, and the web frontend (if the app has one) published to a static host (Cloudflare Pages) under the user's own custom domain, talking to the backend cross-origin. Covers the production frontend build (backend URL, SPA fallback, asset paths), publishing with wrangler, attaching the domain, and the Application(allowed_origins=...) configuration that lets the browser reach the backend.
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, AskUserQuestion
---

# deploy — Put a Reboot App in Production

> **Version notices:** if `rbt` reports a version mismatch or that a
> newer Reboot is available, the [upgrade skill](../upgrade/SKILL.md)
> says how and when to react.

Take an existing, working Reboot app and put it on the internet:
the backend runs on **Reboot Cloud**; the web frontend (a React
SPA) is published to a **static host** — this skill uses
Cloudflare Pages — and served from the user's **own domain**. The
two halves talk cross-origin: the SPA calls the backend's
`https://<application-id>.<cell>.rbt.cloud:9991` URL directly, and
the backend allows that via `Application(allowed_origins=[...])`.

> This skill **deploys** an app; it does not build or modify one
> beyond production configuration. To build, see the
> [chat-app skill](../chat-app/SKILL.md) and the
> [web-app skill](../web-app/SKILL.md); to run locally, see the
> [run skill](../run/SKILL.md).

## When to Use

- A finished Web App (or the web surface of a dual-surface app)
  should go live at a real URL on the user's domain.
- A Chat App with **no** web surface should go to production: only
  the backend deploy applies — do Step 2 and stop. MCP UIs ship
  inside the backend image and are served by the backend itself;
  there is nothing to host externally.

## Step 1 — Gather inputs (ask early, in one pass)

Ask the user for everything below up front (one `AskUserQuestion`
round, or one message), so no later step stalls:

1. **The frontend's domain** — e.g. `app.example.com` — and
   whether that domain's DNS is managed on Cloudflare. Custom
   domains are a feature of the static host, so the domain (or at
   least the hostname being used) must be attachable there.
2. **Cloudflare credentials** for headless publishing:
   `CLOUDFLARE_ACCOUNT_ID` and a `CLOUDFLARE_API_TOKEN` with
   permissions Cloudflare Pages: Edit, Zone: Read, and DNS: Edit
   (DNS only needed when the zone is on Cloudflare).
3. **Reboot Cloud access**: `REBOOT_CLOUD_API_KEY`, the
   organization, and an application name — see
   `python/references/lifecycle-reboot-cloud.md`.

Export the secrets as environment variables; never pass them as
command-line flags (they would be visible in the process listing).

## Step 2 — Deploy the backend to Reboot Cloud

The canonical backend-deploy procedure is
`python/references/lifecycle-reboot-cloud.md` (with
`python/references/lifecycle-dockerfile.md` for the image and
`python/references/lifecycle-secrets.md` for secrets). Follow it.
Production readiness checks that commonly bite at this point:

- **A real OAuth provider.** `Development()` is dev-only; the
  `prod=` provider must be set
  (`chat-app/references/auth-oauth-providers.md` has the
  per-provider details, including registering the backend's
  `/__/oauth/callback` redirect URI with the IdP).
- **Authorizers everywhere.** Every externally reachable method
  needs an authorizer — calls without one are denied in
  production (`python/references/servicer-authorizer.md`).
- **Dual-surface apps:** the Docker image must still run the MCP
  UI builds so `dist/mcp/<name>/` is in the image — the backend
  serves those. The **web** SPA does _not_ need to be in the
  image; it is going to the static host instead.

Record the API URL that `rbt cloud up` prints —
`https://<application-id>.<cell>.rbt.cloud:9991`. The frontend
build (Step 4) bakes it in.

## Step 3 — Allow the frontend's origin on the backend

The browser only gets to call the backend cross-origin if the
frontend's origin is in the app's allow-list:

```python
application = Application(
    ...,
    oauth=...,
    allowed_origins=["https://app.example.com"],
)
```

Rules:

- Entries are exact origins — `scheme://host[:port]`, no trailing
  slash, no path. List **every** origin the frontend is served
  from (e.g. both `https://example.com` and
  `https://www.example.com` if both resolve, and the
  `https://<project>.pages.dev` URL if the user wants it to work
  too).
- This one list drives both the CORS policy on Reboot Cloud's
  proxy **and** the OAuth browser flow's redirect validation
  (`/__/oauth/start?return_to=...` only accepts origins on this
  list), so no separate OAuth configuration is needed.
- In production, an app with `oauth=` set **must** set
  `allowed_origins` (the empty list is accepted for apps with no
  browser frontend); startup fails otherwise.

After adding it, redeploy: `rbt cloud up`.

## Step 4 — Build the frontend for production

First detect the frontend layout, the same way the
[run skill](../run/SKILL.md) does:

- **Standalone Web App layout** — a single SPA with a stock Vite
  config (entry `index.html` at the top of the SPA directory,
  e.g. `web/`). Assets are built with Vite's default `base: "/"`.
- **Dual-surface layout** — a `frontend/` directory whose
  `vite.config.ts` builds `RBT_BUILD_TARGET=mcp:<name>` targets
  and an `RBT_BUILD_TARGET=web` target into `dist/`. The web
  build there uses `base: "/__/frontend/web/"` (asset URLs carry
  that prefix).

Then:

1. **Bake in the backend URL.** Next to the SPA's existing `.env`
   (the file that sets `VITE_REBOOT_URL` for dev), write
   `.env.production`:

   ```sh
   VITE_REBOOT_URL=https://<application-id>.<cell>.rbt.cloud:9991
   ```

   Vite's production build reads it automatically; the dev `.env`
   stays untouched.

2. **Add the static host's routing file.** Put a `_redirects`
   file in the SPA's `public/` directory (Vite copies it into the
   build output). For the standalone layout:

   ```
   /* /index.html 200
   ```

   (the standard SPA fallback, so a hard load of `/some/route`
   serves the app instead of a 404). For the dual-surface layout,
   one extra line **first**, mapping the `/__/frontend/web/`
   asset prefix baked into that layout's build back onto the
   published files:

   ```
   /__/frontend/web/* /:splat 200
   /* /index.html 200
   ```

3. **Check the router's basename.** If the app uses a URL-path
   router (e.g. React Router), its basename must be `"/"` (or
   unset). Never `basename={import.meta.env.BASE_URL}` — on the
   dual-surface layout that bakes `/__/frontend/web/` into route
   matching, which runs in the browser where no host rewrite can
   fix it, and every route silently renders nothing on the custom
   domain.

4. **Build.** Run the project's frontend build (`npm run build`
   in the frontend directory). The publish directory is the built
   SPA: the directory containing the built `index.html` — e.g.
   `web/dist/` for the standalone layout, `frontend/dist/web/`
   for the dual-surface layout.

## Step 5 — Publish to Cloudflare Pages and attach the domain

With `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exported,
`wrangler` runs fully headless (no `wrangler login`):

```sh
npx --yes wrangler@4 pages project create <project-name> \
    --production-branch=main
npx --yes wrangler@4 pages deploy <publish-directory> \
    --project-name=<project-name> --branch=main
```

The deploy prints the `https://<project-name>.pages.dev` URL —
the site is already live there. Attach the custom domain via the
Cloudflare API (wrangler has no subcommand for this):

```sh
curl -sS -X POST \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/<project-name>/domains" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"name": "app.example.com"}'
```

Then make the DNS point at the Pages project. When the zone is on
Cloudflare, create the record via the API (look up the zone id
with `GET /zones?name=example.com`, then):

```sh
curl -sS -X POST \
    "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"type": "CNAME", "name": "app.example.com", "content": "<project-name>.pages.dev", "proxied": true}'
```

When the zone is **not** on Cloudflare, tell the user to add the
`CNAME app.example.com → <project-name>.pages.dev` record at
their DNS provider; the domain attachment above still validates
once the record resolves. TLS certificates are provisioned by
Cloudflare automatically after validation.

Redeploys are just `wrangler pages deploy` again — the project
and domain stay put.

## Step 6 — Verify

1. **Static serving:** `curl -sSI https://app.example.com/`
   returns 200 with `content-type: text/html`; a deep route
   (`curl -sSI https://app.example.com/some/route`) also returns
   200 (the SPA fallback).
2. **CORS:**

   ```sh
   curl -sSI "https://<application-id>.<cell>.rbt.cloud:9991/__/oauth/whoami" \
       -H "Origin: https://app.example.com"
   ```

   must include `access-control-allow-origin: https://app.example.com` and
   `access-control-allow-credentials: true`. If it does not, the
   backend running in the Cloud predates the `allowed_origins`
   change — redeploy it.

3. **In the browser** (the user, or a browser tool if one is
   available): open `https://app.example.com`, sign in, and
   confirm signed-in data renders. Sign-in bounces through the
   backend's `/__/oauth/start` and back to the frontend; live
   data confirms the WebSocket path works cross-origin too.

## Troubleshooting

- **Blank page, console full of MIME-type or 404 asset errors:**
  the build's asset prefix doesn't match the host — on the
  dual-surface layout, the `/__/frontend/web/*` rewrite line is
  missing from `_redirects` (or isn't first).
- **Routes render nothing on the custom domain but the app loads
  at `/`:** router basename baked from `import.meta.env.BASE_URL`
  (Step 4.3).
- **Browser console shows CORS errors:** the exact origin (watch
  scheme and `www.`) is missing from `allowed_origins`, or the
  backend wasn't redeployed after adding it.
- **Sign-in fails with an invalid-redirect error:** same cause —
  the frontend origin isn't on `allowed_origins`, so
  `/__/oauth/start` refuses the `return_to`.
- **Signed-in session doesn't survive a reload in
  Safari/Firefox:** those browsers' tracking prevention can strip
  the cross-site session cookie that silent session restoration
  relies on. Sign-in itself still works — the user just signs in
  again. This is a known limitation of fully cross-site hosting.
