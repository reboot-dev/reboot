#!/usr/bin/env node
// `reboot-vite-build`: builds every UI of a Reboot frontend in one
// shot, so `npm run build` keeps working as UIs are added or removed.
//
// A `vite build` builds a single target, selected by the
// `RBT_BUILD_TARGET` env var the `reboot()` plugin reads (`mcp:<name>`
// for one MCP UI, or `web` for the web app). This is the loop around
// it: it loads the frontend's `vite.config.ts`, asks the plugin for
// the frontend's targets (every `<mcpUiPath>/<name>/index.html`, then
// the web app if there is one), and runs one build per target. It
// runs in the frontend directory, which is where `npm run build` runs
// it.
import {
  build,
  loadConfigFromFile,
  type Plugin,
  type PluginOption,
} from "vite";

// The `reboot` plugin from a config's `plugins`, which may nest arrays
// (a plugin returning several, as `reboot()` does) and promises.
async function findRebootPlugin(
  plugins: PluginOption[] | undefined
): Promise<Plugin | undefined> {
  for (const option of plugins ?? []) {
    const resolved = await option;
    if (!resolved) continue;
    if (Array.isArray(resolved)) {
      const found = await findRebootPlugin(resolved);
      if (found) return found;
    } else if (resolved.name === "reboot") {
      return resolved;
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "production" },
    undefined,
    root
  );
  if (loaded === null) {
    throw new Error(`No Vite config found in '${root}'.`);
  }
  const plugin = await findRebootPlugin(loaded.config.plugins);
  if (plugin === undefined) {
    throw new Error(
      `'${loaded.path}' has no \`reboot()\` plugin; ` +
        "`reboot-vite-build` builds the UIs that plugin declares."
    );
  }
  const targets: string[] = plugin.api.buildTargets(root);
  if (targets.length === 0) {
    throw new Error(
      `'${loaded.path}' declares no UIs: give \`reboot()\` an \`mcpUiPath\` with ` +
        "at least one `<name>/index.html`, or a `webPath`."
    );
  }

  // Each build re-reads the config with the target set; Vite's `mode`
  // stays at its build default (`production`) so a
  // `<webPath>/.env.production` is honored.
  for (const target of targets) {
    console.log(`Building ${target} ...`);
    process.env.RBT_BUILD_TARGET = target;
    await build();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
