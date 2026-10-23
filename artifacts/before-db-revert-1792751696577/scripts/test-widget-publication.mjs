import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { createTaskPublicationReader } from '../desktop-widget/src/lib/observed-publication.ts';

// Bundle the real widget Firebase module against an in-memory SDK boundary.
// No Firebase network calls, credentials, or production data are used.
const exportsByModule = {
  'firebase/app': ['initializeApp'],
  'firebase/auth': ['GoogleAuthProvider', 'createUserWithEmailAndPassword', 'getAuth', 'onAuthStateChanged', 'signInWithEmailAndPassword', 'signInWithPopup', 'signOut'],
  'firebase/firestore': ['collection', 'deleteDoc', 'doc', 'getDoc', 'getDocs', 'initializeFirestore', 'onSnapshot', 'persistentLocalCache', 'persistentMultipleTabManager', 'runTransaction', 'serverTimestamp', 'setDoc'],
};
const result = await build({
  configFile: false, logLevel: 'silent',
  define: Object.fromEntries(['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID'].map(key => [`import.meta.env.VITE_FIREBASE_${key}`, JSON.stringify('test-only')])),
  plugins: [{ name: 'mock-widget-firebase', enforce: 'pre',
    resolveId(id) { if (exportsByModule[id]) return '\0mock:' + id; },
    load(id) {
      if (!id.startsWith('\0mock:')) return;
      return exportsByModule[id.slice(6)].map(name => `export const ${name} = (...args) => globalThis.__widgetPublicationSDK.${name}(...args);`).join('\n');
    },
  }],
  build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('../desktop-widget/src/lib/firebase.ts', import.meta.url)), formats: ['es'] } },
});

function fixture() {
  const docs = new Map(), listeners = new Set(), reads = { tasks: 0, profile: 0 }, writes = [];
  let fail = false;
  const snapshot = ref => ref.kind === 'collection'
    ? { metadata: { fromCache: false }, docs: [...docs].filter(([key]) => key.startsWith(ref.path + '/') && key.slice(ref.path.length + 1).indexOf('/') < 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => ({ id: key.split('/').at(-1), data: () => structuredClone(value) })) }
    : { metadata: { fromCache: false }, data: () => structuredClone(docs.get(ref.path)) };
  const emit = (path, cached = false) => {
    for (const item of listeners) if (item.ref.path === path) item.callback({ ...snapshot(item.ref), metadata: { fromCache: cached } });
  };
  const sdk = {
    initializeApp: () => ({}), initializeFirestore: () => ({}), getAuth: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    collection: (_db, ...parts) => ({ kind: 'collection', path: parts.join('/') }),
    doc: (_db, ...parts) => ({ kind: 'doc', path: parts.join('/') }),
    serverTimestamp: () => 'server-time',
    getDocs: async ref => { reads.tasks++; if (fail) throw Error('offline'); return snapshot(ref); },
    getDoc: async ref => { reads.profile++; if (fail) throw Error('offline'); return snapshot(ref); },
    setDoc: async (ref, data, options) => {
      writes.push({ ref: ref.path, data: structuredClone(data), options });
      docs.set(ref.path, { ...(options?.merge ? docs.get(ref.path) : {}), ...structuredClone(data) });
      emit(ref.path); emit(ref.path.split('/').slice(0, -1).join('/'));
    },
    deleteDoc: async ref => { docs.delete(ref.path); emit(ref.path.split('/').slice(0, -1).join('/')); },
    onSnapshot: (ref, options, callback, error) => {
      const item = { ref, callback: typeof options === 'function' ? options : callback, error };
      listeners.add(item); item.callback(snapshot(ref));
      return () => listeners.delete(item);
    },
  };
  globalThis.__widgetPublicationSDK = sdk;
  return { docs, reads, writes, emit, offline(value) { fail = value; }, listeners };
}
fixture();
const output = Array.isArray(result) ? result[0] : result;
const widget = await import('data:text/javascript;base64,' + Buffer.from(output.output.find(item => item.type === 'chunk').code).toString('base64'));
const user = { uid: 'alice' };
const task = (id, extra = {}) => ({ id, name: id, subject: 'Maths', type: 'Learn', createdAt: `2026-10-23T0${id === 'a' ? '1' : '2'}:00:00Z`, date: widget.todayKey(), completed: true, completedAt: new Date().toISOString(), minutesSpent: 15, ...extra });
const seed = f => f.docs.set('users/alice/profile/current', { username: 'alice', name: 'Alice', avatar: 'a.jpg' });
const entry = f => [...f.docs].find(([path]) => path.startsWith('leaderboards/'))?.[1];

