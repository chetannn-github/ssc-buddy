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
const solutionsSource = await readFile(
  new URL("../mobile-tasks/src/domain/quick-recall-solutions.ts", import.meta.url),
  "utf8",
);
const solutionsCode = ts.transpileModule(solutionsSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { appendRecallQuestionSnapshots, resolveRecallQuestions } = await import(
  `data:text/javascript;base64,${Buffer.from(solutionsCode).toString("base64")}`
);
const fullQuestion = (id, text = `Question ${id}`) => ({
  id,
  question: text,
  options: ["One", "Two", "Three", "Four"],
  correctAnswer: "B",
  explanation: "Because two is correct.",
});
const subjectBank = (questions) => [{ chapters: [{ exercises: [{ questions }] }] }];

test("Quick Recall snapshots preserve text, options and explanation after bank edits/deletion", () => {
  const original = fullQuestion("q1");
  const quickRecallQuestions = appendRecallQuestionSnapshots({}, [original]);
  original.options[0] = "Edited";
  const record = { answers: ["A"], questionIds: ["q1"], quickRecallQuestions };
  assert.equal(
    resolveRecallQuestions(record, subjectBank([fullQuestion("q1", "Changed text")]))[0].question,
    "Question q1",
  );
  assert.equal(resolveRecallQuestions(record, [])[0].options[0], "One");
  assert.equal(resolveRecallQuestions(record, [])[0].explanation, "Because two is correct.");
});

test("new snapshots stay aligned when a daily record already contains legacy answers", () => {
  const old = { answers: ["A", "B"], questionIds: ["old", "missing"] };
  const saved = appendRecallQuestionSnapshots(old, [fullQuestion("new")]);
  const record = {
    answers: [...old.answers, "C"],
    questionIds: [...old.questionIds, "new"],
    quickRecallQuestions: saved,
  };
  const resolved = resolveRecallQuestions(record, subjectBank([fullQuestion("old")]));
  assert.equal(resolved[0].id, "old");
  assert.equal(resolved[1], undefined);
  assert.equal(resolved[2].id, "new");
  const next = appendRecallQuestionSnapshots(record, [fullQuestion("new")]);
  assert.equal(next["2"].id, "new");
  assert.equal(next["3"].id, "new");
  assert.deepEqual(Object.keys(saved), ["2"]);
});

test("legacy recovery avoids guessing when an imported ID belongs to multiple questions", () => {
  const record = { answers: ["A"], questionIds: ["repeated"] };
  assert.equal(
    resolveRecallQuestions(
      record,
      subjectBank([fullQuestion("repeated"), fullQuestion("repeated", "Other exercise")]),
    )[0],
    undefined,
  );
});
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

test("3, 5 and 10 question sessions select distinct questions from one subject", () => {
  const questions = [...Array.from({ length: 12 }, (_, index) => question(String(index))),
    ...Array.from({ length: 12 }, (_, index) => question(String(index), "english"))];
  for (const count of [3, 5, 10]) {
    const result = select(questions, new Set(), {}, new Map(), now, () => 0.5, count);
    assert.equal(result.length, count);
    assert.equal(new Set(result.map((item) => item.subjectId)).size, 1);
    assert.equal(new Set(result.map((item) => item.id)).size, count);
  }
});
test("larger recall requests cap at available questions without duplicates", () => {
  assert.equal(select(bank, new Set(), {}, new Map(), now, () => 0.5, 10).length, 6);
  assert.equal(select(bank, new Set(), {}, new Map(), now, () => 0.5).length, 3);
});

// Exercise the Windows adapter as well as the shared selector: the chosen count
// must survive question-bank parsing and exercise filtering.
const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const deletionSource = await readFile(new URL("../mobile-tasks/src/domain/question-deletion.ts", import.meta.url), "utf8");
const deletionUrl = moduleUrl(ts.transpileModule(deletionSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText);
const desktopSource = await readFile(new URL("../desktop-widget/src/lib/quick-recall.ts", import.meta.url), "utf8");
const desktopCode = ts.transpileModule(desktopSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
  .replace("../../../mobile-tasks/src/domain/question-deletion", deletionUrl)
  .replace("../../../mobile-tasks/src/domain/recall-selection", moduleUrl(outputText));
const { createQuickRecallSession } = await import(moduleUrl(desktopCode));
const desktopSeed = (count = 12) => ({
  subjects: [{ id: "maths", name: "Maths", chapters: [{ name: "Algebra", exercises: [
    { id: "first", name: "First", questions: Array.from({ length: count }, (_, i) => fullQuestion(`q${i}`)) },
    { id: "second", name: "Second", questions: [fullQuestion("other")] },
  ] }] }],
  attempts: [], favouriteQuestionIds: [], learningStats: {},
});
const desktopScope = { subjectId: "maths", chapter: "Algebra", exerciseId: "first" };
for (const count of [3, 5, 10]) {
  test(`Windows Quick Recall selects ${count} unique questions from the selected exercise`, () => {
    const session = createQuickRecallSession(desktopSeed(), desktopScope, count);
    assert.equal(session.questions.length, count);
    assert.equal(new Set(session.questions.map((q) => q.id)).size, count);
    assert.ok(session.questions.every((q) => q.exerciseId === "first"));
  });
}
test("Windows Quick Recall caps the selected count for small banks and handles empty scopes", () => {
  assert.equal(createQuickRecallSession(desktopSeed(2), desktopScope, 10).questions.length, 2);
  assert.equal(createQuickRecallSession(desktopSeed(), { ...desktopScope, exerciseId: "missing" }, 5), null);
  assert.equal(createQuickRecallSession(desktopSeed()).questions.length, 3);
});
