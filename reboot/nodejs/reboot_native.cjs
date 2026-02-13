const chalk = require("chalk");
const process = require("node:process");
const os = require("node:os");
const path = require("node:path");

if (os.platform() === "win32") {
  console.error(
    chalk.stderr.bold.red(
      `Reboot is not yet supported on Windows. Please use Linux or macOS.`
    )
  );
  process.exit(-1);
}

const [major, minor, patch] = process.versions.node.split(".").map(Number);

if (major < 20 || (major == 20 && minor < 10)) {
  console.error(
    chalk.stderr.bold.red(
      `Reboot requires nodejs version >=20.10 (found ${major}.${minor}.${patch})`
    )
  );
  process.exit(-1);
}

const reboot_native = { exports: {} };

// If we are in a Next.js context, check that serverExternalPackages is
// correctly set. If not correctly set, Reboot backend TS code will not work
// with React Server Components inside Next.
if (__dirname.includes(".next")) {
  throw new Error(
    `For Next.js to work correctly with Reboot native code, an external
    package must be added to 'next.config.ts':

    In Next.js 14:
      experimental: {
        serverComponentsExternalPackages: ["@reboot-dev/reboot"],
      },
      ...

    In Next.js 15
      'serverExternalPackages: ['@reboot-dev/reboot']',
      ...
    `
  );
}

// NOTE: as of Python 3.8 we _must_ load the Python library via
// RTLD_GLOBAL, which loading our library will transitively do, and
// the only way to specify RTLD_GLOBAL is to do `process.dlopen()`
// ourselves.
process.dlopen(
  reboot_native,
  // TODO(benh): consider using `require(bindings)` to properly locate
  // 'reboot_native.node'.
  path.join(__dirname, "build", "Release", "reboot_native.node"),
  os.constants.dlopen.RTLD_NOW | os.constants.dlopen.RTLD_GLOBAL
);

exports.python3Path = reboot_native.exports.python3Path;
exports.Service_constructor = reboot_native.exports.Service_constructor;
exports.Service_call = reboot_native.exports.Service_call;
exports.Task_await = reboot_native.exports.Task_await;
exports.ExternalContext_constructor =
  reboot_native.exports.ExternalContext_constructor;
exports.Application_constructor = reboot_native.exports.Application_constructor;
exports.Application_run = reboot_native.exports.Application_run;
exports.Reboot_constructor = reboot_native.exports.Reboot_constructor;
exports.Reboot_createExternalContext =
  reboot_native.exports.Reboot_createExternalContext;
exports.Reboot_start = reboot_native.exports.Reboot_start;
exports.Reboot_stop = reboot_native.exports.Reboot_stop;
exports.Reboot_up = reboot_native.exports.Reboot_up;
exports.Reboot_down = reboot_native.exports.Reboot_down;
exports.Reboot_url = reboot_native.exports.Reboot_url;
exports.Context_generateIdempotentStateId =
  reboot_native.exports.Context_generateIdempotentStateId;
exports.WriterContext_set_sync = reboot_native.exports.WriterContext_set_sync;
exports.WorkflowContext_loop = reboot_native.exports.WorkflowContext_loop;
exports.retry_reactively_until = reboot_native.exports.retry_reactively_until;
exports.memoize = reboot_native.exports.memoize;
exports.Servicer_read = reboot_native.exports.Servicer_read;
exports.Servicer_write = reboot_native.exports.Servicer_write;
exports.importPy = reboot_native.exports.importPy;
exports.initialize = reboot_native.exports.initialize;
