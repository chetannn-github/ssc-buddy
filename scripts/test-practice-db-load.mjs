import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const root = fileURLToPath(new URL('..', import.meta.url));
const compile = code => ts.transpileModule(code.replaceAll('import.meta.env', 'testEnv'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture() {
  const db = {}, records = new Map(), modules = new Map(), observers = new Set(), listeners = [];
  const calls = { queries: [], docs: [], writes: [], transactions: 0, transactionReads: 0, stops: 0 };
  const local = { subjects: [], history: [], favourites: [], marking: { positive: 4, negative: 1 } };
  let gate, failQueries = false, failTransaction = false, failSet = false;
  const merge = (before, next) => {
    if (!next || typeof next !== 'object' || Array.isArray(next) || !Object.keys(next).length) return structuredClone(next);
    const combined = before && typeof before === 'object' && !Array.isArray(before) ? { ...before } : {};
    for (const [key, value] of Object.entries(next)) combined[key] = merge(combined[key], value);
    return combined;
  };
  const write = (ref, value, options) => {
    if (failSet) throw Error('write failed');
    calls.writes.push(ref.path); records.set(ref.path, options?.merge ? merge(records.get(ref.path), value) : structuredClone(value));
  };
  const snapshot = (id, value) => ({ id, exists: () => value !== undefined, data: () => structuredClone(value) });
  const result = ref => ref.kind === 'doc' ? snapshot(ref.path.split('/').at(-1), records.get(ref.path)) : {
    docs: [...records].filter(([key]) => key.startsWith(ref.path + '/') && key.split('/').length === ref.path.split('/').length + 1)
      .sort(([a], [b]) => a.localeCompare(b)).slice(0, ref.limit ?? Infinity).map(([key, value]) => snapshot(key.split('/').at(-1), value)),
    get size() { return this.docs.length; },
  };
  const firestore = {
    getFirestore: () => db, initializeFirestore: () => db, persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    collection: (_db, ...parts) => ({ kind: 'collection', path: parts.join('/') }),
    doc: (base, ...parts) => ({ kind: 'doc', path: base.path ? base.path + '/' + parts.join('/') : parts.join('/') }),
    query: (ref, limit) => ({ ...ref, limit }), limit: value => value,
    getDocs: async ref => { calls.queries.push(ref); if (gate) await gate.promise; if (failQueries) throw Error('offline'); return result(ref); },
    getDoc: async ref => { calls.docs.push(ref); if (gate) await gate.promise; return result(ref); },
    setDoc: async (ref, value, options) => write(ref, value, options),
    deleteDoc: async ref => { calls.writes.push(ref.path); records.delete(ref.path); },
    writeBatch: () => { const items = []; return { set: (ref, value) => items.push([ref, value]), commit: async () => { for (const [ref, value] of items) await firestore.setDoc(ref, value); } }; },
    onSnapshot: (ref, options, next, error) => {
      if (typeof options === 'function') { error = next; next = options; }
      const listener = { ref, next, error, active: true }; listeners.push(listener);
      return () => { if (listener.active) calls.stops++; listener.active = false; };
    },
    serverTimestamp: () => 'server timestamp',
    runTransaction: async (_db, work) => {
      calls.transactions++;
      if (failTransaction) throw Error('transaction failed');
      return work({ get: async ref => { calls.transactionReads++; if (gate) await gate.promise; return result(ref); }, set: write });
    },
  };
  const save = key => value => { local[key] = value; for (const observer of observers) observer(key === 'history' ? 'cbt-history' : key === 'subjects' ? 'cbt-subjects' : key === 'favourites' ? 'cbt-favorite-questions' : 'cbt-marking'); };
  const exam = { loadSubjects: () => local.subjects, loadHistory: () => local.history, loadFavoriteQuestionIds: () => local.favourites, loadMarking: () => local.marking,
    saveSubjects: save('subjects'), saveHistory: save('history'), saveFavoriteQuestionIds: save('favourites'), saveMarking: save('marking'),
    onPracticePersist: observer => { observers.add(observer); return () => observers.delete(observer); } };
  const config = new Proxy({}, { get: () => 'configured' });
  const require = (name, filename) => {
    if (name === 'firebase/firestore') return firestore;
    if (name === 'firebase/app') return { initializeApp: () => ({}), getApps: () => [], getApp: () => ({}) };
    if (name === 'firebase/auth') return { getAuth: () => ({ currentUser: { uid: 'u' } }), initializeAuth: () => ({}) };
    if (name === '@react-native-async-storage/async-storage') return { default: {}, __esModule: true };
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === '@/lib/exam') return exam;
    if (name === '@/lib/firebase-sync') return load('src/lib/firebase-sync.ts');
    assert.ok(name.startsWith('.'), `Unexpected dependency ${name}`);
    const base = path.resolve(path.dirname(filename), name), resolved = [base, base + '.ts', base + '.tsx'].find(existsSync);
    assert.ok(resolved, `Missing ${name}`); return load(resolved);
  };
  function load(relative) {
    const filename = path.isAbsolute(relative) ? relative : path.join(root, relative);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {}; modules.set(filename, exports);
    vm.runInNewContext(compile(readFileSync(filename, 'utf8')), { exports, console, Date, queueMicrotask, process: { env: config }, testEnv: config, require: name => require(name, filename) });
    return exports;
  }
  const fill = (uid = 'u') => {
    records.set(`users/${uid}/practiceSubjects/s`, { id: 's', name: 'Subject', chapters: [] });
    records.set(`users/${uid}/practiceAttempts/a`, { id: 'a', answers: ['A'] });
    records.set(`users/${uid}/practiceFavourites/q`, { id: 'q' });
    records.set(`users/${uid}/practiceSettings/current`, { marking: { positive: 1, negative: 0.25 } });
    records.set(`users/${uid}/questionLearning/current`, { stats: {} });
  };
  return { calls, local, records, listeners, load, fill, emit() { for (const listener of listeners.filter(item => item.active)) listener.next(result(listener.ref)); },
    set gate(value) { gate = value; }, set failQueries(value) { failQueries = value; }, set failTransaction(value) { failTransaction = value; }, set failSet(value) { failSet = value; } };
}

test('web startup: empty local collections skip migration reads; settings is one document read', async () => {
  const f = fixture(); f.fill(); const stop = await f.load('src/lib/practice-sync.ts').startPracticeSync({ uid: 'u' }, { includeSubjects: true });
  assert.equal(f.calls.queries.length, 3); assert.equal(f.calls.docs.length, 1); assert.equal(f.listeners.length, 4); assert.equal(f.calls.writes.length, 0);
  assert.equal(f.local.marking.positive, 1); assert.equal(f.local.history.length, 1); stop(); assert.equal(f.calls.stops, 4);
});

test('web migration checks at most one document and leaves existing remote collections untouched', async () => {
  const f = fixture(); f.fill(); f.local.subjects = [{ id: 's', name: 'Local', chapters: [] }]; f.local.history = [{ id: 'a' }]; f.local.favourites = ['q'];
  const stop = await f.load('src/lib/practice-sync.ts').startPracticeSync({ uid: 'u' }, { includeSubjects: true });
  assert.equal(f.calls.queries.filter(ref => ref.limit === 1).length, 3); assert.equal(f.calls.writes.length, 0); stop();
});

test('web empty remote data migrates local subjects/history/favourites and marking', async () => {
  const f = fixture(); f.local.subjects = [{ id: 's', name: 'Local', chapters: [] }]; f.local.history = [{ id: 'a', answers: ['A'] }]; f.local.favourites = ['q'];
  const stop = await f.load('src/lib/practice-sync.ts').startPracticeSync({ uid: 'u' }, { includeSubjects: true });
  assert.equal(f.calls.writes.length, 4); assert.equal(f.records.get('users/u/practiceAttempts/a').answers[0], 'A'); stop();
});

test('web global practice and Quick Recall reuse collection listeners, keep live updates and do not echo writes', async () => {
  const f = fixture(); f.fill(); const stopMain = await f.load('src/lib/practice-sync.ts').startPracticeSync({ uid: 'u' }, { includeSubjects: true });
  let seed;
  const stopRecall = f.load('src/lib/firebase-sync.ts').watchQuickRecallSeed({ uid: 'u' }, value => { seed = value; });
  assert.equal(f.listeners.length, 5); // 3 shared collections, settings and learning.
  f.emit(); await flush(); assert.equal(seed.subjects.length, 1);
  f.records.set('users/u/practiceSubjects/s', { id: 's', name: 'Updated', chapters: [] }); f.emit(); await flush();
  assert.equal(seed.subjects[0].name, 'Updated'); assert.equal(f.calls.writes.length, 0);
  stopRecall(); assert.equal(f.listeners.filter(item => item.active).length, 4); stopMain(); assert.equal(f.listeners.filter(item => item.active).length, 0);
});

test('Android practice migration skips empty arrays, bounds checks and preserves first migration', async () => {
  const f = fixture(), api = f.load('mobile-tasks/src/lib/firebase.ts');
  await api.migratePracticeEntities({ uid: 'u' }, 'practiceAttempts', []); assert.equal(f.calls.queries.length, 0);
  await api.migratePracticeEntities({ uid: 'u' }, 'practiceAttempts', [{ id: 'a' }, { id: 'b' }]);
  assert.equal(f.calls.queries[0].limit, 1); assert.equal(f.calls.writes.length, 2);
  await api.migratePracticeEntities({ uid: 'u' }, 'practiceAttempts', [{ id: 'replacement' }]); assert.equal(f.calls.writes.length, 2);
});

test('Android root/screen share attempts listener and release only the final subscriber', () => {
  const f = fixture(); f.fill(); const api = f.load('mobile-tasks/src/lib/firebase.ts'); let a, b;
  const first = api.watchPracticeEntities({ uid: 'u' }, 'practiceAttempts', value => { a = value; });
  const second = api.watchPracticeEntities({ uid: 'u' }, 'practiceAttempts', value => { b = value; });
  assert.equal(f.listeners.length, 1); f.emit(); assert.equal(a[0].id, 'a'); assert.equal(b[0].id, 'a');
  first(); assert.equal(f.calls.stops, 0); second(); assert.equal(f.calls.stops, 1);
  const other = api.watchPracticeEntities({ uid: 'other' }, 'practiceAttempts', () => {}); assert.equal(f.listeners.length, 2); other();
});

test('shared practice listener recovers on remount after error and ignores old callbacks', () => {
  const f = fixture(); f.fill(); const api = f.load('mobile-tasks/src/lib/firebase.ts'); let value;
  const first = api.watchPracticeEntities({ uid: 'u' }, 'practiceAttempts', next => { value = next; });
  f.emit(); f.listeners[0].error();
  const second = api.watchPracticeEntities({ uid: 'u' }, 'practiceAttempts', next => { value = next; });
  assert.equal(f.listeners.length, 2); assert.equal(f.listeners[0].active, false);
  f.emit(); assert.equal(value.length, 1); f.listeners[0].next({ docs: [] }); assert.equal(value.length, 1);
  first(); second();
});

for (const [platform, file] of [['web', 'src/lib/firebase-sync.ts'], ['Android', 'mobile-tasks/src/lib/firebase.ts'], ['Windows', 'desktop-widget/src/lib/firebase.ts']]) {
  test(`${platform} concurrent seed fetches share work; account and later refresh remain fresh`, async () => {
    const f = fixture(); f.fill(); f.fill('other'); const gate = deferred(); f.gate = gate;
    const api = f.load(file), first = api.loadQuickRecallSeed({ uid: 'u' }), duplicate = api.loadQuickRecallSeed({ uid: 'u' }), other = api.loadQuickRecallSeed({ uid: 'other' });
    await flush(); assert.equal(f.calls.queries.length, 6); assert.equal(f.calls.docs.length, 2);
    gate.resolve(); await Promise.all([first, duplicate, other]);
    f.gate = undefined; f.records.set('users/u/practiceSubjects/s', { id: 's', name: 'Fresh', chapters: [] });
    const fresh = await api.loadQuickRecallSeed({ uid: 'u' }); assert.equal(fresh.subjects[0].name, 'Fresh'); assert.equal(f.calls.queries.length, 9);
  });
  test(`${platform} failed seed load is retried, not cached as success`, async () => {
    const f = fixture(); f.fill(); const api = f.load(file); f.failQueries = true;
    await assert.rejects(api.loadQuickRecallSeed({ uid: 'u' }), /offline/); f.failQueries = false;
    const seed = await api.loadQuickRecallSeed({ uid: 'u' }); assert.equal(seed.subjects.length, 1); assert.equal(f.calls.queries.length, 6);
  });
}

for (const [platform, file] of [['web', 'src/lib/firebase-sync.ts'], ['Android', 'mobile-tasks/src/lib/firebase.ts']]) {
  test(`${platform} failed learning transaction is retried without losing its intended update`, async () => {
    const f = fixture(), api = f.load(file);
    const payload = { stats: { q: { askedCount: 1, correctCount: 1, wrongCount: 0, lastAskedAt: '2026-10-24', lastOutcome: 'correct' } } };
    f.failTransaction = true; await assert.rejects(api.writeQuestionLearning({ uid: 'u' }, payload), /transaction failed/);
    assert.equal(f.calls.writes.length, 0); f.failTransaction = false;
    await api.writeQuestionLearning({ uid: 'u' }, payload);
    assert.equal(f.records.get('users/u/questionLearning/current').stats.q.askedCount, 1); assert.equal(f.calls.writes.length, 1);
  });
  test(`${platform} learning transaction skips identical merged data and retains newer remote counters`, async () => {
    const f = fixture(), api = f.load(file), ref = 'users/u/questionLearning/current';
    const stat = { askedCount: 3, correctCount: 2, wrongCount: 1, lastAskedAt: '2026-10-24T12:00:00Z', lastOutcome: 'correct' };
    f.records.set(ref, { stats: { q: stat }, lastSubject: 'Maths', preserved: 'keep', updatedAt: 'old' });
    await api.writeQuestionLearning({ uid: 'u' }, { stats: { q: { ...stat } }, lastSubject: 'Maths' }); assert.equal(f.calls.writes.length, 0);
    await api.writeQuestionLearning({ uid: 'u' }, { stats: { q: { ...stat, askedCount: 1, lastAskedAt: '2020-01-01' } } }); assert.equal(f.calls.writes.length, 0);
    await api.writeQuestionLearning({ uid: 'u' }, { stats: { q: { ...stat, askedCount: 4 } } });
    assert.equal(f.calls.writes.length, 1); assert.equal(f.records.get(ref).stats.q.askedCount, 4); assert.equal(f.records.get(ref).preserved, 'keep');
  });
}

for (const [platform, file] of [['web', 'src/lib/firebase-sync.ts'], ['Android', 'mobile-tasks/src/lib/firebase.ts']]) {
  const profile = { username: 'student', name: 'Student', questionGoal: 100, avatar: 'avatar', trackProgressEnabled: true };
  const activity = { '2026-10-24': 1 };
  const dashboard = () => ({ records: [{ id: 'attempt', score: 10, answers: ['A', null] }], dailyTasks: [], tracker: { activity: [] } });

  test(`${platform} repeated public snapshot reads fresh server data but skips unchanged writes`, async () => {
    const f = fixture(), api = f.load(file);
    f.records.set('publicProfiles/student', { uid: 'u', focusDays: { '2026-10-24': 60000 }, focusTimeZone: 'Asia/Kolkata', legacy: 'retained' });
    await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard());
    const saved = f.records.get('publicProfiles/student'); saved.updatedAt = 'external timestamp';
    await api.savePublicProfileActivity({ uid: 'u' }, { ...profile }, { ...activity }, dashboard());
    assert.equal(f.calls.transactionReads, 2); assert.equal(f.calls.writes.length, 1);
    assert.equal(f.records.get('publicProfiles/student').updatedAt, 'external timestamp');
    assert.equal(saved.focusDays['2026-10-24'], 60000); assert.equal(saved.legacy, 'retained');
  });

  test(`${platform} changed result/name/settings publishes and preserves unrelated focus data`, async () => {
    const f = fixture(), api = f.load(file);
    await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard());
    f.records.get('publicProfiles/student').focusDays = { '2026-10-24': 60000 };
    const next = dashboard(); next.records[0].score = 20;
    await api.savePublicProfileActivity({ uid: 'u' }, { ...profile, name: 'Renamed', trackProgressEnabled: false }, { '2026-10-24': 2 }, next);
    assert.equal(f.calls.writes.length, 2); const saved = f.records.get('publicProfiles/student');
    assert.equal(saved.dashboard.records[0].score, 20); assert.equal(saved.name, 'Renamed'); assert.equal(saved.trackProgressEnabled, false);
    assert.equal(saved.focusDays['2026-10-24'], 60000);
  });

  test(`${platform} another client's changed public snapshot is not hidden by a successful local cache`, async () => {
    const f = fixture(), api = f.load(file);
    await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard());
    f.records.get('publicProfiles/student').dashboard.records[0].score = 999;
    await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard());
    assert.equal(f.calls.writes.length, 2); assert.equal(f.records.get('publicProfiles/student').dashboard.records[0].score, 10);
  });

  test(`${platform} merge comparison tolerates retained map fields but replaces empty maps/arrays`, async () => {
    const f = fixture(), api = f.load(file);
    await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard());
    f.records.get('publicProfiles/student').dashboard.tracker.legacy = 'keep';
    await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard()); assert.equal(f.calls.writes.length, 1);
    const next = dashboard(); next.records = []; next.tracker = {};
    await api.savePublicProfileActivity({ uid: 'u' }, profile, {}, next);
    const saved = f.records.get('publicProfiles/student'); assert.equal(f.calls.writes.length, 2);
    assert.deepEqual(saved.activity, {}); assert.deepEqual(saved.dashboard.records, []); assert.deepEqual(saved.dashboard.tracker, {});
    await api.savePublicProfileActivity({ uid: 'u' }, profile, {}, next); assert.equal(f.calls.writes.length, 2);
  });

  test(`${platform} identical concurrent publications share one read/write and accounts/usernames stay isolated`, async () => {
    const f = fixture(), api = f.load(file);
    await Promise.all([api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard()), api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard())]);
    assert.equal(f.calls.transactionReads, 1); assert.equal(f.calls.writes.length, 1);
    await api.savePublicProfileActivity({ uid: 'other' }, { ...profile, username: 'other' }, activity, dashboard());
    await api.savePublicProfileActivity({ uid: 'u' }, { ...profile, username: 'renamed' }, activity, dashboard());
    assert.equal(f.records.get('publicProfiles/other').uid, 'other'); assert.equal(f.records.get('publicProfiles/renamed').uid, 'u');
    assert.equal(f.calls.writes.length, 3);
  });

  test(`${platform} transaction failure retains setDoc delivery and next call verifies the server again`, async () => {
    const f = fixture(), api = f.load(file); f.failTransaction = true;
    await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard()); assert.equal(f.calls.writes.length, 1);
    f.failTransaction = false; await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard());
    assert.equal(f.calls.writes.length, 1); assert.equal(f.calls.transactionReads, 1);
  });

  test(`${platform} rapid public A -> B -> A publications retain order instead of collapsing the final A`, async () => {
    const f = fixture(), api = f.load(file), gate = deferred(); f.gate = gate;
    const a = dashboard(), b = dashboard(); b.records[0].score = 20;
    const first = api.savePublicProfileActivity({ uid: 'u' }, profile, activity, a);
    await flush();
    const second = api.savePublicProfileActivity({ uid: 'u' }, profile, activity, b);
    const last = api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard());
    gate.resolve(); await Promise.all([first, second, last]);
    assert.equal(f.calls.writes.length, 3); assert.equal(f.records.get('publicProfiles/student').dashboard.records[0].score, 10);
  });

  test(`${platform} failed transaction and fallback do not suppress a subsequent retry`, async () => {
    const f = fixture(), api = f.load(file); f.failTransaction = true; f.failSet = true;
    await assert.rejects(api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard()), /write failed/);
    assert.equal(f.calls.writes.length, 0); f.failTransaction = false; f.failSet = false;
    await api.savePublicProfileActivity({ uid: 'u' }, profile, activity, dashboard()); assert.equal(f.calls.writes.length, 1);
  });

  test(`${platform} missing/invalid public username still performs no database operation`, async () => {
    const f = fixture(), api = f.load(file);
    await api.savePublicProfileActivity({ uid: 'u' }, { ...profile, username: '' }, activity, dashboard());
    assert.equal(f.calls.transactions, 0); assert.equal(f.calls.writes.length, 0);
  });
}

