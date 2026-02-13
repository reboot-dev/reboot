#!/usr/bin/env node
import { spawn } from "child_process";
import * as path from "path";
import whichPMRuns from "which-pm-runs";
import { ensureYarnNodeLinker } from "./utils/index.js";
import { ensurePythonVenv, VENV_EXEC_PATH } from "./venv.js";

async function ensureSupportedYarn() {
  const packageManager = await whichPMRuns();
  if (!packageManager) {
    return;
  }

  if (packageManager.name === "yarn") {
    ensureYarnNodeLinker();
  }
}

function addExtensionlessToNodeOptions() {
  // Add the `extensionless` loader to the `NODE_OPTIONS` env var so
  // subsequent invocations of Node.js will use it. Depending on which
  // version of Node.js we're using we have to add it differently.
  const [major, minor] = process.versions.node.split(".").map(Number);

  // Make sure that we can append to the `NODE_OPTIONS` env var.
  process.env.NODE_OPTIONS =
    (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS + " ") || "";

  // The `module.register()` function was added to Node.js in 20.6.0
  // for the main release line.
  //
  // If we have one of those two versions then we can pre import
  // `extensionless/register` to use the `module.register()` function,
  // otherwise we need to fall back to `--experimental-loader`.
  //
  // We've seen some issues related to the 'unknown file extension'
  // error on Node.js <= 20.9, so now we require at least 20.10
  // to use the `extensionless` loader.
  // https://github.com/reboot-dev/mono/issues/4068#issuecomment-2929571313
  // TODO: Revisit this, probably we would be able to drop that option
  // at all.
  if (major > 20 || (major === 20 && minor >= 10)) {
    process.env.NODE_OPTIONS += "--import=extensionless/register";
  } else {
    throw new Error(
      `The current version of Node.js is not supported.
       Supported versions are:
        * greater than or equal to 20.10`
    );
  }
}

async function main() {
  ensurePythonVenv();
  await ensureSupportedYarn();

  // Set env var to indicate that `rbt` is being invoked from Node.js.
  process.env.RBT_FROM_NODEJS = "true";

  // Add extensionless loader.
  addExtensionlessToNodeOptions();

  // Using 'spawn' instead of 'spawnSync' to avoid blocking the event loop for
  // signal handling.
  const rbt = spawn(
    `${path.join(VENV_EXEC_PATH, "rbt")}`,
    process.argv.slice(2),
    {
      stdio: "inherit",
    }
  );

  process.on("SIGINT", () => {
    // Make sure to kill the child process before exiting.
    rbt.once("exit", (code) => {
      process.exit(code);
    });
  });

  rbt.on("exit", (code) => {
    // If the child process exits with a non-zero code, exit with the same code.
    process.exit(code ?? 1);
  });

  rbt.on("error", (error) => {
    throw new Error(
      `Unable to execute 'rbt', please report this bug to the maintainers!\n${error}`
    );
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(-1);
});
