## `vite.config.ts` is the stock Vite file plus `reboot()`

Every frontend with MCP UIs carried a copy of the same 250-line
`vite.config.ts` pasted from the `mcp-ui` skill. What it did now
ships with `@reboot-dev/reboot-react` as a Vite plugin, `reboot()`
from `@reboot-dev/reboot-react/vite`, so fixes to how UIs are served
and built arrive with the package instead of needing every project's
copy edited.

Replace `frontend/vite.config.ts` with the stock Vite file plus the
plugin, naming the frontend's directories relative to the file and
leaving out any it doesn't have (`webPath` for a frontend with no web
app):

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { reboot } from "@reboot-dev/reboot-react/vite";

export default defineConfig({
  plugins: [
    react(),
    reboot({ mcpUiPath: "mcp", webPath: "web", apiPath: "api" }),
  ],
});
```

A plugin the project had added to its copy (Tailwind, say) goes in
`plugins` beside `react()`. Any other Vite option the copy had been
changed to set goes in the literal as usual, except the ones the
plugin owns — `root`, `base`, `envDir`, `publicDir`, `build.outDir`,
`build.emptyOutDir`, `server.host`, `server.allowedHosts` and the
`@api` alias — which the
plugin raises an error about if the config sets them: the backend's
`--mcp-app-url`, `--mcp-app-dist-path` and `--web-app-dist-path` depend on
their values. The copy fixed the dev server's port at 4444; the
plugin leaves the port to Vite, so it is Vite's default, 5173, unless
the config sets `server.port`. Change `--mcp-app-url` (and
`VITE_WEB_APP_URL`, if set) in `.rbtrc` and
`.env.development` from `http://localhost:4444` to
`http://localhost:5173`, or keep 4444 by adding
`server: { port: 4444 }` to the config. `vite`, `@vitejs/plugin-react` and `vite-plugin-singlefile`
stay in `devDependencies`; the plugin imports the last two from the
project, as optional peer dependencies.

`build.mjs` and the `build` script are unchanged: they set
`RBT_BUILD_TARGET` per UI, which the plugin reads.
