import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const avatarDirectory = join(process.cwd(), "public", "avatars");
const imageExtension = /\.(avif|gif|jpe?g|png|webp)$/i;
const files = (await readdir(avatarDirectory)).filter((file) => imageExtension.test(file)).sort();

await writeFile(join(avatarDirectory, "manifest.json"), `${JSON.stringify(files, null, 2)}\n`);
