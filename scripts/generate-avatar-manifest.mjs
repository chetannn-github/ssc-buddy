import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const avatarDirectory = join(process.cwd(), "public", "avatars");
// Media has one source of truth for web and Expo. The web serves this folder
// directly from /media; Expo consumes its generated manifest remotely.
const mediaDirectory = join(process.cwd(), "public", "media");
const videoDirectory = join(mediaDirectory, "videos");
const musicDirectory = join(mediaDirectory, "music");
const imageExtension = /\.(avif|gif|jpe?g|png|webp)$/i;
const videoExtension = /\.(m4v|mov|mp4|ogv|webm)$/i;
const musicExtension = /\.(mp3|m4a|ogg|wav)$/i;
const [avatarFiles, videoFiles, musicFiles] = await Promise.all([
  readdir(avatarDirectory).then((files) => files.filter((file) => imageExtension.test(file)).sort()),
  readdir(videoDirectory).then((files) => files.filter((file) => videoExtension.test(file)).sort()),
  readdir(musicDirectory, { recursive: true }).then((files) =>
    files.filter((file) => musicExtension.test(file)).map((file) => file.replaceAll("\\", "/")).sort(),
  ),
]);

await Promise.all([
  writeFile(join(avatarDirectory, "manifest.json"), `${JSON.stringify(avatarFiles, null, 2)}\n`),
  writeFile(join(videoDirectory, "manifest.json"), `${JSON.stringify(videoFiles, null, 2)}\n`),
  writeFile(join(musicDirectory, "manifest.json"), `${JSON.stringify(musicFiles, null, 2)}\n`),
]);
