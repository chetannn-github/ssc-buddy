const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
// Study Lock code is shared with web and Windows. Shared hooks must use the
// mobile React/Firebase instances too, rather than resolving from shared/.
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, "../shared")];
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const mobileContext = moduleName === "react" || moduleName.startsWith("react/") || moduleName === "firebase" || moduleName.startsWith("firebase/")
    ? { ...context, originModulePath: path.join(__dirname, "index.js") }
    : context;
  return upstreamResolveRequest
    ? upstreamResolveRequest(mobileContext, moduleName, platform)
    : context.resolveRequest(mobileContext, moduleName, platform);
};
module.exports = config;
