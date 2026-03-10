import chalk from "chalk";
import { spawnSync } from "child_process";
export * from "./errors.js";

export function parseVersion(version: string): [number, number, number] {
  const match = version.trim().match(/(\d+\.\d+\.\d+)/);

  if (!match) {
    throw new Error(`Failed to parse '${version}' into a version`);
  }

  return version.split(".").map(Number) as [number, number, number];
}

export type Version = [number, number, number];

export function supportedVersion({
  required: [requiredMajor, requiredMinor, requiredPatch],
  found: [foundMajor, foundMinor, foundPatch],
}: {
  required: Version;
  found: Version;
}) {
  return (
    foundMajor > requiredMajor ||
    (foundMajor === requiredMajor && foundMinor > requiredMinor) ||
    (foundMajor === requiredMajor &&
      foundMinor === requiredMinor &&
      foundPatch >= requiredPatch)
  );
}

export function ensureYarnNodeLinker() {
  // Ensure that they aren't using Yarn Plug'n'Play which we don't yet
  // support.
  const nodeLinker = spawnAndReturnStdout("yarn", [
    "config",
    "get",
    "nodeLinker",
  ]);

  if (nodeLinker.trim() !== "node-modules") {
    console.error(
      chalk.stderr.bold.red(
        "Yarn Plug'n'Play is not yet supported, you must use 'node-modules' as your 'nodeLinker'"
      )
    );
    process.exit(-1);
  }
}

/**
 * Spawn a process with the given arguments, and return its stdout as a string.
 */
export function spawnAndReturnStdout(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.error) {
    throw new Error(
      `Failed to run '${command} ${args.join(" ")}': ${result.error}\n` +
        `\n` +
        `Please report this bug to the maintainers!`
    );
  } else if (result.status !== 0) {
    throw new Error(
      `Running '${command} ${args.join(" ")}' exited with status ${
        result.status
      }. Please report this bug including the output of that command (if any) to the maintainers!`
    );
  }

  return result.stdout.toString();
}
