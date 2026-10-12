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
`build.emptyOutDir`, `server.port`, `server.strictPort`,
`server.allowedHosts` and the `@api` alias — which the plugin raises
an error about if the config sets them: the backend's `--frontend-host`
and `--frontend-dist-path` depend on their values. The copy's
`server.host: true` goes too: the plugin listens on every interface
unless the config or the command line says where. A different dev-server port is `RBT_VITE_PORT` in the
environment, as before. `vite`, `@vitejs/plugin-react` and `vite-plugin-singlefile`
stay in `devDependencies`; the plugin imports the last two from the
project, as optional peer dependencies.

`build.mjs` and the `build` script are unchanged: they set
`RBT_BUILD_TARGET` per UI, which the plugin reads.
