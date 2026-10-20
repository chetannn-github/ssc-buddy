import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../mobile-tasks/src/domain/music-queue.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { musicQueueFor, initialMusicSelection } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const tracks = ["Focus/liked.mp3", "Energy/first.mp3", "Focus/first.mp3", "Focus/last.mp3"];
test("native queue keeps session ordering and selects the right index across mixed playlists", () => {
  assert.deepEqual(musicQueueFor(tracks, "Focus/first.mp3"), { tracks: [tracks[0], tracks[2], tracks[3]], index: 1 });
  assert.deepEqual(musicQueueFor(tracks, "Energy/first.mp3"), { tracks: [tracks[1]], index: 0 });
});
test("missing selections never send an invalid native index", () => {
  assert.equal(musicQueueFor(tracks, "Focus/deleted.mp3"), null);
  assert.equal(musicQueueFor([], "anything"), null);
});
test("notification reopening restores current song rather than liked-first default", () => {
  assert.deepEqual(initialMusicSelection(tracks, tracks[3]), { track: tracks[3], restore: true });
});
test("stopped or obsolete queues start with the preferred track", () => {
  assert.deepEqual(initialMusicSelection(tracks, null), { track: tracks[0], restore: false });
  assert.deepEqual(initialMusicSelection(tracks, "removed.mp3"), { track: tracks[0], restore: false });
  assert.deepEqual(initialMusicSelection([], null), { track: undefined, restore: false });
});
