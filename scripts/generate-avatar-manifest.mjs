import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const avatarDirectory = join(process.cwd(), "public", "avatars");
const videoDirectory = join(process.cwd(), "public", "videos");
const imageExtension = /\.(avif|gif|jpe?g|png|webp)$/i;
const videoExtension = /\.(m4v|mov|mp4|ogv|webm)$/i;
const [avatarFiles, videoFiles] = await Promise.all([
  readdir(avatarDirectory).then((files) => files.filter((file) => imageExtension.test(file)).sort()),
  readdir(videoDirectory).then((files) => files.filter((file) => videoExtension.test(file)).sort()),
]);

await Promise.all([
  writeFile(join(avatarDirectory, "manifest.json"), `${JSON.stringify(avatarFiles, null, 2)}\n`),
  writeFile(join(videoDirectory, "manifest.json"), `${JSON.stringify(videoFiles, null, 2)}\n`),
]);
