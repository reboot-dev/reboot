---
title: Wire the Web SPA to the Reboot Backend
impact: HIGH
impactDescription: The browser shell, the backend URL, the generated hooks, and how a typed backend error reaches the user
tags: web-app, react, vite, hooks, errors, RebootClientProvider
---

## Wire the Web SPA to the Reboot Backend

Everything the standalone browser frontend needs. This is the
web-app equivalent of the `mcp-app` skill's scaffolding references —
**do not read those**. The `frontend/` shell is the same one (the
stock Vite file plus Reboot's `reboot()` plugin), and this file
has the web app's version of it;
the rest of those references is about `mcp/<name>/` entries and
one-file MCP App bundles, which a web app has no use for.

## The `frontend/` Shell

A stock Vite React-TS project
(`npm create vite@latest frontend -- --template react-ts`) with the
SPA's `index.html`, `src/`, and `public/` moved under `web/`, so
that the generated client at `frontend/api/` and, should the app
ever add MCP Apps, `frontend/mcp/` sit beside it:

```
frontend/
├── package.json
├── tsconfig.json
├── tsconfig.app.json    # `include: ["web/src"]`, the `@api/*` path
├── tsconfig.node.json
├── vite.config.ts       # The stock Vite file plus `reboot()`, below
├── api/                 # `rbt generate --react=frontend/api`
└── web/
    ├── .env.development # No `VITE_REBOOT_URL` in development; below
    ├── .env.production  # Written at deploy time (the `deploy` skill)
    ├── index.html       # `<div id="root">` + `<script type="module" src="./src/main.tsx">`
    ├── public/          # Static files, copied into the build as they are
    └── src/
        ├── main.tsx     # The provider, below
        ├── vite-env.d.ts
        ├── App.tsx
        └── pages/
```

Keep the `react`, `react-dom`, and `devDependencies` (Vite, its
React plugin, TypeScript, the `@types/*`) at the versions the
scaffold writes; they are made to work together, and pinning them
here would only go stale. Add the two Reboot packages, pinned to the
same version as the backend's `reboot` dependency, and `zod`:

```json
{
  "name": "<app>-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npm run dev:portless",
    "dev:portless": "portless frontend-<app> vite",
    "dev:ports": "vite",
    "build": "tsc -b && vite build"
  },
  "dependencies": {
    "@reboot-dev/reboot-api": "<same version as `reboot` in pyproject.toml>",
    "@reboot-dev/reboot-react": "<same version>",
    "react": "<as the scaffold wrote it>",
    "react-dom": "<as the scaffold wrote it>",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "<as the scaffold wrote them>": "",
    "portless": "^0.15.7",
    "vite-plugin-singlefile": "^2.0.3"
  }
}
```

`vite.config.ts` is the stock Vite file with Reboot's plugin added,
the same config the `mcp-app` skill uses, so adding MCP Apps later is
one more option in it rather than a different file:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { reboot } from "@reboot-dev/reboot-react/vite";

export default defineConfig({
  plugins: [react(), reboot({ webAppPath: "web", apiPath: "api" })],
});
```

`reboot()` ships with `@reboot-dev/reboot-react`. `webAppPath` is the
SPA's directory: the dev server serves it at `/` (and at any path a
browser navigates to, so the app's own URL routing survives a
reload), serves its `public/` there too, and listens on every
interface unless the config or the command line says where
(`portless <app> vite` passes `--host 127.0.0.1`) — Vite's default
is `localhost`, which on modern Node resolves to IPv6 `[::1]` only,
so a forwarded port (Codespaces, VS Code remote, a dev VM, a tunnel)
would get connection refused and the page would be unreachable
though the server is healthy. The
build writes it to `frontend/dist/web/` at `base: "/"`. `apiPath` is
the generated client, for the `@api` alias. The plugin also dedupes
`react`, `react-dom` and `zod` — two copies, one from the app and
one pulled through the Reboot packages, break hooks and schema
identity checks at runtime — and reads `.env*` from `web/`. The dev
server's port is Vite's own: 5173 unless the config sets
`server.port`.

Anything else — another plugin, `build.sourcemap` — goes in the
literal as in any Vite project. The values the plugin sets (`root`,
`base`, `envDir`, `publicDir`, `build.outDir`, `server.allowedHosts`,
the `@api` alias) are the contract with the backend; if the config
sets one too, the plugin raises an error naming it.

`web/index.html` refers to its entry relatively, `./src/main.tsx`
rather than `/src/main.tsx`, so the dev server can serve it at `/`.
`npm run build` is `tsc -b && vite build`: with one UI declared, the
web app, the plugin needs no build target and the stock command
builds it into `dist/web/`. (A frontend with MCP Apps as well builds
every UI through `build()` from `@reboot-dev/reboot-react/vite`; the
`mcp-app` skill has that.) `vite-plugin-singlefile` sits in
`devDependencies` beside `vite` and `@vitejs/plugin-react` because
the plugin imports them from the project.

In `tsconfig.app.json`, point `include` at `web/src` instead of
the scaffold's `src`, and add the alias's `paths`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@api/*": ["./api/*"] }
  },
  "include": ["web/src"]
}
```

The `dev` scripts mirror the `.rbtrc`'s configs: `npm run dev` is
the default, `dev:portless`, which runs `portless frontend-<app> vite`
(`<app>` is the `.rbtrc`'s `--application-name`; `portless` is a dev
dependency and appends Vite's `--port` itself) and serves the SPA at
`https://frontend-<app>.localhost`, which the backend serves it from at
`https://<app>.localhost/`, and `dev:ports` is plain `vite` at
`http://localhost:5173/`, served at `http://localhost:9991/` the
same way; `npm run build` writes
`frontend/dist/web/`, a plain SPA build that any host serves at
`/`.

## The Backend URL — The Page's Own in Dev, Set for a Deploy

`<RebootClientProvider>` with no `url` detects the backend:
`window.REBOOT_URL`, then a `?rebootUrl=` query parameter, else
`window.location.origin`. The origin is right whenever the backend
serves the SPA: from its dev server with `--web-app` in development,
or built with `--web-app-dist-path`. So in development pass no `url`
and keep `VITE_REBOOT_URL` out of `web/.env.development`; open the
SPA at the backend's URL (`https://<app>.localhost/` or
`http://localhost:9991/`), never at Vite's own, where the origin
would be Vite's and the client would call the wrong place.

In production the backend serves the built SPA from its image (the
`deploy` skill), same-origin, so there is nothing to set. Only a SPA
published to a static host of your own is on a different origin from
the backend and must say where the backend is, from an env file Vite
reads from its `root`:

```
# frontend/web/.env.production
VITE_REBOOT_URL=https://your-backend-host.example.com
```

passed as `<RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>`,
which is `undefined`, and so detection, when the file is absent.

`import.meta.env` needs Vite's ambient types or `npm run build`
fails with `Property 'env' does not exist on type 'ImportMeta'`.
The scaffold writes them as `src/vite-env.d.ts`, which moves to
`frontend/web/src/vite-env.d.ts` with the rest of `src/`; if you
assembled the tree by hand, write it:

```ts
// frontend/web/src/vite-env.d.ts
/// <reference types="vite/client" />
```

```tsx
// frontend/web/src/main.tsx
const REBOOT_URL =
  (import.meta.env.VITE_REBOOT_URL as string | undefined) ??
  window.location.origin;

createRoot(document.getElementById("root")!).render(
  <RebootClientProvider url={REBOOT_URL}>
    <App />
  </RebootClientProvider>
);
```

The `?? window.location.origin` keeps the production build working
when the backend serves the built assets from one origin.

## The Generated Client

The hook, mutator, and error declarations `rbt generate --react=`
emits are identical for every frontend, so they live in one place:
[`python/references/react-generated-client.md`](../../python/references/react-generated-client.md).
Read it before writing components — it has the `useFoo` overloads,
`UseFooApi`, the three-field reader return, `ResponseOrAborted`, the
`<Type><Method>Aborted` error classes, the snake→camel naming rules,
and why a hook id must be real on every render. Do **not** open
`frontend/api/**/*_rbt_react.ts` to rediscover them.

What is web-app-specific: the client is created by the
`<RebootClientProvider url={...}>` above, and the signed-in user's
handle comes from the no-argument `useUser()` (see "Sign-in and
Sign-out" below).

## Surfacing a Typed Error to the User

`aborted.error` is a discriminated union — the errors the method
declared plus the framework's (`PermissionDenied`, `Unknown`, …) —
tagged by `error.type`, which is the Python error class's name. A
single translator keeps the switch in one place; every story with
a "shows a visible error" requirement routes through it:

```ts
// frontend/web/src/errors.ts
export function friendlyError(aborted: {
  error: { type: string } & Record<string, unknown>;
  message: string;
}): string {
  switch (aborted.error.type) {
    case "QuotaExceededError":
      return `Limit reached (${String(aborted.error.limit)}).`;
    case "UnknownUserError":
      return `No user named "${String(aborted.error.username)}".`;
    case "PermissionDenied":
      return "You don't have access to do that.";
    default:
      return aborted.message || `Something went wrong.`;
  }
}
```

The fields on each error case are exactly the fields declared on
the pydantic error model in the API definition, camelCased. The
frontend only _reports_; the backend already refused the operation.

## Accessible Markup, So Scenarios Can Drive the Page

The web app scenarios (`python/references/testing-web-app.md`)
find elements the way a person, or a screen reader, does: a button
by what it says, a field by its label, a table by its heading. They
never take a selector, so the page has to expose an accessibility
tree. Build every page this way from the start, not when the first
scenario fails to find something:

```tsx
// A field's label is paired with it: `htmlFor` names the input's
// `id`. `fills "Amount ($)" in the web app with `250`` finds it
// through that pairing; a placeholder does not count.
<label htmlFor="amount">Amount ($)</label>
<input id="amount" type="number" value={amount} onChange={...} />

// A select is a `<select>` with a paired label, its options saying
// what a person would pick (here the account id).
<label htmlFor="from-account">From Account</label>
<select id="from-account" value={from} onChange={...}>
  {accounts.map((a) => <option key={a.id} value={a.id}>{a.id}</option>)}
</select>

// A button says what it does. `clicks the "Open Account" button`
// matches that text exactly; an icon-only button gets `aria-label`.
<button onClick={open}>Open Account</button>
<button aria-label="Delete" onClick={remove}><TrashIcon /></button>

// A table a scenario names has a labelled heading (or a
// `<caption>`). `sees "$1000" in the "Your Accounts" table` looks
// only inside it.
<h2 id="your-accounts">Your Accounts</h2>
<table aria-labelledby="your-accounts">...</table>

// A value a scenario reads back (an id the backend made up)
// carries `data-testid`, on the element whose text is exactly the
// value. This is the only place a test id belongs.
<td data-testid="account-id">{account.id}</td>
```

The roles a scenario may name are `button`, `link`, `tab`,
`checkbox`, `radio`, `menuitem`, `option`, `row`, and `table`; use
the native element for each (`<button>`, `<a href>`, `<input type="checkbox">`) rather than a `<div onClick>`, which has no role.
Text that changes on a backend event (a balance, a status) is
rendered as text, so `eventually sees "$1000"` can wait for it.

## Sign-in and Sign-out

`useSignIn()` / `useSignOut()` from `@reboot-dev/reboot-react` drive
the built-in OAuth server mounted at `/__/oauth/*`; call the
returned function from a button. Session state lives in the
HttpOnly `rbt_session` cookie, so there is no token to store, and
`useUser()` reports the result (`user === undefined` when signed
out).

The whole shape, and the one place the signed-in subtree gets its
guaranteed-real id:

```tsx
import {
  RebootClientProvider,
  useSignIn,
  useSignOut,
} from "@reboot-dev/reboot-react";
import { UseUserApi, useUser } from "@api/<pkg>/v1/<name>_rbt_react";

function App() {
  const { user, isLoading } = useUser();
  const signIn = useSignIn();
  const signOut = useSignOut();
  // `isLoading` covers the `/__/oauth/whoami` session probe.
  if (isLoading) return <Spinner />;
  if (user === undefined) {
    return <button onClick={() => signIn()}>Sign in</button>;
  }
  return (
    <>
      <button onClick={() => signOut()}>Sign out</button>
      <SignedIn user={user} />
    </>
  );
}

// Mounted only once `user` exists, so `user.state_id` is real and
// every hook below it can be called with a genuine id.
function SignedIn({ user }: { user: UseUserApi }) {
  const { response } = user.useProfile();
  // ...
}
```
