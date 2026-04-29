import fs from "fs";
import path from "path";
import type { UiEntryWithPackage } from "./discover.js";
import * as templates from "./templates.js";

/** Write a file only if it does not already exist. */
function writeIfMissing(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

/**
 * Derive the web root from the react output directory.
 * `.rbtrc` has `generate --react=web/api` — the web root
 * is the first path component (e.g. `web`).
 */
function webRoot(reactDir: string): string {
  return reactDir.split("/")[0];
}

function projectName(projectRoot: string): string {
  return path.basename(projectRoot);
}

export interface ScaffoldResult {
  webRootDir: string;
  createdShared: string[];
  createdUis: string[];
  /** UIs whose paths don't match the web root. */
  skipped: UiEntryWithPackage[];
}

/**
 * Scaffold shared web root files and per-UI files for
 * unimplemented UIs. All UIs must live under the web
 * root derived from `--react=` in `.rbtrc`.
 */
export function scaffold(
  projectRoot: string,
  reactDir: string,
  allUis: UiEntryWithPackage[],
  unimplemented: UiEntryWithPackage[]
): ScaffoldResult {
  const root = webRoot(reactDir);
  const webDir = path.join(projectRoot, root);
  const name = projectName(projectRoot);

  const skipped = unimplemented.filter((ui) => ui.path.split("/")[0] !== root);
  const toScaffold = unimplemented.filter(
    (ui) => ui.path.split("/")[0] === root
  );

  const createdShared: string[] = [];
  const createdUis: string[] = [];

  // Derive UI directory names for package.json build scripts.
  // Use the last path component (e.g. "web/ui/profile" -> "profile")
  // to match what the vite config discovers under ui/.
  const uiNames = allUis
    .filter((ui) => ui.path.split("/")[0] === root)
    .map((ui) => path.basename(ui.path));

  // Shared files (written once, never updated).
  const sharedFiles: Array<[string, string]> = [
    ["package.json", templates.packageJson(name, uiNames)],
    ["vite.config.ts", templates.viteConfig()],
    ["tsconfig.json", templates.tsconfigJson()],
    ["tsconfig.app.json", templates.tsconfigAppJson()],
    ["tsconfig.node.json", templates.tsconfigNodeJson()],
  ];

  for (const [file, content] of sharedFiles) {
    const filePath = path.join(webDir, file);
    if (writeIfMissing(filePath, content)) {
      createdShared.push(path.relative(projectRoot, filePath));
    }
  }

  // Per-UI files.
  for (const ui of toScaffold) {
    const uiDir = path.join(projectRoot, ui.path);
    const files: Array<[string, string]> = [
      ["index.html", templates.indexHtml(ui)],
      ["main.tsx", templates.mainTsx(ui)],
      ["App.tsx", templates.appTsx(ui)],
      ["App.module.css", templates.appModuleCss()],
      ["index.css", templates.indexCss()],
    ];

    for (const [file, content] of files) {
      const filePath = path.join(uiDir, file);
      if (writeIfMissing(filePath, content)) {
        createdUis.push(path.relative(projectRoot, filePath));
      }
    }
  }

  return {
    webRootDir: root,
    createdShared,
    createdUis,
    skipped,
  };
}
