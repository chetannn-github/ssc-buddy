const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
// Pure Study Lock controllers are shared with web and Windows; UI and SDKs
// continue to resolve from the mobile app's own dependencies.
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, "../shared")];
module.exports = config;
