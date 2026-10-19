import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../mobile-tasks/src/domain/music-seek.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { musicRingProgress, continueMusicSeek } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8);
test("ring coordinates map top/right/bottom/left to the correct song positions", () => {
  close(musicRingProgress(56, 0, 112), 0);
  close(musicRingProgress(112, 56, 112), 0.25);
  close(musicRingProgress(56, 112, 112), 0.5);
  close(musicRingProgress(0, 56, 112), 0.75);
});
test("screen positions remain correct regardless of artwork touch target", () => {
  const origin = { x: 120, y: 240 };
  close(musicRingProgress(120 - origin.x, 296 - origin.y, 112), 0.75);
  close(musicRingProgress(232 - origin.x, 296 - origin.y, 112), 0.25);
});
test("dragging across the top seam clamps instead of jumping to the other end", () => {
  close(continueMusicSeek(0.98, 0.02), 1);
  close(continueMusicSeek(0.02, 0.98), 0);
  close(continueMusicSeek(1, 0.99), 0.99);
  close(continueMusicSeek(0, 0.01), 0.01);
});
test("leftward and rightward drags stay continuous away from the seam", () => {
  close(continueMusicSeek(0.75, 0.70), 0.70);
  close(continueMusicSeek(0.25, 0.30), 0.30);
});
