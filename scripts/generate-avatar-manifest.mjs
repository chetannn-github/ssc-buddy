import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const avatarDirectory = join(process.cwd(), "public", "avatars");
const videoDirectory = join(process.cwd(), "public", "videos");
const musicDirectory = join(process.cwd(), "public", "music");
const imageExtension = /\.(avif|gif|jpe?g|png|webp)$/i;
const videoExtension = /\.(m4v|mov|mp4|ogv|webm)$/i;
const musicExtension = /\.(mp3|m4a|ogg|wav)$/i;
const [avatarFiles, videoFiles, musicFiles] = await Promise.all([
  readdir(avatarDirectory).then((files) => files.filter((file) => imageExtension.test(file)).sort()),
  readdir(videoDirectory).then((files) => files.filter((file) => videoExtension.test(file)).sort()),
  readdir(musicDirectory).then((files) => files.filter((file) => musicExtension.test(file)).sort()),
]);

await Promise.all([
  writeFile(join(avatarDirectory, "manifest.json"), `${JSON.stringify(avatarFiles, null, 2)}\n`),
  writeFile(join(videoDirectory, "manifest.json"), `${JSON.stringify(videoFiles, null, 2)}\n`),
  writeFile(join(musicDirectory, "manifest.json"), `${JSON.stringify(musicFiles, null, 2)}\n`),
]);
