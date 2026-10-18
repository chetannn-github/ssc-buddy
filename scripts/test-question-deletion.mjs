import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const domainUrl = url(compile(await readFile(new URL("../mobile-tasks/src/domain/question-deletion.ts", import.meta.url), "utf8")));
const { removeBankQuestion, mergeQuestionDeletions, pruneDeletedRecall, isQuestionAttempt, snapshotQuestionPaper } = await import(domainUrl);
const examSource = compile(await readFile(new URL("../src/lib/exam.ts", import.meta.url), "utf8"))
  .replace("../../mobile-tasks/src/domain/question-deletion", domainUrl);
const exam = await import(url(examSource));
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };

const question = (id, correctAnswer = "A") => ({ id, question: `Question ${id}`, options: ["a", "b", "c", "d"], correctAnswer, explanation: "Saved explanation" });
const bank = () => ({ id: "subject", name: "Maths", chapters: [{ id: "chapter", name: "Arithmetic", exercises: [{ id: "exercise", name: "Set 1", questions: [question("q1"), question("q2", "B"), question("q3", "C")], questionCount: 3, answerKey: ["A", "B", "C"] }] }] });
const exercise = (subject) => subject.chapters[0].exercises[0];

test("middle deletion updates the bank/key/count, preserves survivor IDs, and does not mutate input", () => {
  const original = bank();
  const next = removeBankQuestion(original, "exercise", "q2");
  assert.deepEqual(exercise(next).questions.map((q) => q.id), ["q1", "q3"]);
  assert.deepEqual(exercise(next).answerKey, ["A", "C"]);
  assert.deepEqual(exercise(next).questions.map((q) => q.number), [1, 2]);
  assert.equal(exercise(next).questionCount, 2);
  assert.equal(exercise(original).questions.length, 3);
  assert.equal(removeBankQuestion(next, "exercise", "missing"), next);
});

test("deleting the last question keeps an empty question exercise, not a book exercise", () => {
  let next = bank();
  for (const id of ["q1", "q2", "q3"]) next = removeBankQuestion(next, "exercise", id);
  assert.deepEqual(exercise(next).questions, []);
  assert.deepEqual(exercise(next).answerKey, []);
  assert.equal(exercise(next).questionCount, 0);
  assert.equal(next.chapters[0].exercises.length, 1);
});

test("stale uploads and concurrent deletions cannot resurrect deleted questions", () => {
  const stale = bank();
  const remote = removeBankQuestion(bank(), "exercise", "q1");
  const local = removeBankQuestion(bank(), "exercise", "q2");
  const merged = mergeQuestionDeletions(local, remote);
  assert.deepEqual(exercise(merged).questions.map((q) => q.id), ["q3"]);
  assert.deepEqual(exercise(mergeQuestionDeletions(stale, merged)).questions.map((q) => q.id), ["q3"]);
});

test("deletion is scoped to the exercise even when imported question IDs repeat", () => {
  const subject = bank();
  subject.chapters[0].exercises.push({ ...exercise(bank()), id: "other" });
  const next = removeBankQuestion(subject, "exercise", "q1");
  assert.equal(next.chapters[0].exercises[1].questions.length, 3);
});

test("recall keeps answered questions but drops deleted unanswered ones without counting them", () => {
  const subject = removeBankQuestion(removeBankQuestion(bank(), "exercise", "q1"), "exercise", "q2");
  const questions = ["q1", "q2", "q3"].map((id) => ({ id, exerciseId: "exercise", subjectId: "subject" }));
  assert.deepEqual(pruneDeletedRecall(questions, 1, [subject]).map((q) => q.id), ["q1", "q3"]);
  assert.deepEqual(pruneDeletedRecall(questions, 0, [subject]).map((q) => q.id), ["q3"]);
  assert.deepEqual(pruneDeletedRecall(questions, 3, [subject]), questions);
});

test("bank deletion leaves historical questions, answers, scores and favourites of other questions intact", () => {
  storage.clear();
  exam.saveSubjects([bank()]);
  const snapshot = question("q2", "B");
  const attempt = { id: "attempt", date: "2026-10-18", subjectId: "subject", subject: "Maths", chapterId: "chapter", chapter: "Arithmetic", exerciseId: "exercise", exercise: "Set 1", startNumber: 2, answers: ["B"], questionIds: ["q2"], questions: [snapshot], answerKey: ["B"], marking: { positive: 4, negative: 1 }, correct: 1, wrong: 0, score: 4, timeTakenSeconds: 12, durationMinutes: 1 };
  exam.saveRecord(attempt);
  const before = JSON.stringify(exam.getRecord("attempt"));
  exam.saveFavoriteQuestionIds(["q1", "q2"]);
  const next = exam.deleteBankQuestion("subject", "exercise", "q2");
  assert.equal(exercise(next[0]).questionCount, 2);
  assert.deepEqual(exam.loadFavoriteQuestionIds(), ["q1"]);
  assert.equal(JSON.stringify(exam.getRecord("attempt")), before);
  assert.equal(exam.reevaluateRecord(exam.getRecord("attempt")).score, 4);
  assert.equal(isQuestionAttempt(attempt), true);
  assert.equal(isQuestionAttempt({ answerKey: ["A"] }), false);
});