test('real widget save/delete reuses live tasks and profile with zero extra reads and unchanged scores', async () => {
  const f = fixture(); seed(f);
  f.docs.set('users/alice/tasks/a', task('a'));
  f.docs.set('users/alice/tasks/b', task('b', { completed: false, completedAt: null }));
  const stopTasks = widget.watchTasks(user, () => {}), stopProfile = widget.watchProfileAccent(user, () => {});
  try {
    await widget.saveTask(user, task('b'));
    assert.equal(entry(f).points, 23); // 2 completed + 3 study-time points
    assert.equal(entry(f).xp, 23);
    assert.deepEqual(entry(f).leaderboardTasks.map(row => row.points), [11, 12]);
    for (let i = 0; i < 20; i++) await widget.saveTask(user, task('b', { name: `Edited ${i}` }));
    assert.equal(entry(f).leaderboardTasks[1].name, 'Edited 19');
    const path = [...f.docs.keys()].find(path => path.startsWith('leaderboards/'));
    f.docs.set(path, { ...f.docs.get(path), focusDays: { today: 1800000 }, focusXp: 3 });
    await widget.removeTask(user, 'a');
    assert.equal(entry(f).points, 11);
    assert.equal(entry(f).completed, 1);
    assert.deepEqual(entry(f).focusDays, { today: 1800000 });
    assert.equal(entry(f).focusXp, 3);
    assert.deepEqual(f.reads, { tasks: 0, profile: 0 });
    assert.ok(f.writes.filter(write => write.ref.startsWith('leaderboards/')).every(write => write.options.merge));
  } finally { stopTasks(); stopProfile(); }
});

test('remote edits and profile changes reach the next publication; stopped listeners trigger fresh reads', async () => {
  const f = fixture(); seed(f);
  const stopTasks = widget.watchTasks(user, () => {}), stopProfile = widget.watchProfileAccent(user, () => {});
  f.docs.set('users/alice/tasks/a', task('a', { minutesSpent: 20 })); f.emit('users/alice/tasks');
  f.docs.set('users/alice/profile/current', { username: 'alice', name: 'Renamed' }); f.emit('users/alice/profile/current');
  await widget.saveTask(user, task('b'));
  assert.equal(entry(f).name, 'Renamed');
  assert.equal(entry(f).completed, 2);
  assert.equal(entry(f).studyMinutes, 35);
  assert.deepEqual(f.reads, { tasks: 0, profile: 0 });
  stopTasks(); stopProfile();
  await widget.saveTask(user, task('b', { minutesSpent: 40 }));
  assert.deepEqual(f.reads, { tasks: 1, profile: 1 });
  assert.equal(entry(f).studyMinutes, 60);
});

test('cached, lagging, disconnected and failed listeners retain the full-read fallback', async () => {
  let tasks = [task('a')], taskReads = 0, profileReads = 0, fail = false;
  const reader = createTaskPublicationReader({ tasks: async () => { taskReads++; if (fail) throw Error('offline'); return structuredClone(tasks); }, profile: async () => { profileReads++; return { name: 'Alice' }; } });
  const observed = reader.tasks.observe('alice'), profile = reader.profiles.observe('alice');
  observed.update([], true); profile.update({ name: 'stale cache' }, true);
  assert.equal((await reader.read('alice', { type: 'save', task: tasks[0] })).profile.name, 'Alice');
  assert.equal(taskReads, 1); assert.equal(profileReads, 1);
  observed.update(tasks, false); profile.update({ name: 'Alice' }, false);
  tasks = [task('a', { minutesSpent: 50 })];
  assert.equal((await reader.read('alice', { type: 'save', task: tasks[0] })).tasks[0].minutesSpent, 50);
  assert.equal(taskReads, 2, 'lagging listener is never patched speculatively');
  observed.update(tasks, false);
  await reader.read('alice', { type: 'remove', id: 'a' });
  assert.equal(taskReads, 3, 'delete must be reflected by the listener');
  observed.update(tasks, true);
  fail = true;
  await assert.rejects(reader.read('alice', { type: 'save', task: tasks[0] }), /offline/);
  fail = false;
  await reader.read('alice', { type: 'save', task: tasks[0] });
  assert.equal(taskReads, 5, 'failure is retriable');
  observed.release(); profile.release();
});

test('accounts, duplicate listeners, empty server collections and late callbacks stay isolated', async () => {
  let reads = 0;
  const reader = createTaskPublicationReader({ tasks: async () => { reads++; return []; }, profile: async uid => ({ name: uid }) });
  const a = reader.tasks.observe('alice'), duplicate = reader.tasks.observe('alice');
  a.update([], false); duplicate.update([task('wrong')], true);
  assert.deepEqual((await reader.read('alice', { type: 'remove', id: 'deleted' })).tasks, []);
  assert.equal(reads, 0, 'server-confirmed empty collection is valid');
  await reader.read('bob', { type: 'remove', id: 'deleted' });
  assert.equal(reads, 1);
  a.release();
  await reader.read('alice', { type: 'remove', id: 'deleted' });
  assert.equal(reads, 2, 'only a cache-only listener remains');
  duplicate.release();
  const replacement = reader.tasks.observe('alice');
  a.update([task('late')], false);
  assert.equal(reader.tasks.read('alice'), undefined);
  replacement.update([], false);
  duplicate.release();
  assert.deepEqual(reader.tasks.read('alice'), []);
  replacement.release();
});
