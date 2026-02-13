// Using that file to improve the readability in the package.json.

const { execSync } = require("child_process");

if (process.platform === "win32") {
  // Skip on Windows.
  process.exit(0);
}

execSync("./prepare_environment.sh", { stdio: "inherit" });