test("fixed attempts with different question papers are not grouped as the same test", () => {
  const base = { subject: "Maths", chapter: "Arithmetic", exercise: "Set 1", startNumber: 1, answers: [null], questionIds: ["q1"] };
  assert.notEqual(exam.attemptKey(base), exam.attemptKey({ ...base, questionIds: ["q2"] }));
  assert.equal(exam.attemptKey(base), exam.attemptKey({ ...base }));
});

test("selected random/range papers and early submissions save only the matching immutable questions", () => {
  const source = [question("q1"), question("q2", "B"), question("q3", "C")];
  const selected = [source[2], source[0]];
  const frozen = snapshotQuestionPaper(selected, 1);
  source[2].options[0] = "Edited later";
  source[2].correctAnswer = "D";
  assert.deepEqual(frozen.map((q) => q.id), ["q3"]);
  assert.equal(frozen[0].options[0], "a");
  assert.equal(frozen[0].correctAnswer, "C");
});

// Exercise the actual native recall state machine with an asynchronous storage
// adapter: a cloud deletion and answer can arrive in the same JS turn.
globalThis.__recallStorage = new Map();
const asyncStorageUrl = url(`export default {
  getItem: async (key) => globalThis.__recallStorage.get(key) ?? null,
  setItem: async (key, value) => { await new Promise(resolve => setTimeout(resolve, 2)); globalThis.__recallStorage.set(key, value); }
};`);
const firebaseUrl = url("export const getFirebaseAuth = () => ({ currentUser: null }); export const loadQuickRecallSeed = async () => null;");
const selectionUrl = url(compile(await readFile(new URL("../mobile-tasks/src/domain/recall-selection.ts", import.meta.url), "utf8")));
const unlockSource = compile(await readFile(new URL("../mobile-tasks/src/domain/unlock-quiz.ts", import.meta.url), "utf8"))
  .replace("@react-native-async-storage/async-storage", asyncStorageUrl)
  .replace("../lib/firebase", firebaseUrl)
  .replace("./recall-selection", selectionUrl)
  .replace("./question-deletion", domainUrl);
const unlock = await import(url(unlockSource));
const stateKey = "ssc-buddy:unlock-quiz:v1";
const initialRecall = () => ({ runId: "run", startedAt: "2026-10-18", status: "active", subject: "Maths", questions: ["q1", "q2", "q3"].map((id) => ({ ...question(id), subjectId: "subject", exerciseId: "exercise" })), index: 0, correct: 0, answers: [], stats: {} });

test("a simultaneous delete never overwrites an already-accepted recall answer", async () => {
  globalThis.__recallStorage.clear();
  globalThis.__recallStorage.set(stateKey, JSON.stringify(initialRecall()));
  const deleted = removeBankQuestion(removeBankQuestion(bank(), "exercise", "q1"), "exercise", "q2");
  await Promise.all([unlock.answerUnlockQuiz("A", "q1"), unlock.pruneUnlockQuiz([deleted])]);
  const saved = await unlock.loadUnlockQuiz();
  assert.equal(saved.correct, 1);
  assert.deepEqual(saved.answers, ["A"]);
  assert.deepEqual(saved.questions.map((q) => q.id), ["q1", "q3"]);
});

test("a tap on a question deleted just before the answer is ignored rather than applied to its replacement", async () => {
  globalThis.__recallStorage.clear();
  globalThis.__recallStorage.set(stateKey, JSON.stringify(initialRecall()));
  const deleted = removeBankQuestion(bank(), "exercise", "q1");
  await Promise.all([unlock.pruneUnlockQuiz([deleted]), unlock.answerUnlockQuiz("A", "q1")]);
  const saved = await unlock.loadUnlockQuiz();
  assert.equal(saved.questions[0].id, "q2");
  assert.equal(saved.correct, 0);
  assert.deepEqual(saved.answers, []);
  assert.deepEqual(saved.stats, {});
});
