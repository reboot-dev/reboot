---
title: Wire the Web SPA to the Reboot Backend
impact: HIGH
impactDescription: The browser shell, the backend URL, the generated hooks, and how a typed backend error reaches the user
tags: web-app, react, vite, hooks, errors, RebootClientProvider
---

## Wire the Web SPA to the Reboot Backend

Everything the standalone browser frontend needs. This is the
web-app equivalent of the chat-app's scaffolding references —
**do not read those**: their Vite config, nested
`frontend/mcp/<name>/index.html` output, and `UI()` machinery are
MCP-host-specific and do not apply to a web app.

## The `web/` Shell

Stock Vite React-TS scaffolding (`npm create vite@latest web -- --template react-ts`), plus the two Reboot packages. Pin them to
the same version as the backend's `reboot` dependency:

```json
{
  "name": "<app>-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build"
  },
  "dependencies": {
    "@reboot-dev/reboot-api": "<same version as `reboot` in pyproject.toml>",
    "@reboot-dev/reboot-react": "<same version>",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^4.0.0"
  }
}
```

`vite.config.ts` is the stock config with two additions, both
load-bearing:

```ts
export default defineConfig({
  plugins: [react()],
  // Two copies of `react` or `zod` — one from the app, one pulled
  // through the Reboot packages — break hooks and schema identity
  // checks at runtime.
  resolve: { dedupe: ["react", "react-dom", "zod"] },
  server: {
    // Listen on every interface. Vite's default is `localhost`,
    // which on modern Node resolves to IPv6 `[::1]` only; a
    // forwarded port (Codespaces, VS Code remote, a dev VM, a
    // tunnel) connects over IPv4 `127.0.0.1` and gets connection
    // refused, so the page is unreachable from the browser even
    // though the dev server is healthy and logs no error.
    host: true,
    port: parseInt(process.env.PORT || "5173", 10),
  },
});
```

Leaving `server.host` out is the single most common reason a
freshly built app "starts fine" and then won't open: `npm run dev`
prints a URL, the process is up, and the browser cannot reach it.

## The Backend URL — Set It Explicitly in Dev

`<RebootClientProvider>` with no `url` falls back to detection:
`window.REBOOT_URL`, then a `?rebootUrl=` query parameter, then
`window.location.origin`. In development the SPA is served by Vite
on `:5173` while the backend listens on `:9991`, so the fallback
resolves to the **wrong** origin — and when even that is
unavailable the client throws
`Could not detect Reboot server URL. Ensure the page is served from the Reboot server.`

Pass it explicitly, from an env file:

```
# web/.env.development
VITE_REBOOT_URL=http://localhost:9991
```

`import.meta.env` needs Vite's ambient types or `npm run build`
fails with `Property 'env' does not exist on type 'ImportMeta'`.
Stock `create vite` scaffolding includes the file; if you assembled
`web/` by hand, write it:

```ts
// web/src/vite-env.d.ts
/// <reference types="vite/client" />
```

```tsx
// web/src/main.tsx
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
emits are identical for every surface, so they live in one place:
[`python/references/react-generated-client.md`](../../python/references/react-generated-client.md).
Read it before writing components — it has the `useFoo` overloads,
`UseFooApi`, the three-field reader return, `ResponseOrAborted`, the
`<Type><Method>Aborted` error classes, the snake→camel naming rules,
and why a hook id must be real on every render. Do **not** open
`web/src/api/**/*_rbt_react.ts` to rediscover them.

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
// web/src/errors.ts
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
import { UseUserApi, useUser } from "./api/<pkg>/v1/<name>_rbt_react";

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
