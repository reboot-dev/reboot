const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Metro watches the workspace's packages, but the generated Reboot
// client lives in the sibling `frontend/api/` directory, so Metro
// must be told to watch it too.
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, "..", "api"),
];

module.exports = config;
