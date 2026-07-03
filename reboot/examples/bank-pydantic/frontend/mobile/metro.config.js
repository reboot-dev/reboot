// Default Expo Metro config. Kept explicit so it is easy to extend if
// the example grows (e.g. adding `watchFolders`).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;
