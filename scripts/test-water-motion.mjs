import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../mobile-tasks/src/domain/water-motion.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { waterTiltTarget, waterOverflowStrength, stepWaterPuddle } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
test("water follows screen-plane gravity in portrait and sideways positions", () => {
  close(waterTiltTarget(0, -9.81, 0), 0);
  close(waterTiltTarget(9.81, 0, 0), -Math.PI / 2);
  close(waterTiltTarget(-9.81, 0, 0), Math.PI / 2);
  close(Math.abs(waterTiltTarget(0, 9.81, 0)), Math.PI);
});
test("a phone on the table settles at screen-bottom after either sideways tilt", () => {
  for (const previous of [-Math.PI / 2, Math.PI / 2, 0.7]) {
    for (const [x, y] of [[0, 0], [0.1, -0.2], [1, 0]]) close(waterTiltTarget(x, y, previous), 0);
  }
  close(waterTiltTarget(0, 0, 2 * Math.PI + 0.7), 2 * Math.PI);
});

test("missing readings preserve the last stable tilt", () => {
  for (const [x, y] of [[NaN, 3], [3, Infinity]]) close(waterTiltTarget(x, y, 0.7), 0.7);
});
test("rotating through upside-down takes the short path without snapping", () => {
  const previous = Math.PI - 0.02;
  const desired = -Math.PI + 0.02;
  const next = waterTiltTarget(-Math.sin(desired) * 9.81, -Math.cos(desired) * 9.81, previous);
  close(next - previous, 0.04);
});
test("a full phone rotation stays continuous in both directions", () => {
  for (const direction of [-1, 1]) {
    let previous = 0;
    for (let step = 1; step <= 72; step++) {
      const desired = direction * step * Math.PI / 36;
      const next = waterTiltTarget(-Math.sin(desired) * 9.81, -Math.cos(desired) * 9.81, previous);
      close(next, desired);
      previous = next;
    }
  }
});

test("water spills only after accumulated taps push it above the rim", () => {
  assert.equal(waterOverflowStrength(0.5, 40, 100), 0);
  assert.ok(waterOverflowStrength(0.5, 60, 100) > 0);
  assert.ok(waterOverflowStrength(0.5, 90, 100) > waterOverflowStrength(0.5, 60, 100));
  assert.equal(waterOverflowStrength(1, 100, 100), 1);
});
test("empty tanks and invalid measurements never spill", () => {
  assert.equal(waterOverflowStrength(0, 100, 100), 0);
  assert.equal(waterOverflowStrength(0.5, 100, 0), 0);
  assert.equal(waterOverflowStrength(0.5, NaN, 100), 0);
});

test("puddles run downhill and drain only at the downhill card edge", () => {
  for (const side of [-1, 1]) {
    let state = { x: 150, velocity: 0, volume: 1, exit: 0 };
    const tilt = -side * Math.PI / 4;
    for (let frame = 0; frame < 240; frame++) state = stepWaterPuddle(state.x, state.velocity, state.volume, tilt, 300, 1 / 60);
    assert.equal(state.exit, side);
    assert.ok(side < 0 ? state.x <= 9 : state.x >= 291);
    assert.ok(state.volume < 0.5);
  }
});
test("flat-phone puddles slow down without draining through a side", () => {
  let state = { x: 150, velocity: 50, volume: 1, exit: 0 };
  for (let frame = 0; frame < 120; frame++) state = stepWaterPuddle(state.x, state.velocity, state.volume, 0, 300, 1 / 60);
  assert.ok(Math.abs(state.velocity) < 0.1);
  assert.equal(state.exit, 0);
  assert.ok(state.volume > 0.95);
});
test("puddle simulation stays inside card bounds after delayed frames and rapid tilt reversal", () => {
  let state = { x: 8, velocity: -200, volume: 0.5, exit: 0 };
  state = stepWaterPuddle(state.x, state.velocity, state.volume, -Math.PI / 2, 300, 5);
  assert.ok(state.x >= 8 && state.x <= 292);
  for (let frame = 0; frame < 180; frame++) state = stepWaterPuddle(state.x, state.velocity, state.volume, -Math.PI / 2, 300, 1 / 60);
  assert.ok(state.x > 200);
  assert.ok(state.volume >= 0);
});
