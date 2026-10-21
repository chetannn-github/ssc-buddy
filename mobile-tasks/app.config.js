const { syncLaunchImages } = require("./scripts/launch-image-assets.cjs");

// Expo evaluates config for local commands and before creating the EAS archive.
// Bundle the current shared images even when prestart/prepare-media wasn't run.
module.exports = ({ config }) => {
  syncLaunchImages();
  return config;
};
