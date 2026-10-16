import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// react-native-track-player 4.1.2 declares a nullable Android Bundle where
// React Native 0.86's Kotlin compiler expects a non-null value. EAS uses a
// clean install, so patch this dependency after every install instead of
// relying on a manually edited node_modules directory.
const kotlinFile = resolve(
  process.cwd(),
  "node_modules/react-native-track-player/android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt",
);

if (!existsSync(kotlinFile)) process.exit(0);

const source = readFileSync(kotlinFile, "utf8");
const patched = source
  .replaceAll(
    "Arguments.fromBundle(musicService.tracks[index].originalItem)",
    "Arguments.fromBundle(musicService.tracks[index].originalItem ?: Bundle())",
  )
  .replace(
    /Arguments\.fromBundle\(\s*musicService\.tracks\[musicService\.getCurrentTrackIndex\(\)\]\.originalItem\s*\)/g,
    "Arguments.fromBundle(musicService.tracks[musicService.getCurrentTrackIndex()].originalItem ?: Bundle())",
  );

if (patched !== source) {
  writeFileSync(kotlinFile, patched);
  console.log("Patched react-native-track-player for Kotlin 2.1.");
}
