import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map(),
  saved = new Map(),
  properties = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    Date,
    Event,
    localStorage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: (key) => saved.delete(key),
    },
    window: { dispatchEvent() {} },
    document: {
      documentElement: { style: { setProperty: (key, value) => properties.set(key, value) } },
    },
    require: (name) => {
      assert.ok(name.startsWith("."));
      return load(path.resolve(path.dirname(filename), name + ".ts"));
    },
  });
  return exports;
}
const workspace = load(path.join(root, "src/lib/daily-workspace.ts"));
const profile = load(path.join(root, "src/lib/profile.ts"));
const accent = load(path.join(root, "src/lib/app-accent.ts"));
const { normalizeHabitSettings } = load(path.join(root, "mobile-tasks/src/domain/habits.ts"));
const today = "2026-10-21";
const task = (id, completed, date = today) => ({
  id,
  date,
  completed,
  minutesSpent: completed ? 30 : null,
});
test("task completion preserves row order and Due keeps the full-day meter", () => {
  const tasks = [
    task("first", true),
    task("second", false),
    task("last", false),
    task("tomorrow", false, "2026-10-22"),
  ];
  const all = workspace.workspaceSummary(tasks, [], today, "tasks");
  assert.deepEqual(
    Array.from(all.visibleTasks, (item) => item.id),
    ["first", "second", "last"],
  );
  const due = workspace.workspaceSummary(tasks, [], today, "tasks", true);
  assert.deepEqual(
    Array.from(due.visibleTasks, (item) => item.id),
    ["second", "last"],
  );
  assert.equal(due.total, 3);
  assert.equal(due.percent, 33);
  assert.equal(due.studyMinutes, 30);
  tasks[1].completed = true;
  assert.deepEqual(
    Array.from(
      workspace.workspaceSummary(tasks, [], today, "tasks").visibleTasks,
      (item) => item.id,
    ),
    ["first", "second", "last"],
  );
});
test("habit score uses the selected date and partial count progress, excluding unscheduled habits", () => {
  const habit = (id, settings, dates = [], entries = {}) => ({
    id,
    name: id,
    createdAt: "2026-01-01T00:00:00Z",
    targetDays: null,
    completedDates: dates,
    entries,
    settings: normalizeHabitSettings(settings),
  });
  const habits = [
    habit("tick", {}, [today]),
    habit("count", { tracking: "count", dailyGoal: 8 }, [], {
      [today]: { count: 4, checks: [], note: "" },
    }),
    habit("sunday", { frequency: "weekdays", weekdays: [0] }),
  ];
  const result = workspace.workspaceSummary([], habits, today, "habits");
  assert.equal(result.total, 3);
  assert.equal(result.due, 1);
  assert.equal(result.percent, 75);
  assert.equal(workspace.workspaceSummary([], [], today, "habits").percent, 0);
});
test("14-day desktop dates remain continuous across month and year boundaries", () => {
  const dates = workspace.workspaceDates("2027-01-03");
  assert.equal(dates.length, 14);
  assert.equal(dates[0], "2026-12-21");
  assert.equal(dates.at(-1), "2027-01-03");
  assert.equal(dates.slice(-7)[0], "2026-12-28");
});
test("all app accents persist on web alongside section settings, with safe defaults", () => {
  for (const option of accent.APP_ACCENTS) {
    profile.savePracticeProfile({
      name: "Chetan",
      username: "chetan",
      questionGoal: 100,
      accentColor: option.color,
      habitsEnabled: false,
    });
    const loaded = profile.loadPracticeProfile();
    assert.equal(loaded.accentColor, option.color);
    assert.equal(loaded.habitsEnabled, false);
    assert.equal(loaded.username, "chetan");
    accent.applyWebAccent(option.color);
    assert.equal(properties.get("--app-accent"), option.color);
    assert.equal(properties.get("--app-accent-ink"), accent.accentInk(option.color));
  }
  profile.savePracticeProfile({ name: "Student", questionGoal: 100 });
  assert.equal(profile.loadPracticeProfile().accentColor, "#ffe000");
  profile.clearPracticeProfile();
  assert.equal(profile.loadPracticeProfile(), null);
});
