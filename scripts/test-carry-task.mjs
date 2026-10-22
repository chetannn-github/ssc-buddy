import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../shared/carry-task.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { copyPastTask } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const task = Object.freeze({ id: "original", name: "Study Polity", subject: "Polity", type: "Lecture", date: "2026-10-20", createdAt: "2026-10-20T08:00:00Z", completed: false, completedAt: null, minutesSpent: null });

test("adding a missed task keeps its history and creates an incomplete copy with a new identity", () => {
  for (const date of ["2026-10-22", "2026-10-23"]) {
    const next = copyPastTask(task, date, "2026-10-22", "new-id", "2026-10-22T10:00:00Z");
    assert.deepEqual(next, { ...task, id: "new-id", date, createdAt: "2026-10-22T10:00:00Z" });
    assert.equal(task.date, "2026-10-20");
    assert.equal(task.id, "original");
    assert.equal(next.completed, false);
    assert.equal(next.completedAt, null);
    assert.equal(next.minutesSpent, null);
  }
});
test("completed tasks and tasks scheduled today or later cannot be carried", () => {
  for (const invalid of [{ ...task, completed: true }, { ...task, date: "2026-10-22" }, { ...task, date: "2026-10-23" }]) {
    assert.throws(() => copyPastTask(invalid, "2026-10-22", "2026-10-22", "new", "now"));
  }
});
test("tomorrow follows the local calendar across month and year boundaries", () => {
  for (const [today, tomorrow] of [["2026-10-31", "2026-11-01"], ["2026-12-31", "2027-01-01"], ["2028-02-28", "2028-02-29"]]) {
    assert.equal(copyPastTask(task, tomorrow, today, "new", "now").date, tomorrow);
  }
});
test("other destinations are rejected and a stale incomplete task loses recorded completion values", () => {
  assert.throws(() => copyPastTask(task, "2026-10-24", "2026-10-22", "new", "now"));
  const next = copyPastTask({ ...task, completedAt: "stale", minutesSpent: 30 }, "2026-10-22", "2026-10-22", "new", "now");
  assert.equal(next.completedAt, null);
  assert.equal(next.minutesSpent, null);
});
