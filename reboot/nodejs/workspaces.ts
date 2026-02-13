import whichPMRuns from "which-pm-runs";
import {
  parseVersion,
  spawnAndReturnStdout,
  supportedVersion,
} from "./utils/index.js";

type Workspace = {
  name: string;
};

/**
 * Returns package-manager Workspaces of which a project in the given directory
 * is a member.
 */
export async function locateWorkspaces(): Promise<Workspace[]> {
  const packageManager = await whichPMRuns();
  if (!packageManager) {
    return null;
  }

  // NOTE: These methods will error if they fail to extract
  // workspaces, based on the assumption that `whichPMRuns` will do a
  // reasonable job of detecting a package manager, otherwise throws
  // an exception.
  switch (packageManager.name) {
    case "yarn": {
      return extractYarnWorkspaces();
    }
    case "npm": {
      return extractNpmWorkspaces();
    }
    case "pnpm": {
      return extractPnpmWorkspaces();
    }
    default: {
      throw new Error(`Unsupported package manager '${packageManager}'`);
    }
  }
}

function extractYarnWorkspaces(): Workspace[] {
  // TODO: what is the actual minimum version we need?
  const YARN_VERSION_REQUIRED = "4.0.0";

  const required = parseVersion(YARN_VERSION_REQUIRED);

  const found = parseVersion(spawnAndReturnStdout("yarn", ["--version"]));

  if (!supportedVersion({ required, found })) {
    throw new Error(
      `yarn version >=${YARN_VERSION_REQUIRED} is required, found ${found.join(
        "."
      )}`
    );
  }

  const command = "yarn";
  const args = ["workspaces", "list", "--json", "--recursive"];

  // `yarn workspaces list --json` returns JSON lines, not complete
  // JSON, so we have to do some extra parsing ourselves.
  return spawnAndReturnStdout(command, args)
    .trim()
    .split("\n")
    .map((line) => {
      const { name } = JSON.parse(line.trim());
      return { name };
    });
}

function extractNpmWorkspaces(): Workspace[] {
  // We need >=8.16.0 which is when `npm query` was introduced.
  const NPM_VERSION_REQUIRED = "8.16.0";

  const required = parseVersion(NPM_VERSION_REQUIRED);

  const found = parseVersion(spawnAndReturnStdout("npm", ["--version"]));

  if (!supportedVersion({ required, found })) {
    throw new Error(
      `npm version >=${NPM_VERSION_REQUIRED} is required, found ${found.join(
        "."
      )}`
    );
  }

  const command = "npm";
  const args = ["query", ".workspace"];

  const workspaces = spawnAndParseJSON(command, args).map(({ name }) => ({
    name,
  }));

  // Include the package name as it might be used and it is consistent
  // with both `yarn` and `pnpm` which always include the top-level
  // package name even if they aren't explicitly in `workspaces`.
  const name = spawnAndParseJSON("npm", ["pkg", "get", "name"]);

  // `npm pkg get name` returns an empty object if there is no
  // top-level package name.
  if (Object.keys(name).length === 0) {
    return workspaces;
  } else if (typeof name !== "string") {
    throw new Error(
      `Failed to get name of your package. Please report this issue to the maintainers!`
    );
  }

  return [{ name }, ...workspaces];
}

function extractPnpmWorkspaces(): Workspace[] {
  // TODO: is there a minimum version required?

  const command = "pnpm";
  const args = ["list", "--recursive", "--depth", "-1", "--only-projects"];

  // `pnpm list --recursive --depth -1 --only-projects --json` emits something
  // which is not quite valid JSON: closer to JSON lines, but not easily splittable.
  //
  // Instead, we parse the human-readable output -- a series of lines like:
  //    @reboot-pm/prosemirror@0.0.1 /Users/example/src/repo_root/project_dir (PRIVATE)
  return spawnAndReturnStdout(command, args)
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.trim().split(" ");
      if (parts.length !== 3) {
        throw new Error(
          `Unexpected output from '${command} ${args.join(
            " "
          )}'. Please report the output of that command to the maintainers!`
        );
      }

      // Strip off the version from the name.
      const lastAtSign = parts[0].lastIndexOf("@");
      let name: string;
      if (lastAtSign !== -1 && lastAtSign !== 0) {
        name = parts[0].substring(0, lastAtSign);
      } else {
        name = parts[0];
      }

      return { name };
    });
}

/**
 * Spawn a process with the given arguments, and parse its stdout as JSON.
 *
 * Raises an error if the process cannot be spawned, or if JSON cannot be parsed.
 */
function spawnAndParseJSON(command: string, args: string[]): any {
  const stdout = spawnAndReturnStdout(command, args);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Failed to parse output of '${command} ${args.join(
        " "
      )}' as JSON: ${error}`
    );
  }
}
