import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const tasks = await read("../mobile-tasks/src/domain/tasks.ts");
const model = (await read("../mobile-tasks/src/domain/daily-task-widget.ts")).replace(/^import .*;$/gm, "");
const storage = (await read("../mobile-tasks/src/widgets/daily-task-widget-store.ts")).replace(/^import .*;$/gm, "");
const compiled = ts.transpileModule(`const saved = new Map();
const AsyncStorage = { getItem: async key => saved.get(key), setItem: async (key, value) => saved.set(key, value), removeItem: async key => saved.delete(key) };
${tasks}
${model}
${storage}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const today = "2026-10-20";
const task = (id, date = today, completed = false) => ({ id, date, completed, name: id, subject: "MATHS", type: "Lecture", minutesSpent: completed ? 30 : null });
test("widget keeps app task order when completion changes", () => {
  const tasks = [task("first", today, true), task("second")];
  assert.deepEqual(api.dailyTaskWidgetModel(tasks, {}, today).visibleTasks.map(t => t.id), ["first", "second"]);
  tasks[1].completed = true;
  assert.deepEqual(api.dailyTaskWidgetModel(tasks, {}, today).visibleTasks.map(t => t.id), ["first", "second"]);
});
test("Due filters rows without changing the full-day meter or study time", () => {
  const result = api.dailyTaskWidgetModel([task("done", today, true), task("pending")], { dueOnly: true }, today);
  assert.deepEqual(result.visibleTasks.map(t => t.id), ["pending"]);
  assert.equal(result.summary.percent, 50);
  assert.equal(result.summary.minutes, 30);
});
test("tomorrow appears only when a tomorrow task exists and history is read-only", () => {
  const tasks = [task("old", "2026-10-19"), task("next", "2026-10-21")];
  assert.equal(api.dailyTaskWidgetModel(tasks, {}, today).dates.at(-1), "2026-10-21");
  const result = api.dailyTaskWidgetModel(tasks, { date: "2026-10-19" }, today);
  assert.equal(result.readOnly, true);
  assert.equal(result.visibleTasks[0].id, "old");
  assert.equal(api.dailyTaskWidgetModel([], {}, today).dates.at(-1), today);
});
test("missing old selections safely return to today", () => {
  assert.equal(api.dailyTaskWidgetModel([], { date: "invalid" }, today).selected, today);
  assert.equal(api.dailyTaskWidgetModel([], { date: "2026-09-01" }, today).selected, today);
});
test("each widget keeps its own filter without leaking another account's preferences", async () => {
  await api.saveDailyTaskWidgetOptions(1, "user-a", { dueOnly: true, date: today });
  assert.equal((await api.loadDailyTaskWidgetOptions(1, "user-a")).dueOnly, true);
  assert.deepEqual(await api.loadDailyTaskWidgetOptions(1, "user-b"), {});
  assert.deepEqual(await api.loadDailyTaskWidgetOptions(2, "user-a"), {});
  await api.removeDailyTaskWidgetOptions(1);
  assert.deepEqual(await api.loadDailyTaskWidgetOptions(1, "user-a"), {});
});
test("stale widget actions cannot complete a pending task or reopen a previous day", () => {
  assert.equal(api.canReopenDailyWidgetTask(task("done", today, true), today), true);
  assert.equal(api.canReopenDailyWidgetTask(task("pending"), today), false);
  assert.equal(api.canReopenDailyWidgetTask(task("old", "2026-10-19", true), today), false);
});

test("tomorrow tasks stay read-only and completion changes only apply to today's tasks", () => {
  const future = task("future", "2026-10-21");
  assert.equal(api.dailyTaskWidgetModel([future], { date: "2026-10-21" }, today).readOnly, true);
  assert.equal(api.canChangeTaskCompletion(future, today), false);
  assert.equal(api.canChangeTaskCompletion({ ...future, completed: true }, today), false);
  assert.equal(api.canChangeTaskCompletion(task("past", "2026-10-19"), today), false);
  assert.equal(api.canChangeTaskCompletion(task("current"), today), true);
  assert.equal(api.canChangeTaskCompletion({ date: undefined }, today), false);
});
