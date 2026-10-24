import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const desktop = compile((await read('../desktop-widget/src/lib/firebase.ts')).replaceAll('import.meta.env.', 'testEnv.'));
const practicePolicy = {};
vm.runInNewContext(compile(await read('../mobile-tasks/src/domain/practice-sync-policy.ts')), { exports: practicePolicy });
const task = (id, extra = {}) => ({ id, name: id, subject: 'Maths', type: 'Learn', createdAt: `2026-10-19T${id === 'a' ? '10' : '11'}:00:00`, date: '2026-10-19', completed: false, completedAt: null, minutesSpent: null, ...extra });

function desktopFixture() {
  const tasks = new Map([['a', new Map()], ['b', new Map()]]);
  const listeners = [];
  const scores = [], views = [];
  let fullReads = 0, profileReads = 0, taskWrites = 0, mode = 'confirmed';
  const snapshot = (uid, metadata = { fromCache: false, hasPendingWrites: false }) => ({
    metadata, docs: [...tasks.get(uid).values()].sort((a, b) => a.id.localeCompare(b.id)).map(value => ({ id: value.id, data: () => structuredClone(value) })),
  });
  const emit = uid => {
    for (const listener of listeners.filter(item => item.uid === uid && item.active)) listener.next(snapshot(uid, { fromCache: mode === 'cache', hasPendingWrites: mode === 'pending' }));
  };
  const firestore = {
    initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    collection: (_db, ...parts) => ({ path: parts.join('/') }), doc: (_db, ...parts) => ({ path: parts.join('/') }),
    getDoc: async () => { profileReads++; return { data: () => ({ username: 'student', name: 'Student' }) }; },
    getDocs: async ref => { fullReads++; return snapshot(ref.path.split('/')[1]); },
    serverTimestamp: () => 'timestamp',
    onSnapshot: (ref, _options, next, error) => {
      const uid = ref.path.split('/')[1], listener = { uid, next, error, active: true }; listeners.push(listener);
      next(snapshot(uid)); return () => { listener.active = false; };
    },
    setDoc: async (ref, value) => {
      const parts = ref.path.split('/');
      if (parts[0] === 'leaderboards') { scores.push(structuredClone(value)); return; }
      taskWrites++; tasks.get(parts[1]).set(parts[3], structuredClone(value));
      if (mode === 'superseded') tasks.get(parts[1]).set(parts[3], { ...value, name: 'Remote edit', minutesSpent: 70 });
      if (mode !== 'no-event') emit(parts[1]);
    },
    deleteDoc: async ref => { const parts = ref.path.split('/'); taskWrites++; tasks.get(parts[1]).delete(parts[3]); if (mode !== 'no-event') emit(parts[1]); },
  };
  const module = { exports: {} };
  vm.runInNewContext(desktop, {
    module, exports: module.exports, console,
    testEnv: new Proxy({}, { get: () => 'configured' }),
    require: name => name.endsWith('/practice-sync-policy') ? practicePolicy : name === 'firebase/firestore' ? firestore : name === 'firebase/app' ? { initializeApp: () => ({}) } : name === 'firebase/auth' ? { getAuth: () => ({}) } : {},
  });
  return {
    api: module.exports, tasks, scores, views, emit,
    watch(uid = 'a') { return module.exports.watchTasks({ uid }, (items, source) => views.push({ items, source })); },
    fail(uid = 'a') { for (const item of listeners.filter(l => l.uid === uid && l.active)) item.error(Error('disconnected')); },
    set mode(value) { mode = value; },
    get fullReads() { return fullReads; }, get profileReads() { return profileReads; }, get taskWrites() { return taskWrites; },
  };
}

test('Windows confirmed listener: create/edit/complete/reopen/delete reuse snapshot with no full read', async () => {
  const f = desktopFixture(); const stop = f.watch(); const user = { uid: 'a' };
  await f.api.saveTask(user, task('a'));
  await f.api.saveTask(user, task('a', { name: 'Edited' }));
  await f.api.saveTask(user, task('a', { completed: true, minutesSpent: 60 }));
  await f.api.saveTask(user, task('a'));
  await f.api.removeTask(user, 'a');
  assert.equal(f.fullReads, 0); assert.equal(f.taskWrites, 5);
  assert.equal(f.scores.length, 5); assert.equal(f.profileReads, 5);
  assert.equal(f.scores[1].leaderboardTasks[0].name, 'Edited');
  assert.equal(f.scores[2].studyMinutes, 60); assert.equal(f.scores[2].completed, 1);
  assert.equal(f.scores[3].completed, 0); assert.equal(f.scores[4].leaderboardTasks.length, 0);
  stop();
});

