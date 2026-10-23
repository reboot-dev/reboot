const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Metro watches the workspace's packages, but the generated Reboot
// client lives in the sibling `frontend/api/` directory, and the date
// helpers shared with the web app in `frontend/common/`, so Metro must
// be told to watch them too.
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, "..", "api"),
  path.resolve(__dirname, "..", "common"),
];

module.exports = config;
