// `build()`: builds every UI of a Reboot frontend in one call, so a
// frontend's `build.mjs` keeps working as UIs are added or removed.
//
// A `vite build` builds a single target, selected by the
// `RBT_BUILD_TARGET` env var the `reboot()` plugin reads (`mcp:<name>`
// for one MCP App, or `web` for the web app). This is the loop around
// it: it loads the frontend's `vite.config.ts`, asks the plugin for
// the frontend's targets (every `<mcpAppPath>/<name>/index.html`, then
// the web app if there is one), and runs one build per target. A
// frontend whose build is just that calls it from a two-line
// `build.mjs`; one with more to do calls it between its own steps.
import {
  build as viteBuild,
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

export interface BuildOptions {
  // The frontend directory, where `vite.config.ts` is; the current
  // directory by default, which is where `npm run build` runs.
  root?: string;
  // The targets to build, `mcp:<name>` or `web`; every target the
  // plugin declares by default.
  targets?: string[];
}

export async function build({
  root = process.cwd(),
  targets,
}: BuildOptions = {}): Promise<void> {
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
        "`build()` builds the UIs that plugin declares."
    );
  }
  const declared: string[] = plugin.api.buildTargets(root);
  if (declared.length === 0) {
    throw new Error(
      `'${loaded.path}' declares no UIs: give \`reboot()\` an \`mcpAppPath\` with ` +
        "at least one `<name>/index.html`, or a `webAppPath`."
    );
  }

  for (const target of targets ?? []) {
    if (!declared.includes(target)) {
      throw new Error(
        `'${loaded.path}' declares no target '${target}'; it declares: ` +
          declared.join(", ")
      );
    }
  }

  // Each build re-reads the config with the target set; Vite's `mode`
  // stays at its build default (`production`) so a
  // `<webAppPath>/.env.production` is honored.
  for (const target of targets ?? declared) {
    console.log(`Building ${target} ...`);
    process.env.RBT_BUILD_TARGET = target;
    // The config file, not `root`: the plugin sets Vite's root from
    // the config's directory (and claims it), so the directory given
    // here only says where the config is.
    await viteBuild({ configFile: loaded.path });
  }
}