test('Windows cached and fallback publisher produce identical complete score payloads/query ordering', async () => {
  const cached = desktopFixture(), fallback = desktopFixture();
  for (const f of [cached, fallback]) {
    f.tasks.get('a').set('a', task('a', { completed: true, minutesSpent: 2000 }));
    f.tasks.get('a').set('old', task('old', { date: '2026-10-18', completed: true, minutesSpent: 20 }));
  }
  cached.watch();
  await cached.api.saveTask({ uid: 'a' }, task('b', { completed: true, minutesSpent: 1000 }));
  await fallback.api.saveTask({ uid: 'a' }, task('b', { completed: true, minutesSpent: 1000 }));
  // Current week/day is identical in these runtimes; compare all XP/level,
  // penalties, task bonuses and payload fields, not just the headline score.
  assert.deepEqual(cached.scores, fallback.scores);
  assert.equal(cached.fullReads, 0); assert.equal(fallback.fullReads, 1);
  assert.deepEqual(Array.from(cached.views.at(-1).items, item => item.id), ['b', 'old', 'a']);
});

for (const mode of ['cache', 'pending', 'no-event', 'superseded']) {
  test(`Windows ${mode} snapshot conservatively falls back to the existing server read`, async () => {
    const f = desktopFixture(); f.watch(); f.mode = mode;
    await f.api.saveTask({ uid: 'a' }, task('a'));
    assert.equal(f.fullReads, 1); assert.equal(f.scores.length, 1);
    if (mode === 'superseded') assert.equal(f.scores[0].leaderboardTasks[0].name, 'Remote edit');
  });
}

test('Windows listener stop/error and account isolation cannot reuse another account or dead snapshot', async () => {
  const f = desktopFixture(); const stop = f.watch('a');
  await f.api.saveTask({ uid: 'b' }, task('b')); assert.equal(f.fullReads, 1);
  stop(); await f.api.saveTask({ uid: 'a' }, task('a')); assert.equal(f.fullReads, 2);
  f.watch('a'); f.fail(); f.mode = 'no-event';
  await f.api.saveTask({ uid: 'a' }, task('a', { name: 'After error' })); assert.equal(f.fullReads, 3);
});

test('Windows cached snapshot includes concurrent changes to other tasks', async () => {
  const f = desktopFixture(); f.watch();
  f.tasks.get('a').set('remote', task('remote', { completed: true, minutesSpent: 20 })); f.emit('a');
  await f.api.saveTask({ uid: 'a' }, task('a'));
  assert.equal(f.fullReads, 0);
  assert.ok(f.scores[0].leaderboardTasks.some(item => item.name === 'remote'));
});

for (const [platform, path, tasksName] of [
  ['web', '../src/lib/task-sync.ts', 'collectionFor'],
  ['Android', '../mobile-tasks/src/lib/firebase.ts', 'taskCollection'],
]) {
  const source = await read(path), ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'migrateTasksIfEmpty');
  const code = compile(declaration.getText(ast));
  const setup = remoteExists => {
    const counts = { reads: 0, sets: 0, commits: 0 }; let queryLimit;
    const exports = {};
    const context = { exports, [tasksName]: () => 'tasks', getFirebaseFirestore: () => ({}),
      query: (collection, limit) => { queryLimit = limit; return { collection, limit }; }, limit: value => value,
      getDocs: async ref => { counts.reads++; assert.equal(ref.limit, 1); return { size: remoteExists ? 1 : 0 }; },
      doc: () => ({}), writeBatch: () => ({ set() { counts.sets++; }, async commit() { counts.commits++; } }),
    };
    vm.runInNewContext(code, context);
    return { migrate: exports.migrateTasksIfEmpty, counts, get queryLimit() { return queryLimit; } };
  };
  test(`${platform} migration: empty local list performs zero reads/writes`, async () => {
    const f = setup(false); await f.migrate({ uid: 'a' }, []);
    assert.deepEqual(f.counts, { reads: 0, sets: 0, commits: 0 });
  });
  test(`${platform} migration: existing remote collection checks at most one document and never overwrites`, async () => {
    const f = setup(true); await f.migrate({ uid: 'a' }, [task('a'), task('b')]);
    assert.deepEqual(f.counts, { reads: 1, sets: 0, commits: 0 }); assert.equal(f.queryLimit, 1);
  });
  test(`${platform} migration: empty remote collection still migrates every local task`, async () => {
    const f = setup(false); await f.migrate({ uid: 'a' }, [task('a'), task('b')]);
    assert.deepEqual(f.counts, { reads: 1, sets: 2, commits: 1 });
  });
}
