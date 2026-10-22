import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../mobile-tasks/src/domain/weekly-results.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replaceAll('"../../../shared/focus-rewards"', JSON.stringify(new URL('../shared/focus-rewards.ts', import.meta.url).href))
  .replaceAll('"./xp-levels"', JSON.stringify(new URL('../mobile-tasks/src/domain/xp-levels.ts', import.meta.url).href));
const { leaderboardWeek, shiftLeaderboardWeek, rankWeeklyEntries, weeklyAward, weeklyAwardSeenKey, validLeaderboardWeek, finalizeWeeklyEntry, resolveWeeklyResults, completedLeaderboardWeeks, countWeeklyMedals } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Sunday to Monday changes the week and retains the previous result key", () => {
  assert.equal(leaderboardWeek(new Date(2026, 9, 18, 23, 59, 59)), "2026-10-12");
  const monday = leaderboardWeek(new Date(2026, 9, 19, 0, 0, 0));
  assert.equal(monday, "2026-10-19");
  assert.equal(shiftLeaderboardWeek(monday, -1), "2026-10-12");
  assert.equal(shiftLeaderboardWeek("2026-10-12", 1), monday);
});

test("week navigation handles year and leap-month boundaries", () => {
  assert.equal(leaderboardWeek(new Date(2027, 0, 1)), "2026-12-28");
  assert.equal(shiftLeaderboardWeek("2027-01-04", -1), "2026-12-28");
  assert.equal(shiftLeaderboardWeek("2024-03-04", -1), "2024-02-26");
  assert.equal(validLeaderboardWeek("2026-02-30"), undefined);
  assert.equal(validLeaderboardWeek("2026-10-18"), undefined);
  assert.equal(validLeaderboardWeek("9999-01-04"), undefined);
  assert.equal(validLeaderboardWeek("2026-10-12"), "2026-10-12");
});

const entries = [
  { uid: "second", points: 120, studyMinutes: 100, completed: 8 },
  { uid: "first", points: 200, studyMinutes: 100, completed: 10 },
  { uid: "third", points: 100, studyMinutes: 100, completed: 6 },
  { uid: "fourth", points: 50, studyMinutes: 10, completed: 2 },
];

test("previous winners get medals independently of an empty new week", () => {
  const monday = new Date(2026, 9, 19);
  assert.deepEqual(weeklyAward(entries, "first", "2026-10-12", monday), { week: "2026-10-12", rank: 1, points: 200 });
  assert.equal(weeklyAward(entries, "second", "2026-10-12", monday).rank, 2);
  assert.equal(weeklyAward(entries, "third", "2026-10-12", monday).rank, 3);
  assert.equal(weeklyAward(entries, "fourth", "2026-10-12", monday), null);
  assert.equal(weeklyAward([], "first", "2026-10-19", monday), null);
  assert.equal(weeklyAward(entries, "first", "2026-10-19", monday), null);
});

test("rank ties resolve identically regardless of snapshot order and input is not mutated", () => {
  const ties = ["b", "a"].map(uid => ({ uid, points: 100, studyMinutes: 80, completed: 5 }));
  assert.deepEqual(rankWeeklyEntries(ties).map(entry => entry.uid), ["a", "b"]);
  assert.deepEqual(rankWeeklyEntries([...ties].reverse()), rankWeeklyEntries(ties));
  assert.deepEqual(ties.map(entry => entry.uid), ["b", "a"]);
});

test("empty participation does not award medals; celebration acknowledgements are account and week scoped", () => {
  assert.equal(weeklyAward([{ uid: "empty", points: 0, completed: 0 }], "empty", "2026-10-12", new Date(2026, 9, 19)), null);
  assert.notEqual(weeklyAwardSeenKey("first", "2026-10-12"), weeklyAwardSeenKey("second", "2026-10-12"));
  assert.notEqual(weeklyAwardSeenKey("first", "2026-10-12"), weeklyAwardSeenKey("first", "2026-10-19"));
});

const sundaySnapshot = (tasks) => ({ uid: "student", points: 10, completed: 1, studyMinutes: 0, overdue: 0, inactiveDays: 0, inactiveDates: [], leaderboardTasks: tasks });
const done = { date: "2026-10-18", completed: true, minutesSpent: 0, points: 10 };
const pending = { date: "2026-10-18", completed: false, minutesSpent: 0, points: 0 };
const monday = new Date(2026, 9, 19);

test("Sunday pending tasks receive -5 when the saved week closes on Monday", () => {
  const saved = sundaySnapshot([done, pending, pending]);
  const result = finalizeWeeklyEntry(saved, "2026-10-12", monday);
  assert.equal(result.points, 0);
  assert.equal(result.overdue, 2);
  assert.equal(result.completed, 1);
  assert.deepEqual(result.leaderboardTasks.map(task => task.points), [10, -5, -5]);
  assert.deepEqual(result.inactiveDates, []);
  assert.equal(saved.leaderboardTasks[1].points, 0);
});