// Execute the actual PracticeScreen initialization effect without mounting its
// visual tree, controlling the async windows that previously escaped cleanup.
const screenSource = readFileSync(path.join(root, 'mobile-tasks/src/screens/PracticeScreen.tsx'), 'utf8');
const ast = ts.createSourceFile('screen.tsx', screenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let init;
const visit = node => {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('migratePracticeEntities')) init = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}; visit(ast); assert.ok(init);
function lifecycle(stage) {
  const gate = deferred(); let watched = 0, stopped = 0, patched = 0;
  const api = {};
  vm.runInNewContext(compile(`exports.start = ${init};`), {
    exports: api, user: { uid: 'u' }, practiceLoaded: true, bankRef: { current: { subjects: [], marking: { positive: 4, negative: 1 } } }, historyRef: { current: [] }, favouritesRef: { current: [] },
    toCloudSubjects: value => value, toCloudRecord: value => value,
    migratePracticeEntities: async () => { if (stage === 'migration') await gate.promise; },
    readPracticeSettings: async () => { if (stage === 'settings') await gate.promise; return stage === 'patch' ? {} : { marking: { positive: 4, negative: 1 } }; },
    patchPracticeSettings: async () => { patched++; if (stage === 'patch') await gate.promise; },
    watchPracticeEntities: () => { watched++; return () => stopped++; }, watchPracticeSettings: () => { watched++; return () => stopped++; },
  });
  return { start: api.start, gate, get watched() { return watched; }, get stopped() { return stopped; }, get patched() { return patched; } };
}
for (const stage of ['migration', 'settings', 'patch']) test(`Android unmount during ${stage} cannot attach late listeners`, async () => {
  const f = lifecycle(stage); const cleanup = f.start(); await flush(); cleanup(); f.gate.resolve(); await flush(); assert.equal(f.watched, 0);
});
test('Android normal practice initialization keeps all four live subscriptions and cleans them up', async () => {
  const f = lifecycle('normal'); const cleanup = f.start(); await flush(); assert.equal(f.watched, 4); cleanup(); assert.equal(f.stopped, 4);
});
