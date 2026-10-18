import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../mobile-tasks/src/domain/recall-selection.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const {
  selectRecallQuestions: select,
  mergeRecallLearning: merge,
  filterRecallScope: filterScope,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const now = Date.parse("2026-10-17T12:00:00Z");
const question = (id, subjectId = "maths") => ({ id, subjectId });
const bank = Array.from({ length: 6 }, (_, index) => question(String(index)));
const stat = (minutesAgo, lastOutcome = "correct", count = 1) => ({
  askedCount: count,
  correctCount: lastOutcome === "correct" ? count : 0,
  wrongCount: lastOutcome === "wrong" ? count : 0,
  lastAskedAt: new Date(now - minutesAgo * 60_000).toISOString(),
  lastOutcome,
});
const pick = (
  questions = bank,
  favourites = new Set(),
  stats = {},
  practice = new Map(),
  at = now,
) => select(questions, favourites, stats, practice, at, () => 0.5);
const ids = (questions) => questions.map((item) => item.id);

test("a chosen exercise stays inside the selected subject and chapter", () => {
  const questions = [
    { ...question("one"), chapter: "Percentage", exerciseId: "e1" },
    { ...question("two"), chapter: "Percentage", exerciseId: "e2" },
    { ...question("three"), chapter: "Ratio", exerciseId: "e1" },
    { ...question("four", "english"), chapter: "Percentage", exerciseId: "e1" },
  ];
  assert.deepEqual(
    ids(filterScope(questions, { subjectId: "maths", chapter: "Percentage", exerciseId: "e1" })),
    ["one"],
  );
  assert.deepEqual(
    filterScope(questions, { subjectId: "maths", chapter: "Percentage", exerciseId: "missing" }),
    [],
  );
});

test("All exercises combines exercises while older scopes remain compatible", () => {
  const questions = [
    { ...question("one"), chapter: "Percentage", exerciseId: "e1" },
    { ...question("two"), chapter: "Percentage", exerciseId: "e2" },
    { ...question("three"), chapter: "Ratio", exerciseId: "e1" },
  ];
  const scope = { subjectId: "maths", chapter: "Percentage" };
  assert.deepEqual(ids(filterScope(questions, { ...scope, exerciseId: "all" })), ["one", "two"]);
  assert.deepEqual(
    filterScope(questions, scope),
    filterScope(questions, { ...scope, exerciseId: "all" }),
  );
  assert.equal(
    filterScope(questions, { subjectId: "random", chapter: "random", exerciseId: "all" }).length,
    3,
  );
});

test("back-to-back rounds rotate away from just-answered favourites", () => {
  const favourites = new Set(["0", "1", "2"]);
  const first = pick(bank, favourites);
  assert.deepEqual(ids(first), ["0", "1", "2"]);
  const stats = Object.fromEntries(first.map((item) => [`maths:${item.id}`, stat(0)]));
  assert.deepEqual(ids(pick(bank, favourites, stats)), ["3", "4", "5"]);
});

test("an all-favourite bank still rotates", () => {
  const favourites = new Set(ids(bank));
  const stats = Object.fromEntries(
    bank.slice(0, 3).map((item) => [`maths:${item.id}`, stat(0, "wrong")]),
  );
  assert.deepEqual(ids(pick(bank, favourites, stats)), ["3", "4", "5"]);
});

test("mastered favourites do not displace fresh non-favourites", () => {
  const stats = Object.fromEntries(
    bank.slice(0, 3).map((item) => [`maths:${item.id}`, stat(60, "correct", 20)]),
  );
  assert.deepEqual(ids(pick(bank, new Set(["0", "1", "2"]), stats)), ["3", "4", "5"]);
});

test("correct answers rest 30 minutes, mistakes rest 5", () => {
  const questions = [question("wrong"), question("correct"), question("a"), question("b")];
  const stats = { "maths:wrong": stat(6, "wrong"), "maths:correct": stat(6) };
  assert.deepEqual(ids(pick(questions, new Set(), stats)), ["wrong", "a", "b"]);
  const recent = { ...stats, "maths:wrong": stat(4, "wrong") };
  assert.deepEqual(ids(pick(questions, new Set(), recent)), ["a", "b", "correct"]);
});

test("tiny banks return distinct questions, reusing oldest cooled answers first", () => {
  const questions = [...bank.slice(0, 3), question("0")];
  const stats = { "maths:0": stat(1), "maths:1": stat(3), "maths:2": stat(2) };
  assert.deepEqual(ids(pick(questions, new Set(["0"]), stats)), ["1", "2", "0"]);
  assert.equal(pick([question("only")]).length, 1);
  assert.deepEqual(pick([]), []);
});

test("random subject selection prefers a ready round over a cooled favourite subject", () => {
  const questions = [
    ...bank.slice(0, 3),
    ...bank.slice(3).map((item) => question(item.id, "english")),
  ];
  const stats = Object.fromEntries(bank.slice(0, 3).map((item) => [`maths:${item.id}`, stat(0)]));
  assert.ok(
    pick(questions, new Set(["0", "1", "2"]), stats).every((item) => item.subjectId === "english"),
  );
});

test("old error totals are bounded, and normal-practice weaknesses still matter", () => {
  const questions = [question("weak"), question("mastered"), question("fresh"), question("fresh2")];
  const practice = new Map([
    ["maths:weak", { askedCount: 2, wrongCount: 2, correctCount: 0 }],
    ["maths:mastered", { askedCount: 10000, wrongCount: 10, correctCount: 9990 }],
  ]);
  assert.deepEqual(ids(pick(questions, new Set(), {}, practice)), ["weak", "fresh", "fresh2"]);
});

test("pending local answers survive stale cloud learning snapshots", () => {
  const local = { "maths:0": stat(0, "correct", 4) };
  const remote = { "maths:0": stat(60, "wrong", 3), "maths:1": stat(10) };
  const merged = merge(remote, local);
  assert.equal(merged["maths:0"].lastAskedAt, local["maths:0"].lastAskedAt);
  assert.equal(merged["maths:0"].lastOutcome, "correct");
  assert.equal(merged["maths:0"].askedCount, 4);
  assert.ok(merged["maths:1"]);
});
