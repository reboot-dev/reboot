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
 * `.rbtrc` has `generate --react=frontend/api` — the web root
 * is the first path component (e.g. `frontend`).
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
}

/**
 * Scaffold shared web root files and per-UI files for
 * unimplemented UIs. Each UI lives at `<web root>/mcp/<path>`, its
 * `UI(path=...)` under the `mcpAppPath: "mcp"` the scaffolded
 * `vite.config.ts` names; the web root is derived from `--react=`
 * in `.rbtrc`.
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

  const createdShared: string[] = [];
  const createdUis: string[] = [];

  // Shared files (written once, never updated).
  const sharedFiles: Array<[string, string]> = [
    ["package.json", templates.packageJson(name)],
    ["build.mjs", templates.buildMjs()],
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
  for (const ui of unimplemented) {
    const uiDir = path.join(webDir, "mcp", ui.path);
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
  };
}
