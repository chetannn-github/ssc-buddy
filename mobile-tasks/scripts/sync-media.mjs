import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve from this file instead of process.cwd(): the root web build invokes
// this script too, while EAS invokes it from mobile-tasks.
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sharedMediaRoot = join(projectRoot, "..", "public", "media");
const generatedFile = join(projectRoot, "src", "lib", "generated-media.ts");
const generatedCoverDirectory = join(sharedMediaRoot, "covers", "generated");
const extensions = {
  music: /\.(mp3|m4a|ogg|wav)$/i,
  videos: /\.(m4v|mov|mp4|ogv|webm)$/i,
};

async function listFiles(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return (await listFiles(path)).map((file) => join(entry.name, file));
    return entry.isFile() ? [entry.name] : [];
  }));
  return nested.flat();
}

async function syncKind(kind) {
  const source = join(sharedMediaRoot, kind);
  return (await listFiles(source))
    .filter((file) => extensions[kind].test(file))
    .map((file) => file.replaceAll("\\", "/"))
    .sort((left, right) => left.localeCompare(right));
}

const [musicTracks, videoTracks] = await Promise.all([syncKind("music"), syncKind("videos")]);

function readEmbeddedCover(buffer) {
  const frameAt = buffer.indexOf(Buffer.from("APIC"));
  if (frameAt < 0 || frameAt + 10 > buffer.length) return null;
  const frameEnd = Math.min(buffer.length, frameAt + 10 + buffer.readUInt32BE(frameAt + 4));
  const jpeg = buffer.indexOf(Buffer.from([0xff, 0xd8]), frameAt + 10);
  const png = buffer.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]), frameAt + 10);
  const offset = [jpeg, png].filter((value) => value >= frameAt + 10 && value < frameEnd).sort((a, b) => a - b)[0];
  if (offset === undefined) return null;
  return { bytes: buffer.subarray(offset, frameEnd), extension: offset === png ? "png" : "jpg" };
}

async function generateCovers(tracks) {
  await rm(generatedCoverDirectory, { recursive: true, force: true });
  await mkdir(generatedCoverDirectory, { recursive: true });
  const covers = await Promise.all(tracks.filter((track) => /\.mp3$/i.test(track)).map(async (track) => {
    try {
      const cover = readEmbeddedCover(await readFile(join(sharedMediaRoot, "music", track)));
      if (!cover) return null;
      const file = `${createHash("sha1").update(track).digest("hex").slice(0, 16)}.${cover.extension}`;
      await writeFile(join(generatedCoverDirectory, file), cover.bytes);
      return [track, file];
    } catch { return null; }
  }));
  return Object.fromEntries(covers.filter(Boolean));
}

const covers = await generateCovers(musicTracks);
const source = `// Generated from public/media by scripts/sync-media.mjs. Do not edit manually.\n\nexport const musicTracks = ${JSON.stringify(musicTracks, null, 2)} as string[];\nexport const videoTracks = ${JSON.stringify(videoTracks, null, 2)} as string[];\nexport const musicCovers: Record<string, string> = ${JSON.stringify(covers, null, 2)};\n`;
await mkdir(dirname(generatedFile), { recursive: true });
await writeFile(generatedFile, source);
console.log(`SSC Buddy media synced: ${videoTracks.length} reels, ${musicTracks.length} audio tracks.`);
