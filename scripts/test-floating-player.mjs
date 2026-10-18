import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../mobile-tasks/src/domain/floating-player.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { playerBounds, clampPlayer, cornerPosition, nearestPlayerCorner } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("dragging into each screen quadrant snaps to its matching corner", () => {
  const bounds = playerBounds(390, 800, 214, 54, 104);
  for (const [point, expected] of [
    [{ x: -100, y: -200 }, "top-left"],
    [{ x: 500, y: -200 }, "top-right"],
    [{ x: -100, y: 1000 }, "bottom-left"],
    [{ x: 500, y: 1000 }, "bottom-right"],
  ]) {
    const clamped = clampPlayer(point, bounds);
    assert.equal(nearestPlayerCorner(clamped, bounds), expected);
    const target = cornerPosition(expected, bounds);
    assert.ok(target.x >= 0 && target.x + 214 <= 390);
    assert.ok(target.y >= 0 && target.y + 54 <= 800 - 104);
  }
});

test("showing navigation lifts bottom corners while top corners remain fixed", () => {
  const hidden = playerBounds(390, 800, 214, 54, 20);
  const visible = playerBounds(390, 800, 214, 54, 104);
  assert.deepEqual(cornerPosition("top-left", hidden), cornerPosition("top-left", visible));
  assert.equal(
    cornerPosition("bottom-right", hidden).y - cornerPosition("bottom-right", visible).y,
    84,
  );
});

test("rotation and narrow windows keep the selected corner inside the available area", () => {
  for (const [width, height] of [
    [800, 390],
    [240, 600],
    [180, 320],
  ]) {
    const playerWidth = Math.min(214, width - 22);
    const bounds = playerBounds(width, height, playerWidth, 54, 84);
    for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const point = cornerPosition(corner, bounds);
      assert.ok(point.x + playerWidth <= width - 11);
      assert.ok(point.y + 54 <= height - 84 - 12);
    }
  }
});
