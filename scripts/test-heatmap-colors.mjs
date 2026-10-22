import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../mobile-tasks/src/domain/heatmap-colors.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { HEATMAP_EMPTY_COLOR, heatmapPaletteColor, nextHeatmapColorCycle } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const cycles = Array.from({ length: 4 }, (_, index) => nextHeatmapColorCycle(undefined, () => (index + 0.5) / 4));

test("new visits can choose all reference-inspired color families", () => {
  assert.equal(new Set(cycles.map(cycle => heatmapPaletteColor(4, cycle, "activity"))).size, 4);
});

test("a return visit changes each heatmap's palette without repeating the previous one", () => {
  for (const previous of cycles) {
    for (const random of [0, 0.25, 0.5, 0.9999]) {
      const next = nextHeatmapColorCycle(previous, () => random);
      assert.equal(next.seed, previous.seed + 1);
      assert.notEqual(next.shift, previous.shift);
      for (const mode of ["activity", "tasks"]) assert.notEqual(heatmapPaletteColor(4, next, mode), heatmapPaletteColor(4, previous, mode));
    }
  }
});

test("inactive days remain neutral and higher activity uses darker shades", () => {
  const brightness = hex => {
    const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const cycle of cycles) for (const mode of ["activity", "tasks"]) {
    assert.equal(heatmapPaletteColor(0, cycle, mode), HEATMAP_EMPTY_COLOR);
    const shades = [1, 2, 3, 4].map(level => brightness(heatmapPaletteColor(level, cycle, mode)));
    assert.ok(shades.every((shade, index) => index === 0 || shade < shades[index - 1]));
  }
});

test("Activity and Tasks keep distinct, stable palettes throughout one visit", () => {
  for (const cycle of cycles) {
    const activity = [1, 2, 3, 4].map(level => heatmapPaletteColor(level, cycle, "activity"));
    const tasks = [1, 2, 3, 4].map(level => heatmapPaletteColor(level, cycle, "tasks"));
    assert.notDeepEqual(activity, tasks);
    assert.deepEqual([1, 2, 3, 4].map(level => heatmapPaletteColor(level, cycle, "activity")), activity);
    assert.deepEqual([1, 2, 3, 4].map(level => heatmapPaletteColor(level, cycle, "tasks")), tasks);
  }
});
