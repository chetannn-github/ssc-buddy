import { syncLaunchImages } from "./launch-image-assets.cjs";
const files = syncLaunchImages();
console.log(`Launch images synced: ${files.length}`);
