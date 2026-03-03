#!/usr/bin/env node

import chalk from "chalk";
import esbuild from "esbuild";
import { writeFileSync } from "node:fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { locateWorkspaces } from "./workspaces.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expected usage: rbt-esbuild path/to/application.ts name
const args = process.argv.slice(2);
const application = args[0];
const name = args[1];

export const BUNDLE_PATH = path.join(__dirname, ".bundles", name);

let workspaces: string[] = [];

try {
  workspaces = (await locateWorkspaces()).map(({ name }) => name);
} catch (e) {
  console.error(
    chalk.stderr.bold.red(
      `Failed to use your package manager to determine your workspaces (if any): ${e}`
    )
  );
  process.exit(-1);
}

const plugin = {
  name: "rbt-esbuild",
  setup(build) {
    build.onResolve({ namespace: "file", filter: /.*/ }, (args) => {
      // Do not mark as 'external' files starting with '.' or '/' because those
      // are assumed to be local.
      if (args.path.startsWith(".") || args.path.startsWith("/")) {
        return null;
      }

      // Workspace modules are also local, not external.
      for (const workspace of workspaces) {
        if (args.path === workspace || args.path.startsWith(workspace + "/")) {
          return null;
        }
      }

      // Mark everything else external.
      return { path: args.path, external: true };
    });
  },
};

esbuild
  .build({
    entryPoints: [application],
    bundle: true,
    platform: "node",
    format: "esm",
    metafile: true,
    sourcemap: "inline",
    banner: {
      js: "/* eslint-disable */",
    },
    outfile: path.join(BUNDLE_PATH, "bundle.js"),
    plugins: [plugin],
    // This is only called by `rbt dev` and thus should only do module
    // resolution for "development".
    conditions: ["development"],

    // TODO: support taking either `esbuild.config.js` or a more
    // general `rbt.config.js` which would export a default object
    // with options to pass on for specific esbuild, for example:
    //
    // export default {
    //   esbuild: {
    //     conditions: ["something"]
    //   }
    // };
    //
    // We'll likely need to have users pass us the path to this file
    // via some flag like
    // `--esbuild-config=path/to/esbuild.config.js` or
    // `--nodejs-config=path/to/rbt.config.js`.
    //
    // We could try to find the file but it's not obvious where to
    // look. We could look for it based on `.rbtrc` or
    // `--state-directory` (which ever was specified) but it's not
    // obvious it should always be there, e.g., in the case of a
    // monorepo with a `.rbtrc` that has "config" based flags.
    //
    // Once we have the file we can support overriding, for example:
    //
    // ...("conditions" in config.esbuild && { conditions: config.esbuild.conditions } ||  {}),
  })
  .then(async (result) => {
    writeFileSync(
      path.join(BUNDLE_PATH, "meta.json"),
      JSON.stringify(result.metafile)
    );
    // Output the path where we bundled for `rbt dev` to consume.
    console.log(BUNDLE_PATH);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(-1);
  });
