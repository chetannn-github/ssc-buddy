import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../mobile-tasks/src/domain/practice-exercises.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const {
  combineQuestionExercises: combine,
  samplePracticeQuestions: sample,
  ALL_PRACTICE_EXERCISES,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const q = (id, correctAnswer = "A") => ({
  id,
  correctAnswer,
  number: 1,
  question: `Question ${id}`,
});

test("all question exercises combine while answer-key-only exercises contribute nothing", () => {
  const exercises = [
    { id: "e1", questions: [q("a"), q("b", "B")] },
    { id: "key-only", answerKey: ["D"], questionCount: 1 },
    { id: "e2", questions: [q("c", "C")] },
  ];
  const original = JSON.stringify(exercises);
  const combined = combine(exercises);
  assert.equal(combined.id, ALL_PRACTICE_EXERCISES);
  assert.equal(combined.name, "All exercises");
  assert.equal(combined.questionCount, 3);
  assert.deepEqual(
    combined.questions.map((question) => question.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    combined.questions.map((question) => question.number),
    [1, 2, 3],
  );
  assert.deepEqual(combined.answerKey, ["A", "B", "C"]);
  assert.equal(JSON.stringify(exercises), original);
});

test("count-only papers can draw from later exercises and preserve question/answer identity", () => {
  const combined = combine([
    { questions: [q("first", "A")] },
    { questions: [q("second", "B"), q("third", "C")] },
  ]);
  const selected = sample(combined.questions, 2, () => 0);
  assert.deepEqual(
    selected.map((question) => question.id),
    ["second", "third"],
  );
  assert.deepEqual(
    selected.map((question) => question.correctAnswer),
    ["B", "C"],
  );
  assert.equal(new Set(selected.map((question) => question.id)).size, 2);
  assert.deepEqual(
    combined.questions.map((question) => question.id),
    ["first", "second", "third"],
  );
});

test("empty sources and counts at the bank/session limits are handled", () => {
  assert.equal(combine([]), null);
  assert.equal(combine([{ answerKey: ["A"] }, { questions: [] }]), null);
  assert.deepEqual(sample([], 10), []);
  assert.equal(sample([q("one")], 20).length, 1);
  assert.equal(
    sample(
      Array.from({ length: 700 }, (_, index) => q(String(index))),
      900,
    ).length,
    500,
  );
  assert.equal(sample([q("one"), q("two")], Number.NaN).length, 1);
});
