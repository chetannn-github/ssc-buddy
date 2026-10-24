import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const root = fileURLToPath(new URL('..', import.meta.url));
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture() {
  const storage = new Map(), modules = new Map(), rendered = [];
  let handler, clock = Date.UTC(2026, 9, 24, 12), seedReads = 0, learningWrites = 0, attemptWrites = 0, offline = false, onTick;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const question = id => ({ id, subjectId: 's', subject: 'Maths', chapter: 'C', exerciseId: 'e', exercise: 'E', question: id, options: ['a', 'b', 'c', 'd'], correctAnswer: 'B' });
  const bank = [{ id: 's', name: 'Maths', chapters: [{ name: 'C', exercises: [{ id: 'e', name: 'E', questions: [question('q1'), question('q2')] }] }] }];
  const quiz = { runId: 'run', startedAt: new Clock().toISOString(), status: 'active', subject: 'Maths', questions: [question('q1'), question('q2')], index: 0, correct: 0, answers: [], stats: {} };
  storage.set('ssc-buddy:unlock-quiz:v1', JSON.stringify(quiz)); storage.set('cbt-subjects', JSON.stringify(bank));
  const asyncStorage = { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } };
  const firebase = {
    getFirebaseAuth: () => ({ currentUser: { uid: 'u' } }),
    loadQuickRecallSeed: async () => { seedReads++; if (offline) throw Error('offline'); return { subjects: structuredClone(bank), attempts: [], favourites: [], stats: {} }; },
    writeQuestionLearning: async () => { learningWrites++; }, recordQuickRecallPractice: async () => { attemptWrites++; },
  };
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const exports = {}; modules.set(filename, exports);
    vm.runInNewContext(compile(readFileSync(filename, 'utf8')), { exports, Date: Clock, require: name => {
      if (name === '@react-native-async-storage/async-storage') return { default: asyncStorage, __esModule: true };
      if (name === '../lib/firebase') return firebase;
      const base = path.resolve(path.dirname(filename), name); return load([base + '.ts', base + '.tsx'].find(existsSync));
    } });
    return exports;
  }
  const domain = load(path.join(root, 'mobile-tasks/src/domain/unlock-quiz.ts'));
  const unused = new Proxy({}, { get: () => () => undefined });
  const imports = {
    expo: { registerRootComponent() {} }, 'expo-constants': { default: { appOwnership: 'standalone' }, __esModule: true },
    'react-native': { AppRegistry: { registerComponent() {} }, Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': { default: asyncStorage },
    'react-native-android-widget': { registerWidgetConfigurationScreen() {}, registerWidgetTaskHandler: callback => { handler = callback; } },
    './src/domain/unlock-quiz': domain, './src/lib/firebase': firebase,
    './src/widgets/QuickRecallWidget': { renderQuickRecallWidget: value => structuredClone(value) },
  };
  vm.runInNewContext(compile(readFileSync(path.join(root, 'mobile-tasks/index.js'), 'utf8')), {
    exports: {}, Date: Clock, require: name => imports[name] ?? unused,
    setTimeout: (callback, ms) => { clock += ms; onTick?.(clock); queueMicrotask(callback); return 1; }, clearTimeout() {},
  });
  const event = (widgetAction = 'WIDGET_UPDATE', clickAction, clickActionData) => handler({ widgetInfo: { widgetName: 'QuickRecallWidget', widgetId: 1 }, widgetAction, clickAction, clickActionData, renderWidget: value => { rendered.push({ value, at: clock }); } });
  return { event, rendered, storage, bank, quiz, domain,
    set offline(value) { offline = value; }, set onTick(value) { onTick = value; },
    get seedReads() { return seedReads; }, get learningWrites() { return learningWrites; }, get attemptWrites() { return attemptWrites; },
  };
}

test('actual widget refresh fetches once, resize once, and deletion never fetches or renders', async () => {
  const f = fixture(); await f.event(); assert.equal(f.seedReads, 1); assert.equal(f.rendered.length, 1);
  await f.event('WIDGET_RESIZED'); assert.equal(f.seedReads, 2);
  await f.event('WIDGET_DELETED'); assert.equal(f.seedReads, 2); assert.equal(f.rendered.length, 2);
});

test('actual wrong-answer countdown keeps ten-second lock and manual Next with no per-tick cloud reads', async () => {
  const f = fixture(); await f.event('WIDGET_CLICK', 'QUIZ_ANSWER_A');
  assert.equal(f.seedReads, 1); assert.equal(f.rendered.length, 11);
  const [first, last] = [f.rendered[0], f.rendered.at(-1)];
  assert.equal(first.value.status, 'correction'); assert.equal(last.value.status, 'review');
  assert.equal(last.at - first.at, 10000); assert.equal(last.value.index, 0);
  assert.equal(f.learningWrites, 1); assert.equal(f.attemptWrites, 1);
  await f.event('WIDGET_CLICK', 'QUIZ_NEXT');
  assert.equal(f.seedReads, 2); assert.equal(f.rendered.at(-1).value.index, 1); assert.equal(f.rendered.at(-1).value.status, 'active');
});

test('correct answer renders review immediately and does not start correction timer', async () => {
  const f = fixture(); await f.event('WIDGET_CLICK', 'QUIZ_ANSWER_B');
  assert.equal(f.seedReads, 1); assert.equal(f.rendered.length, 1); assert.equal(f.rendered[0].value.status, 'review');
  assert.equal(f.rendered[0].value.correct, 1);
});

test('deleted future question during countdown is pruned before Next displays it', async () => {
  const f = fixture(); f.onTick = () => { f.bank[0].deletedQuestionIds = [JSON.stringify(['e', 'q2'])]; };
  await f.event('WIDGET_CLICK', 'QUIZ_ANSWER_A'); assert.equal(f.seedReads, 1);
  await f.event('WIDGET_CLICK', 'QUIZ_NEXT');
  assert.equal(f.seedReads, 2); assert.equal(f.rendered.at(-1).value.status, 'complete');
  assert.equal(f.rendered.at(-1).value.questions.some(question => question.id === 'q2'), false);
});

test('offline correction still reaches review from the saved local quiz', async () => {
  const f = fixture(); f.offline = true; await f.event('WIDGET_CLICK', 'QUIZ_ANSWER_A');
  assert.equal(f.rendered.at(-1).value.status, 'review'); assert.equal(f.seedReads, 1);
});

test('an old countdown cannot redraw a new sprint over the current widget', async () => {
  const f = fixture(); f.onTick = () => { f.storage.set('ssc-buddy:unlock-quiz:v1', JSON.stringify({ ...f.quiz, runId: 'new-run' })); };
  await f.event('WIDGET_CLICK', 'QUIZ_ANSWER_A');
  assert.equal(f.rendered.length, 1); assert.equal(JSON.parse(f.storage.get('ssc-buddy:unlock-quiz:v1')).runId, 'new-run');
});

test('new sprint performs only its own fresh seed load', async () => {
  const f = fixture(); await f.event('WIDGET_CLICK', 'QUIZ_NEW_SESSION');
  assert.equal(f.seedReads, 1); assert.notEqual(f.rendered.at(-1).value.runId, 'run');
});
