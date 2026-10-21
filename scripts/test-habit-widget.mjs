import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../mobile-tasks/src/", import.meta.url));
const cache = new Map();
const jsx = (type, props) => ({ type, props });
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, console, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react-native-android-widget") return { FlexWidget: "Flex", SvgWidget: "Svg", TextWidget: "Text" };
    assert.ok(name.startsWith("."), `Unexpected dependency ${name}`);
    return load(createRequire(filename).resolve(name));
  } });
  return exports;
}
// Node doesn't resolve extensionless TypeScript, unlike Metro.
const resolve = createRequire(import.meta.url);
resolve.extensions[".ts"] ??= resolve.extensions[".js"];
resolve.extensions[".tsx"] ??= resolve.extensions[".js"];
const { habitWidgetCalendar, habitWidgetLayout } = load(path.join(root, "domain/habit-widget-layout.ts"));
const { renderHabitWidget } = load(path.join(root, "widgets/HabitWidget.tsx"));
const { habitDay, normalizeHabitSettings, HABIT_COLORS } = load(path.join(root, "domain/habits.ts"));
const today = habitDay();
const habit = (settings = {}, completedDates = []) => ({ id: "one", name: "Read Daily", color: "purple", createdAt: "2026-01-01T00:00:00Z", targetDays: null, completedDates, settings: normalizeHabitSettings(settings) });
const flatten = (node) => !node ? [] : Array.isArray(node) ? node.flatMap(flatten)
  : typeof node === "object" ? [node, ...flatten(node.props?.children)] : [];

test("wide heatmap has exactly 20 aligned Sunday-first weeks, including future padding", () => {
  const cells = habitWidgetCalendar("2026-10-21", true);
  assert.equal(cells.length, 140);
  assert.equal(new Date(cells[0].key + "T12:00:00").getDay(), 0);
  assert.equal(cells.at(-1).row, 6);
  assert.equal(cells.filter((cell) => cell.future).length, 3);
  assert.equal(cells.find((cell) => cell.key === "2026-10-21").row, 3);
});
test("monthly calendar preserves weekday placement for leap years and six-row months", () => {
  const february = habitWidgetCalendar("2024-02-15", false);
  assert.equal(february.length, 29);
  assert.equal(february[0].column, 4);
  const august = habitWidgetCalendar("2026-08-21", false);
  assert.equal(august.at(-1).row, 5);
  assert.equal(august[0].column, 6);
});
test("resized widgets keep header, grid and controls within the card", () => {
  for (const size of [{ width: 140, height: 170 }, { width: 180, height: 170 }, { width: 360, height: 170 }, { width: 440, height: 230 }]) {
    const layout = habitWidgetLayout(size, "2026-08-21", 27);
    assert.ok(layout.gridWidth <= size.width - 24 + .01);
    assert.ok(layout.gridHeight + 24 + 38 + 8 + 27 <= size.height + .01);
  }
});
test("widget uses the habit color and switches between month and 20-week heatmaps", () => {
  for (const [size, boxes] of [[{ width: 180, height: 210 }, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()], [{ width: 360, height: 210 }, 140]]) {
    const tree = renderHabitWidget(habit(), "", size), nodes = flatten(tree);
    assert.equal(tree.props.style.backgroundColor, "#080808");
    const grid = nodes.find((node) => node.type === "Svg" && node.props.svg.includes("<rect"));
    assert.equal((grid.props.svg.match(/<rect/g) ?? []).length, boxes);
    assert.ok(grid.props.svg.includes(HABIT_COLORS.purple));
    assert.ok(nodes.some((node) => node.props.clickAction === "HABIT_TOGGLE"));
  }
});
test("count and checklist widgets retain direct marking controls", () => {
  const count = flatten(renderHabitWidget(habit({ tracking: "count", dailyGoal: 8, step: 2 })));
  assert.ok(count.some((node) => node.props.clickAction === "HABIT_PLUS"));
  assert.ok(count.some((node) => node.props.clickAction === "HABIT_MINUS"));
  const checklist = flatten(renderHabitWidget(habit({ tracking: "checklist", checklist: [{ id: "read:one", title: "Read", reminder: null }] })));
  assert.ok(checklist.some((node) => node.props.clickAction === "HABIT_CHECK_read%3Aone"));
  assert.ok(flatten(renderHabitWidget(habit({}, [today]))).some((node) => node.props.accessibilityLabel === "Undo completion"));
});


test("compact widgets show name and streak without a heatmap and preserve direct actions", () => {
  for (const [settings, expected] of [
    [{}, "HABIT_TOGGLE"],
    [{ tracking: "count", dailyGoal: 8, step: 2 }, "HABIT_PLUS"],
    [{ tracking: "checklist", checklist: [{ id: "read", title: "Read", reminder: null }] }, "HABIT_CHECK_read"],
  ]) {
    const item = habit(settings);
    const nodes = flatten(renderHabitWidget(item, "", { width: 140, height: 170 }, "compact"));
    assert.ok(nodes.some(node => node.props.text === item.name));
    assert.ok(nodes.some(node => node.props.text === "DAYS" || node.props.text === "DAY"));
    assert.ok(nodes.some(node => node.props.clickAction === expected));
    assert.ok(!nodes.some(node => node.type === "Svg" && node.props.svg.includes("<rect")));
  }
  const completed = flatten(renderHabitWidget(habit({}, [today]), "", { width: 140, height: 170 }, "compact"));
  assert.ok(completed.some(node => node.props.accessibilityLabel === "Undo completion"));
});
