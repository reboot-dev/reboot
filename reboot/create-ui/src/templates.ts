import type { UiEntryWithPackage } from "./discover.js";

// Templates imported as strings via esbuild's text loader
// (`--loader:.tmpl=text`). Parameterized templates use
// `{{variable}}` placeholders filled by `render()`.
import viteConfigTmpl from "../templates/vite.config.ts.tmpl";
import buildJsTmpl from "../templates/build.js.tmpl";
import indexCssTmpl from "../templates/index.css.tmpl";
import appModuleCssTmpl from "../templates/App.module.css.tmpl";
import indexHtmlTmpl from "../templates/index.html.tmpl";
import mainTsxTmpl from "../templates/main.tsx.tmpl";
import appTsxTmpl from "../templates/App.tsx.tmpl";

/** Replace `{{key}}` placeholders with values. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key] ?? `{{${key}}}`
  );
}

/** Convert snake_case to PascalCase. */
function pascalCase(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** Exported app component name, e.g. `"ShowClickerApp"`. */
function appName(ui: UiEntryWithPackage): string {
  return `${pascalCase(ui.name)}App`;
}

// ── Shared files (web root) ────────────────────────────

/**
 * Build scripts use vite's auto-discovery, so they don't
 * need to be updated when new UIs are added.
 */
export function packageJson(projectName: string): string {
  const pkg = {
    name: `${projectName}-web`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc --noEmit && node build.js",
      "build:watch": 'concurrently "npm:build:watch:*"',
    },
    dependencies: {
      "@modelcontextprotocol/ext-apps": "1.2.0",
      "@modelcontextprotocol/sdk": "1.27.1",
      "@reboot-dev/reboot-react": "0.45.2",
      "@reboot-dev/reboot-api": "0.45.2",
      react: "^18.2.0",
      "react-dom": "^18.2.0",
      zod: "^3.25.0",
    },
    devDependencies: {
      "@types/react": "^18.2.67",
      "@types/react-dom": "^18.2.22",
      "@vitejs/plugin-react": "^4.7.0",
      concurrently: "^9.1.2",
      typescript: "^5.9.2",
      vite: "^6.3.5",
      "vite-plugin-singlefile": "^2.0.3",
    },
  };

  return JSON.stringify(pkg, null, 2) + "\n";
}

export function viteConfig(): string {
  return viteConfigTmpl;
}

export function buildJs(): string {
  return buildJsTmpl;
}

export function tsconfigJson(): string {
  return (
    JSON.stringify(
      {
        files: [],
        references: [
          { path: "./tsconfig.app.json" },
          { path: "./tsconfig.node.json" },
        ],
      },
      null,
      2
    ) + "\n"
  );
}

export function tsconfigAppJson(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          tsBuildInfoFile: "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
          target: "ES2022",
          useDefineForClassFields: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          moduleDetection: "force",
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          baseUrl: ".",
          paths: {
            "@api/*": ["./api/*"],
          },
        },
        include: ["."],
      },
      null,
      2
    ) + "\n"
  );
}

export function tsconfigNodeJson(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          tsBuildInfoFile: "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
          target: "ES2023",
          lib: ["ES2023"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          moduleDetection: "force",
          noEmit: true,
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ["vite.config.ts"],
      },
      null,
      2
    ) + "\n"
  );
}

// ── Per-UI files ───────────────────────────────────────

export function indexCss(): string {
  return indexCssTmpl;
}

export function indexHtml(ui: UiEntryWithPackage): string {
  return render(indexHtmlTmpl, {
    title: ui.title,
  });
}

export function mainTsx(ui: UiEntryWithPackage): string {
  return render(mainTsxTmpl, {
    appName: appName(ui),
  });
}

export function appTsx(ui: UiEntryWithPackage): string {
  const pkgPath = ui.package.replace(/\./g, "/");
  const protoBase = ui.stateName.toLowerCase();

  return render(appTsxTmpl, {
    appName: appName(ui),
    hookName: `use${ui.stateName}`,
    importPath: `@api/${pkgPath}/${protoBase}_rbt_react`,
    titleLower: ui.title.toLowerCase(),
  });
}

export function appModuleCss(): string {
  return appModuleCssTmpl;
}
