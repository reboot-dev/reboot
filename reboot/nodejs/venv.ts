import { Backoff } from "@reboot-dev/reboot-api";
import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as reboot_native from "./reboot_native.cjs";
import { REBOOT_VERSION } from "./version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const VENV_PATH = path.join(__dirname, ".venv");
export const VENV_EXEC_PATH = path.join(VENV_PATH, "bin");

const PYTHON_VERSION_REQUIRED = "3.10";
const PYTHONPATH = path.join(
  VENV_PATH,
  "lib",
  `python${PYTHON_VERSION_REQUIRED}`,
  "site-packages"
);
const PACKAGE_TO_INSTALL = `reboot==${REBOOT_VERSION}`;

// How many times to try `pip install` before giving up. pip retries a
// connection failure or a 5xx on its own, but not an index page it
// rejects, which PyPI occasionally serves (e.g., with an empty
// `Content-Type`); that fails the whole resolve with "No matching
// distribution found", so we retry the install.
const PIP_INSTALL_ATTEMPTS = 3;

// Ensure that the virtualenv at VENV_PATH has been created, and return the
// PYTHONHOME value to use.
function ensureVirtualEnvCreated() {
  const python3Path = reboot_native.python3Path();
  if (!fs.existsSync(VENV_PATH)) {
    execSync(`${python3Path} -m venv ${VENV_PATH}`);
  }
  return path.resolve(python3Path, "..", "..");
}

async function pipInstallReboot() {
  const show = spawnSync(
    `. ${path.join(
      VENV_EXEC_PATH,
      "activate"
    )} && pip show reboot | grep "Version: ${REBOOT_VERSION}"`,
    {
      shell: true,
      stdio: ["ignore", "ignore", "ignore"],
    }
  );

  const forceReinstall =
    process.env.REBOOT_FORCE_REINSTALL &&
    process.env.REBOOT_FORCE_REINSTALL.toLowerCase() === "true";

  if (show.status !== 0 || forceReinstall) {
    // Use a specific package if specified, useful within testing
    // environments.
    let packageToInstall = process.env.REBOOT_WHL_FILE || PACKAGE_TO_INSTALL;
    console.log(
      `Installing dependencies for Reboot, this may take a minute ...`
    );

    const backoff = new Backoff({
      initialBackoffSeconds: 4,
      maxBackoffSeconds: 16,
    });

    for (let attempt = 1; ; attempt++) {
      const install = spawnSync(
        `(. ${path.join(VENV_EXEC_PATH, "activate")} && pip install ${
          (forceReinstall && "--force-reinstall") || ""
        } ${packageToInstall}) 2>&1`,
        {
          shell: true,
          stdio: ["ignore", "pipe", "ignore"],
        }
      );

      if (install.status === 0) {
        break;
      }

      if (attempt === PIP_INSTALL_ATTEMPTS) {
        console.log(
          `\nFailed to install dependencies for Reboot:\n` +
            `\n` +
            `${install.stdout}\n`
        );
        process.exit(-1);
      }

      console.log(
        `Installing dependencies for Reboot failed ` +
          `(attempt ${attempt} of ${PIP_INSTALL_ATTEMPTS}), retrying ...`
      );
      await backoff.wait();
    }
  }
}

export async function ensurePythonVenv() {
  // If the virtual environment is already activated, do not attempt to
  // re-create it.
  if (process.env.VIRTUAL_ENV === VENV_PATH) {
    return;
  }

  // Ensure that the Docker base Reboot image version and the Reboot
  // version are in sync.
  if (process.env.REBOOT_BASE_IMAGE_VERSION) {
    if (process.env.REBOOT_BASE_IMAGE_VERSION !== REBOOT_VERSION) {
      console.log(
        `\nThe 'reboot-base' Docker image version ('${process.env.REBOOT_BASE_IMAGE_VERSION}') ` +
          `does not match the Reboot library version configured in the 'package.json' ` +
          `('${REBOOT_VERSION}').` +
          `\nPlease update the version of your 'reboot-base' image or the version of the ` +
          `Reboot library in your 'package.json'.`
      );
      process.exit(-1);
    }
  }
  const pythonhome = ensureVirtualEnvCreated();
  await pipInstallReboot();

  process.env.VIRTUAL_ENV = VENV_PATH;
  process.env.PYTHONHOME = pythonhome;
  process.env.PYTHONPATH = PYTHONPATH;
  process.env.PATH =
    VENV_EXEC_PATH +
    ((process.env.PATH && path.delimiter + process.env.PATH) || "");
}
