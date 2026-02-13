// Using that file to improve the readability in the package.json.
const { execSync } = require("child_process");
const fs = require("fs");

if (process.platform === "win32") {
  // Do nothing on Windows.
  process.exit(0);
}

function removeEnvFile(fileName) {
  if (fs.existsSync(fileName)) {
    fs.unlinkSync(fileName);
  }
}

try {
  const downloadedPythonPath = fs
    .readFileSync(".reboot_python_env", "utf8")
    .trim();
  const env = {
    ...process.env,
    CC: process.env.CC || fs.readFileSync(".reboot_cc_env", "utf8").trim(),
    CXX: process.env.CXX || fs.readFileSync(".reboot_cxx_env", "utf8").trim(),
    RBT_PYTHON3_USE: process.env.RBT_PYTHON3_USE || downloadedPythonPath,
    REBOOT_BAZEL_TEST_FOR_BINDING: "",
  };

  // For the Bazel tests we are using a specific Python installed on the
  // runners. So we need to provide that info to node-gyp to avoid
  // making extra steps, which may break the installation.
  if (env.RBT_PYTHON3_USE != downloadedPythonPath) {
    env.REBOOT_BAZEL_TEST_FOR_BINDING = "1";
  }

  const cmd = `node-gyp rebuild --python=${env.RBT_PYTHON3_USE}`;
  console.log(`\n📦 Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
} catch (err) {
  console.error("❌ install.js failed:", err);
  process.exit(1);
} finally {
  // Clean up the environment files.
  removeEnvFile(".reboot_cc_env");
  removeEnvFile(".reboot_cxx_env");
  removeEnvFile(".reboot_python_env");
}
