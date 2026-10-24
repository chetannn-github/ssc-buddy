// Before/after diagnostics: no Firebase account, network or production data.
// Run with Node from a checkout with the project's dependencies installed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
let ts;
try { ts = createRequire(import.meta.url)('typescript'); }
catch { ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript'); }
const root = fileURLToPath(new URL('..', import.meta.url));
const source = file => {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
};
const named = (file, name) => {
  const ast = source(file); let found;
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(found, `Missing function ${name}`);
  return (ts.isVariableDeclaration(found) ? 'const ' : '') + found.getText(ast) + `;exports.${name}=${name};`;
};
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

let queries = 0, reads = 0, clock = 0, renders = 0;
const countdownApi = {};
const state = { status: 'correction', lockedUntil: 10000, runId: 'run', startedAt: 'now', answers: [], questions: [] };
const countdown = {
  exports: countdownApi, Date: { now: () => clock }, wait: async ms => { clock += ms; },
  getFirebaseAuth: () => ({ currentUser: { uid: 'user' } }), getFirebaseFirestore: () => ({}),
  practiceCollection: (_user, name) => name, questionLearningDoc: () => ({}),
  getDocs: async () => { queries++; return { docs: [] }; },
  getDoc: async () => { reads++; return { data: () => ({ stats: {} }) }; },
  loadUnlockQuiz: async () => state, AsyncStorage: { getItem: async () => null }, SUBJECTS: 'subjects',
  pruneUnlockQuiz: async () => state, releaseUnlockQuizReview: async () => ({ ...state, status: 'ready' }),
  renderQuickRecallWidget: value => value,
};
vm.createContext(countdown);
vm.runInContext(compile(
  named('mobile-tasks/src/lib/firebase.ts', 'loadQuickRecallSeed') +
  named('mobile-tasks/src/domain/unlock-quiz.ts', 'getUnlockQuiz') +
  named('mobile-tasks/index.js', 'refreshRecallCountdown'),
), countdown);
await countdownApi.refreshRecallCountdown(state, () => renders++);
assert.equal(queries, 0); assert.equal(reads, 0); assert.equal(renders, 10);
console.log(JSON.stringify({ scenario: '10-second correction countdown, instant mocked network', before: { collectionQueryCalls: 27, learningDocumentReads: 9 }, after: { collectionQueryCalls: queries, learningDocumentReads: reads }, renders }));

let startupQueries = 0, startupDocs = 0, listeners = 0, writes = 0;
const snapshot = { size: 1, docs: [{ id: 'current', data: () => ({ id: 'current', name: 'Subject', chapters: [], marking: { positive: 4, negative: 1 } }) }] };
const liveSource = {}, practiceSource = {};
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'mobile-tasks/src/domain/shared-live-source.ts'), 'utf8')), { exports: liveSource });
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'mobile-tasks/src/domain/practice-live-source.ts'), 'utf8')), { exports: practiceSource, require: () => liveSource });
const imports = {
  '../../mobile-tasks/src/domain/practice-live-source': practiceSource,
  '../../mobile-tasks/src/domain/question-deletion': { mergeQuestionDeletions: value => value },
  'firebase/firestore': {
    collection: () => ({}), doc: () => ({}), getDocs: async () => { startupQueries++; return snapshot; },
    getDoc: async () => { startupDocs++; return { exists: () => true, data: () => ({ marking: { positive: 4, negative: 1 } }) }; },
    onSnapshot: () => { listeners++; return () => {}; }, setDoc: async () => { writes++; },
  },
  '@/lib/firebase-sync': { getFirebaseFirestore: () => ({}) },
  '@/lib/exam': {
    loadSubjects: () => [], loadHistory: () => [], loadFavoriteQuestionIds: () => [], loadMarking: () => ({ positive: 4, negative: 1 }),
    saveSubjects() {}, saveHistory() {}, saveFavoriteQuestionIds() {}, saveMarking() {}, onPracticePersist: () => () => {},
  },
};
const web = {};
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/practice-sync.ts'), 'utf8')), {
  exports: web, queueMicrotask, require: name => { assert.ok(name in imports, `Unexpected dependency ${name}`); return imports[name]; },
});
const stop = await web.startPracticeSync({ uid: 'user' }, { includeSubjects: true }); stop();
assert.equal(startupQueries, 3); assert.equal(startupDocs, 1); assert.equal(listeners, 4); assert.equal(writes, 0);
console.log(JSON.stringify({ scenario: 'web startup, existing remote data and empty local collections', before: { collectionQueryCalls: 8 }, after: { collectionQueryCalls: startupQueries, settingsDocumentReads: startupDocs }, listenerRegistrations: listeners, writes }));
