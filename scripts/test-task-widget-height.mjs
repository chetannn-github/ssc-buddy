import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../desktop-widget/src/lib/task-widget-height.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { taskWidgetHeight } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("empty and short task lists keep the header and empty state visible", () => {
  assert.equal(taskWidgetHeight(220, 0), 280);
  assert.equal(taskWidgetHeight(250, 0), 298);
});
test("adding, filtering and wrapping task rows grows and shrinks the target height", () => {
  assert.equal(taskWidgetHeight(240, 3 * 50), 390);
  assert.equal(taskWidgetHeight(240, 50), 290);
  assert.equal(taskWidgetHeight(240, 70), 310);
});
test("large lists scroll at the maximum height and fractional pixels round up", () => {
  assert.equal(taskWidgetHeight(240, 2000), 600);
  assert.equal(taskWidgetHeight(240.4, 50.3), 291);
});
