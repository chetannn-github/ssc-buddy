import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../desktop-widget/", import.meta.url));
const requireDesktop = createRequire(path.join(root, "package.json"));
const React = requireDesktop("react");
const { renderToStaticMarkup } = requireDesktop("react-dom/server");
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Map, console, require(name) {
    if (name.endsWith(".css")) return {};
    if (name === "@number-flow/react") return { __esModule: true, default: ({ value, suffix = "" }) => React.createElement("span", null, value + suffix) };
    if (!name.startsWith(".")) return requireDesktop(name);
    const base = path.resolve(path.dirname(filename), name);
    if (base === path.join(root, "src/lib/firebase")) return { getFirebaseFirestore: () => ({}) };
    const resolved = [base, base + ".ts", base + ".tsx"].find(existsSync);
    assert.ok(resolved, `Cannot resolve ${name} from ${filename}`);
    return load(resolved);
  } });
  return exports;
}
const { HabitDashboard } = load(path.join(root, "src/components/HabitDashboard.tsx"));
const { TaskDashboard } = load(path.join(root, "src/components/TaskDashboard.tsx"));
const domain = load(path.resolve(root, "../mobile-tasks/src/domain/habits.ts"));
const today = "2026-10-21";
const habit = (id, complete = false, settings = {}) => ({ id, name: id, color: "purple", createdAt: "2026-10-01T00:00:00Z", targetDays: 70,
  completedDates: complete ? [today] : [], entries: {}, settings: domain.normalizeHabitSettings(settings) });
const api = habits => ({ habits, loading: false, error: "", retry() {}, updateDay() { return Promise.resolve(); } });
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test("Windows challenge label and meter retain active-day progress after missed days", () => {
  const value = { ...habit("READ"), completedDates: ["2026-10-01", "2026-10-03"], targetDays: 5 };
  assert.equal(domain.habitStats(value, today).streak, 0);
  const markup = render(HabitDashboard, { api: api([value]), selected: today, today, dueOnly: false });
  assert.match(markup, /2\/5 days/);
  assert.match(markup, /width:40%/);
});

test("Windows habits show heatmaps, streaks and challenge progress; Due hides completed habits", () => {
  const props = { api: api([habit("READ"), habit("WALK", true)]), selected: today, today, dueOnly: false };
  const all = render(HabitDashboard, props);
  assert.match(all, /READ heatmap/);
  assert.match(all, /WALK heatmap/);
  assert.match(all, /0\/70 days/);
  const due = render(HabitDashboard, { ...props, dueOnly: true });
  assert.match(due, /READ heatmap/);
  assert.doesNotMatch(due, /WALK heatmap/);
});
test("old dates are read-only, while yesterday remains editable", () => {
  const props = { api: api([habit("READ")]), today, dueOnly: false };
  assert.match(render(HabitDashboard, { ...props, selected: "2026-10-19" }), /disabled=""/);
  assert.doesNotMatch(render(HabitDashboard, { ...props, selected: "2026-10-20" }), /disabled=""/);
});
test("habit filters and meter use scheduled habits and fractional progress", () => {
  const half = habit("PAGES", false, { tracking: "count", dailyGoal: 10 });
  half.entries[today] = { count: 5, checks: [], note: "" };
  const markup = render(TaskDashboard, { habits: [half, habit("DONE", true)], mode: "habits", tasks: [], today, selectedDate: today,
    dueOnly: true, points: new Map(), onSelectDate() {}, onFilterChange() {}, onNew() {}, onComplete() {}, onReopen() {}, onEdit() {}, onDelete() {} });
  assert.match(markup, /Habit Score/);
  assert.match(markup, /All \(2\)/);
  assert.match(markup, /Due \(1\)/);
  assert.match(markup, /75%/);
  assert.doesNotMatch(markup, /task-list-compact/);
});


const { AndroidTasksWidget } = load(path.join(root, "src/components/AndroidTasksWidget.tsx"));
const androidTask = (id, date = today, completed = false) => ({ id, name: id, subject: "MATHS", type: "Lecture", date,
  createdAt: "2026-10-21T08:00:00Z", completed, completedAt: null, minutesSpent: completed ? 30 : null });
const androidProps = { tasks: [androidTask("FIRST", today, true), androidTask("SECOND")], today, selectedDate: today, dueOnly: false,
  rank: 1, medals: ["gold.png", "silver.png", "bronze.png"], points: new Map([["FIRST", 13]]), onSelectDate() {}, onFilterChange() {}, onNew() {}, onComplete() {}, onReopen() {} };
test("Windows Tasks widget retains seven dates, meter, time, points and stable order", () => {
  const html = render(AndroidTasksWidget, androidProps);
  // The current content panel does not render its own medal/rank.
  assert.doesNotMatch(html, /gold.png/);
  assert.match(html, /aria-label="Add task"/);
  assert.equal((html.match(/aria-label="2026-/g) ?? []).length, 7);
  assert.match(html, /All \(2\)/);
  assert.match(html, /Due \(1\)/);
  assert.match(html, /50%/);
  assert.match(html, /30m/);
  assert.match(html, /\+13 pts/);
  assert.ok(html.indexOf("FIRST") < html.indexOf("SECOND"));
});
test("Android-style Due filter retains full-day meter and selected history is read-only", () => {
  const html = render(AndroidTasksWidget, { ...androidProps, dueOnly: true });
  assert.doesNotMatch(html, /FIRST/);
  assert.match(html, /SECOND/);
  assert.match(html, /50%/);
  const old = render(AndroidTasksWidget, { ...androidProps, selectedDate: "2026-10-20", tasks: [androidTask("OLD", "2026-10-20")] });
  assert.match(old, /aria-disabled="true"/);
  assert.match(old, /Missed: OLD/);
  assert.match(old, /class="android-task-row missed"/);
});
