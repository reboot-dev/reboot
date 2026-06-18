import chalk from "chalk";
import { spawnSync } from "child_process";
export * from "./errors.js";

export type Version = [number, number, number, string];

/**
 * Parses `version` into its numeric `major.minor.patch` components
 * plus its (possibly empty) development suffix. Mirrors
 * `_parse_version` in `reboot/versioning.py`. Throws when `version`
 * does not start with three numeric components.
 */
export function parseVersion(version: string): Version {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(.*)$/s);

  if (!match) {
    throw new Error(`Failed to parse '${version}' into a version`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]];
}

/**
 * Returns true if `versionA` is less than `versionB`.
 *
 * Mirrors `version_less_than` in `reboot/versioning.py`: the numeric
 * `major.minor.patch` components are compared first; when they are
 * equal, a version that carries a suffix (e.g. a development build of
 * the `//reboot:reboot.dev` Bazel target) is the higher one, since such
 * a build is made from source AFTER the release it is named for.
 * Suffixes break ties between numerically identical versions by
 * comparing lexicographically (any non-empty suffix naturally sorts
 * after an empty one). Throws when a version does not start with
 * three numeric components.
 */
export function versionLessThan(versionA: string, versionB: string): boolean {
  const [majorA, minorA, patchA, suffixA] = parseVersion(versionA);
  const [majorB, minorB, patchB, suffixB] = parseVersion(versionB);
  if (majorA !== majorB) {
    return majorA < majorB;
  }
  if (minorA !== minorB) {
    return minorA < minorB;
  }
  if (patchA !== patchB) {
    return patchA < patchB;
  }
  return suffixA < suffixB;
}

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
