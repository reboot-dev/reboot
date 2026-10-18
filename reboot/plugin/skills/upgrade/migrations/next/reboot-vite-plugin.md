## `vite.config.ts` is the stock Vite file plus `reboot()`

Every frontend with MCP Apps carried a copy of the same 250-line
`vite.config.ts` pasted from the `mcp-app` skill. What it did now
ships with `@reboot-dev/reboot-react` as a Vite plugin, `reboot()`
from `@reboot-dev/reboot-react/vite`, so fixes to how UIs are served
and built arrive with the package instead of needing every project's
copy edited.

Replace `frontend/vite.config.ts` with the stock Vite file plus the
plugin, naming the frontend's directories relative to the file and
leaving out any it doesn't have (`webAppPath` for a frontend with no web
app):

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { reboot } from "@reboot-dev/reboot-react/vite";

export default defineConfig({
  plugins: [
    react(),
    reboot({ mcpAppPath: "mcp", webAppPath: "web", apiPath: "api" }),
  ],
});
```

A plugin the project had added to its copy (Tailwind, say) goes in
`plugins` beside `react()`. Any other Vite option the copy had been
changed to set goes in the literal as usual, except the ones the
plugin owns — `root`, `base`, `envDir`, `publicDir`, `build.outDir`,
`build.emptyOutDir`, `server.allowedHosts` and the `@api` alias —
which the plugin raises an error about if the config sets them: the
backend's `--frontend-url` and `--mcp-app-dist-path` depend on
their values. The copy's `server.host: true` goes too: the plugin
listens on every interface unless the config or the command line
(`portless frontend.<app> vite` passes `--host 127.0.0.1`) says where. The copy fixed the dev server's port at 4444; the plugin
leaves the port to Vite, so it is Vite's default, 5173, unless the
config sets `server.port`. Change `--frontend-url` (and
`VITE_WEB_APP_URL`, if set) in `.rbtrc` and `.env.development` from
`http://localhost:4444` to `http://localhost:5173`, or keep 4444 by
adding `server: { port: 4444 }` to the config. `vite`, `@vitejs/plugin-react` and `vite-plugin-singlefile`
stay in `devDependencies`; the plugin imports the last two from the
project, as optional peer dependencies.

## `build.mjs` calls the package's `build()`

The `build.mjs` beside each `vite.config.ts` was the same file
everywhere too: one `vite build` per UI with `RBT_BUILD_TARGET` set.
That loop is now `build()` in `@reboot-dev/reboot-react/vite`, which
builds the UIs the `reboot()` plugin declares. Replace the body of
`frontend/build.mjs` with

```js
import { build } from "@reboot-dev/reboot-react/vite";

await build();
```

keeping any steps of your own around the call; the `build` script in
`frontend/package.json` stays `tsc -b && node build.mjs`. A frontend
with one UI, a web app alone, needs no `build.mjs` at all: delete it
and make the script `tsc -b && vite build`, since the plugin builds
the one UI it declares when no target is set.