test("fully inactive Sunday gets -50 plus each pending-task penalty, exactly once", () => {
  const saved = sundaySnapshot([pending, pending]);
  const closed = finalizeWeeklyEntry(saved, "2026-10-12", monday);
  assert.equal(closed.points, -60);
  assert.deepEqual(closed.inactiveDates, ["2026-10-18"]);
  assert.equal(closed.inactiveDays, 1);
  assert.deepEqual(finalizeWeeklyEntry(closed, "2026-10-12", monday), closed);
  assert.deepEqual(finalizeWeeklyEntry(closed, "2026-10-12", new Date(2027, 0, 4)), closed);
});

test("Sunday tasks remain unpenalized before midnight and the new week is unchanged", () => {
  const saved = sundaySnapshot([done, pending]);
  assert.equal(finalizeWeeklyEntry(saved, "2026-10-12", new Date(2026, 9, 18, 23, 59, 59)), saved);
  const newWeek = sundaySnapshot([{ ...pending, date: "2026-10-19" }]);
  assert.equal(finalizeWeeklyEntry(newWeek, "2026-10-19", monday), newWeek);
});

test("week-end correction preserves the time bonus cap and cannot include next week's tasks", () => {
  const saved = sundaySnapshot([{ ...done, minutesSpent: 3000 }, { ...pending, date: "2026-10-19" }]);
  const result = finalizeWeeklyEntry(saved, "2026-10-12", monday);
  assert.equal(result.points, 220);
  assert.equal(result.studyMinutes, 3000);
  assert.equal(result.leaderboardTasks.length, 1);
  assert.equal(result.overdue, 0);
});

test("podium awards and results both use corrected Sunday scores", () => {
  const staleWinner = { ...sundaySnapshot([done, pending]), uid: "old-first", points: 100 };
  const winner = { ...sundaySnapshot([{ ...done, minutesSpent: 20 }]), uid: "actual-first", points: 12 };
  assert.deepEqual(resolveWeeklyResults([staleWinner, winner], "2026-10-12", monday).map(entry => entry.uid), ["actual-first", "old-first"]);
  assert.deepEqual(weeklyAward([staleWinner, winner], "actual-first", "2026-10-12", monday), { rank: 1, week: "2026-10-12", points: 12 });
});

test("legacy results without task snapshots retain recorded totals", () => {
  assert.equal(finalizeWeeklyEntry(entries[0], "2026-10-12", monday), entries[0]);
});

test("medal totals count each completed week's podium only once", () => {
  const awards = [
    { week: "2026-09-21", rank: 1, points: 100 },
    { week: "2026-09-28", rank: 2, points: 90 },
    { week: "2026-10-05", rank: 1, points: 110 },
    { week: "2026-10-12", rank: 3, points: 80 },
    { week: "2026-10-12", rank: 3, points: 80 }, null,
  ];
  assert.deepEqual(countWeeklyMedals(awards), { gold: 2, silver: 1, bronze: 1 });
  assert.deepEqual(countWeeklyMedals([]), { gold: 0, silver: 0, bronze: 0 });
});

test("medal history includes intervening weeks and excludes the live week", () => {
  assert.deepEqual(completedLeaderboardWeeks(["2026-10-02", "2026-10-19"], "2026-10-19"), ["2026-09-28", "2026-10-05", "2026-10-12"]);
  assert.deepEqual(completedLeaderboardWeeks([], "2026-10-19"), ["2026-10-12"]);
  assert.deepEqual(completedLeaderboardWeeks(["invalid", "2026-10-25"], "2026-10-19"), ["2026-10-12"]);
});

test("focus rewards improve rank and XP once, including after re-ranking and week closure", () => {
  const focus = { uid: "focus", week: "2026-10-12", points: 10, xp: 495, completed: 1, studyMinutes: 0, focusXp: 6, focusDays: { "2026-10-18": 3600000 }, leaderboardTasks: [done] };
  const rival = { uid: "rival", points: 14, completed: 1 };
  const ranked = resolveWeeklyResults([rival, focus], "2026-10-12", monday);
  assert.equal(ranked[0].uid, "focus");
  assert.equal(ranked[0].points, 16);
  assert.equal(ranked[0].xp, 501);
  assert.equal(ranked[0].level, 2);
  assert.deepEqual(resolveWeeklyResults(ranked, "2026-10-12", monday), ranked);
  assert.deepEqual(rankWeeklyEntries(ranked), ranked);
  assert.equal(focus.points, 10, "raw task score is preserved");
  assert.equal(weeklyAward([{ uid: "only-focus", week: "2026-10-12", focusDays: { "2026-10-18": 3600000 } }], "only-focus", "2026-10-12", monday).points, 6);
});