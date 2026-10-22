import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../mobile-tasks/src/domain/leaderboard-period.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const outputText = compiled.outputText.replaceAll('"../../../shared/focus-rewards"', JSON.stringify(new URL('../shared/focus-rewards.ts', import.meta.url).href));
const {
  leaderboardPeriodStats: stats,
  leaderboardPeriodTasks: visible,
  ALL_LEADERBOARD_DAYS: all,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const entry = { points: -20, completed: 2, studyMinutes: 90, inactiveDates: ["2026-10-14"] };
const tasks = [
  { name: "Maths", date: "2026-10-13", completed: true, minutesSpent: 60, points: 16 },
  { name: "English", date: "2026-10-13", completed: false, minutesSpent: 50, points: -5 },
  { name: "Revision", date: "2026-10-14", completed: false, points: -5 },
  { name: "Science", date: "2026-10-15", completed: true, minutesSpent: 30, points: 24 },
];

test("All week uses the published weekly totals", () => {
  assert.deepEqual(stats(entry, tasks, all), { points: -20, completed: 2, notCompleted: 2, studyMinutes: 90, focusMilliseconds: 0, focusPoints: 0 });
  assert.equal(visible(tasks, entry.inactiveDates, all).length, 5);
});

test("selecting a day filters every metric, including pending penalties", () => {
  assert.deepEqual(stats(entry, tasks, "2026-10-13"), {
    points: 11,
    completed: 1,
    notCompleted: 1,
    studyMinutes: 60,
    focusMilliseconds: 0, focusPoints: 0,
  });
  assert.deepEqual(stats(entry, tasks, "2026-10-15"), {
    points: 24,
    completed: 1,
    notCompleted: 0,
    studyMinutes: 30,
    focusMilliseconds: 0, focusPoints: 0,
  });
  assert.equal(visible(tasks, entry.inactiveDates, "2026-10-13").length, 2);
});

test("inactive-day penalties apply exactly once and stay visible", () => {
  assert.deepEqual(stats(entry, tasks, "2026-10-14"), {
    points: -55,
    completed: 0,
    notCompleted: 1,
    studyMinutes: 0,
    focusMilliseconds: 0, focusPoints: 0,
  });
  const rows = visible(tasks, [...entry.inactiveDates, ...entry.inactiveDates], "2026-10-14");
  assert.equal(rows.length, 2);
  assert.equal(
    rows.reduce((total, task) => total + task.points, 0),
    -55,
  );
});

test("an empty date does not fall back to weekly totals", () => {
  assert.deepEqual(stats(entry, tasks, "2026-10-18"), { points: 0, completed: 0, notCompleted: 0, studyMinutes: 0, focusMilliseconds: 0, focusPoints: 0 });
  assert.deepEqual(visible(tasks, entry.inactiveDates, "2026-10-18"), []);
});

test("inactivity penalties are not counted as incomplete tasks", () => {
  assert.equal(stats(entry, [], "2026-10-14").notCompleted, 0);
  assert.equal(stats(entry, [], all).notCompleted, 0);
});

test("daily focus is also listed as one task-style row without changing completed task counts", () => {
  const focusDays = { "2026-10-13": 3600000, "2026-10-14": 900000 };
  const focused = { ...entry, points: entry.points + 7, focusDays };
  const day = stats(focused, tasks, "2026-10-13");
  assert.equal(day.points, 17);
  assert.equal(day.focusPoints, 6);
  assert.equal(day.completed, 1);
  assert.equal(day.focusMilliseconds, 3600000);
  assert.equal(stats(focused, tasks, all).focusPoints, 7);
  const rows = visible(tasks, entry.inactiveDates, "2026-10-13", focusDays);
  assert.equal(rows.length, 3);
  assert.equal(rows.reduce((sum, row) => sum + row.points, 0), day.points);
  const focus = rows.find(row => row.focus);
  assert.equal(focus.name, "Focus time");
  assert.equal(focus.minutesSpent, 60);
  assert.equal(focus.points, 6);
  assert.equal(visible(tasks, entry.inactiveDates, "2026-10-15", focusDays).some(row => row.focus), false);
});
