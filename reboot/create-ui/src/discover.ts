import fs from "fs";
import path from "path";

/** A single UI from a `_rbt_ui.json` manifest. */
export interface UiEntry {
  name: string;
  stateName: string;
  path: string;
  title: string;
}

/** A UI entry enriched with its proto package and base name. */
export interface UiEntryWithPackage extends UiEntry {
  package: string;
  /** Base name of the proto/API file (e.g. "romeo" from romeo_rbt_ui.json). */
  protoBase: string;
}

interface UiManifest {
  package: string;
  uis: UiEntry[];
}

/**
 * Walk up from `startDir` looking for `.rbtrc` or
 * `pyproject.toml` — whichever comes first is the project
 * root.
 */
export function findProjectRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    if (
      fs.existsSync(path.join(dir, ".rbtrc")) ||
      fs.existsSync(path.join(dir, "pyproject.toml"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    // Reached the filesystem root.
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Parse `.rbtrc` for `generate --react=<dir>`. Returns
 * the directory relative to the project root, or `null`
 * if no `--react` flag is found.
 */
export function parseReactDir(rbtrcPath: string): string | null {
  if (!fs.existsSync(rbtrcPath)) return null;
  const lines = fs.readFileSync(rbtrcPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^generate\s+--react=(\S+)/);
    if (match) return match[1];
  }
  return null;
}

/** Recursively glob for `*_rbt_ui.json` files. */
function globManifests(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...globManifests(full));
    } else if (entry.name.endsWith("_rbt_ui.json")) {
      results.push(full);
    }
  }
  return results;
}

export interface DiscoveryResult {
  projectRoot: string;
  /** React output dir from `.rbtrc`, e.g. `"web/api"`. */
  reactDir: string;
  allUis: UiEntryWithPackage[];
  unimplemented: UiEntryWithPackage[];
}

/**
 * Discover all UIs defined in `_rbt_ui.json` manifests
 * and determine which ones are not yet scaffolded.
 */
export function discover(cwd: string): DiscoveryResult | null {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) return null;

  const rbtrcPath = path.join(projectRoot, ".rbtrc");
  const reactDir = parseReactDir(rbtrcPath);

  // Search in the react output dir, or common defaults.
  const searchDirs: string[] = [];
  if (reactDir) {
    searchDirs.push(path.join(projectRoot, reactDir));
  }
  for (const d of ["web/api", "api"]) {
    const full = path.join(projectRoot, d);
    if (!searchDirs.includes(full)) {
      searchDirs.push(full);
    }
  }

  const manifests: string[] = [];
  for (const dir of searchDirs) {
    manifests.push(...globManifests(dir));
  }

  if (manifests.length === 0) return null;

  const allUis: UiEntryWithPackage[] = [];
  for (const manifestPath of manifests) {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest: UiManifest = JSON.parse(raw);
    // Derive proto base from manifest filename:
    // e.g. "romeo_rbt_ui.json" -> "romeo"
    const baseName = path.basename(manifestPath);
    const protoBase = baseName.replace(/_rbt_ui\.json$/, "");
    for (const ui of manifest.uis) {
      allUis.push({
        ...ui,
        package: manifest.package,
        protoBase,
      });
    }
  }

  const unimplemented = allUis.filter((ui) => {
    const indexHtml = path.join(projectRoot, ui.path, "index.html");
    return !fs.existsSync(indexHtml);
  });

  return {
    projectRoot,
    reactDir: reactDir ?? "web/api",
    allUis,
    unimplemented,
  };
}
