import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';

// Executes the current sync helpers with SDK boundaries mocked. Counts application
// calls and fixture documents, not Firestore billing or SDK query deduplication.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function evaluate(source, dependencies) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in dependencies, `Unexpected import ${name}`);
    return dependencies[name];
  }, console });
  return exports;
}
const tracker = evaluate(read('tracker/src/lib/tracker.ts'), {});
const user = { uid: 'audit-user' };
const base = tracker.defaultData();
base.subjects = [{ id: 'math', name: 'Maths', chapters: [{ id: 'a', name: 'A', completed: 0, total: 10 }, { id: 'b', name: 'B', completed: 0, total: 10 }] }];
const sectionsFor = data => ({ meta: data.meta, subjects: data.subjects, revision: data.revision, tests: data.tests, activity: data.activity, pinned: data.pinnedChapterIds });
const sharedSource = evaluate(read('mobile-tasks/src/domain/shared-live-source.ts'), {});
const trackerSource = evaluate(read('mobile-tasks/src/domain/tracker-live-source.ts'), { './shared-live-source': sharedSource });
function fixture(platform, initial = sectionsFor(base)) {
  const counts = { queries: 0, returnedDocuments: 0, subscriptions: 0, initialSnapshotDocuments: 0, writes: [] };
  let remote = structuredClone(initial);
  const database = {};
  const subscriptions = new Set();
  let metadata = { fromCache: false, hasPendingWrites: false };
  let failQuery = false, failWrite = false;
  const snapshot = () => {
    const docs = Object.entries(remote).map(([id, value]) => ({ id, data: () => ({ value }) }));
    return { docs, size: docs.length, metadata };
  };
  const sdk = {
    collection: (_db, ...parts) => parts.join('/'),
    doc: (parent, ...parts) => [parent, ...parts].join('/'),
    query: (ref, bound) => ({ ref, bound }), limit: n => n,
    getDocs: async target => { counts.queries++; if (failQuery) throw Error('network'); const result = snapshot(); if (target?.bound) { result.docs = result.docs.slice(0,target.bound); result.size = result.docs.length; } counts.returnedDocuments += result.size; return result; },
    setDoc: async (ref, payload) => { if (failWrite) throw Error('save'); counts.writes.push(ref); remote[ref.split('/').at(-1)] = payload.value; },
    onSnapshot: (_ref, options, onValue, onError) => {
      const callback = typeof options === 'function' ? options : onValue;
      const error = typeof options === 'function' ? onValue : onError;
      const observer = { callback, error }; subscriptions.add(observer);
      const result = _ref.endsWith('/tests') ? { data: () => ({value:remote.tests}) } : snapshot();
      counts.subscriptions++; counts.initialSnapshotDocuments += result.size ?? 1; callback(result);
      return () => subscriptions.delete(observer);
    },
    writeBatch: () => { const entries = []; return { set: (ref, payload) => entries.push([ref, payload]), commit: async () => { for (const [ref, payload] of entries) await sdk.setDoc(ref, payload); } }; },
  };
  let api;
  if (platform === 'web') {
    api = evaluate(read('src/lib/tracker-sync.ts'), {
      'firebase/firestore': sdk,
      '@/lib/firebase-sync': { getFirebaseFirestore: () => database },
      '@/lib/tracker': tracker,
      '@/lib/web-cloud-sync': { WEB_CLOUD_SYNC_ENABLED: true },
    });
  } else {
    const source = read('mobile-tasks/src/lib/firebase.ts');
    const start = source.indexOf('const trackerCollection =');
    const end = source.indexOf('export async function appendTrackerTest', start);
    assert.ok(start >= 0 && end > start);
    api = evaluate(`import {collection,doc,getDocs,setDoc,writeBatch,onSnapshot,query,limit} from 'firebase/firestore'; import {hasActiveTrackerSource,hasConfirmedTracker,watchTrackerSource} from './tracker-live-source'; import {database} from './database'; const getFirebaseFirestore=()=> database;\n${source.slice(start,end)}`, { 'firebase/firestore': sdk, './tracker-live-source': trackerSource, './database': { database } });
  }
  return { api, counts, subscriptions,
    emit(value, flags = metadata) { remote = structuredClone(value); metadata = flags; for (const sub of [...subscriptions]) sub.callback(snapshot()); },
    error() { for (const sub of [...subscriptions]) sub.error?.(Error('listener failed')); },
    queryFailure(value) { failQuery = value; }, writeFailure(value) { failWrite = value; },
    setMetadata(value) { metadata = value; },
  };
}
for (const platform of ['web', 'app']) {
  const { api, counts } = fixture(platform);
  if (platform === 'web') {
    await api.initializeTrackerSections(user, base);
  } else await api.migrateTrackerSections(user, sectionsFor(base));
  api.watchTrackerSections(user, () => {});
  assert.equal(counts.queries, 1);
  assert.equal(counts.returnedDocuments, platform === 'web' ? 6 : 1);
  assert.equal(counts.initialSnapshotDocuments, 6);
  assert.equal(counts.writes.length, 0);
  console.log(`${platform} startup: ${counts.queries} collection queries, ${counts.returnedDocuments} fixture documents returned, one six-document initial listener snapshot, zero writes.`);

  for (const [action, mutate, expected] of [
    ['unchanged', () => {}, []],
    ['pin', d => d.pinnedChapterIds.push('a'), ['pinned']],
    ['reorder', d => d.subjects[0].chapters.reverse(), ['subjects']],
    ['lecture progress', d => { d.subjects[0].chapters[0].completed++; d.activity.push({ id: 'event', date: '2026-10-24', type: 'lecture', count: 1 }); }, ['subjects', 'activity']],
    ['revision progress', d => { d.revision.math = { types: [], done: { a: { rev: 1 } }, targets: {} }; d.activity.push({ id: 'revision', date: '2026-10-24', type: 'revision', count: 1 }); }, ['revision', 'activity']],
  ]) {
    const next = structuredClone(base); mutate(next);
    const f = fixture(platform);
    await f.api.syncTrackerSections(user, platform === 'web' ? base : sectionsFor(base), platform === 'web' ? next : sectionsFor(next));
    assert.deepEqual(f.counts.writes.map(ref => ref.split('/').at(-1)).sort(), [...expected].sort());
    assert.equal(f.counts.queries, 0);
    console.log(`${platform} ${action}: ${expected.length} section writes, zero explicit reads.`);
  }
  const empty = fixture(platform, {});
  if (platform === 'web') await empty.api.migrateTrackerIfEmpty(user, tracker.defaultData());
  else await empty.api.migrateTrackerSections(user, sectionsFor(tracker.defaultData()));
  assert.equal(empty.counts.writes.length, 6);
  console.log(`${platform} empty remote + default local: initializes six section documents.`);
}
test('web initialization preserves partial remote values, never migrates over them', async () => {
  const f = fixture('web', { activity: [{id:'remote',type:'lecture',count:1,date:'2026-10-24'}] });
  const data = await f.api.initializeTrackerSections(user, base);
  assert.equal(data.activity[0].id, 'remote'); assert.equal(data.subjects.length,0);
  assert.equal(f.counts.queries,1); assert.equal(f.counts.writes.length,0);
});
test('web first-use migration keeps all sections and re-reads after commit', async () => {
  const f = fixture('web', {});
  const data = await f.api.initializeTrackerSections(user, base);
  assert.equal(data.subjects[0].id,'math'); assert.equal(f.counts.queries,2); assert.equal(f.counts.writes.length,6);
});
test('web failures are retried, not cached as initialized', async () => {
  const f = fixture('web', {}); f.queryFailure(true);
  await assert.rejects(f.api.initializeTrackerSections(user,base)); f.queryFailure(false); f.writeFailure(true);
  await assert.rejects(f.api.initializeTrackerSections(user,base)); f.writeFailure(false);
  const data = await f.api.initializeTrackerSections(user,base); assert.equal(data.subjects[0].id,'math');
});
test('app root, Track and tests share a single live collection', async () => {
  const f = fixture('app'); const observed = [], tests = [];
  const a = f.api.watchTrackerSections(user, s => observed.push(s));
  await f.api.migrateTrackerSections(user,sectionsFor(base));
  const b = f.api.watchTrackerSections(user, s => observed.push(s));
  const c = f.api.watchTrackerTests(user,s => tests.push(s));
  assert.equal(f.counts.queries,0); assert.equal(f.counts.subscriptions,1); assert.equal(f.subscriptions.size,1);
  const changed=sectionsFor(structuredClone(base)); changed.subjects[0].chapters[0].completed=3;
  changed.tests.log=[{id:'test',date:'2026-10-24',subjectId:'math',type:'Pre',score:80,total:100}];
  f.emit(changed); assert.equal(observed.at(-1).subjects[0].chapters[0].completed,3); assert.equal(tests.at(-1)[0].score,80);
  const testCalls=tests.length; changed.subjects[0].chapters[0].completed=4; f.emit(changed);
  assert.equal(tests.length,testCalls,'unrelated section updates do not republish test consumers');
  a(); b(); assert.equal(f.subscriptions.size,1); c(); assert.equal(f.subscriptions.size,0);
  await f.api.migrateTrackerSections(user,sectionsFor(base)); assert.equal(f.counts.queries,1);
});
for (const [name, flags, empty] of [
  ['cache', {fromCache:true,hasPendingWrites:false},false],
  ['pending', {fromCache:false,hasPendingWrites:true},false],
  ['empty', {fromCache:false,hasPendingWrites:false},true],
]) test(`app ${name} snapshot cannot bypass migration check`, async () => {
  const f=fixture('app',empty?{}:sectionsFor(base)); f.setMetadata(flags);
  const stop=f.api.watchTrackerSections(user,()=>{});
  await f.api.migrateTrackerSections(user,sectionsFor(base)); assert.equal(f.counts.queries,1);
  assert.equal(f.counts.writes.length,empty?6:0); stop();
});
test('app metadata confirmations update migration readiness without repeat UI callbacks',async()=>{
  const f=fixture('app'); let calls=0;
  f.setMetadata({fromCache:true,hasPendingWrites:false});
  const stop=f.api.watchTrackerSections(user,()=>calls++);
  f.emit(sectionsFor(base),{fromCache:false,hasPendingWrites:false});
  assert.equal(calls,1); await f.api.migrateTrackerSections(user,sectionsFor(base)); assert.equal(f.counts.queries,0);
  f.emit(sectionsFor(base),{fromCache:true,hasPendingWrites:false});
  await f.api.migrateTrackerSections(user,sectionsFor(base)); assert.equal(f.counts.queries,1); stop();
});
test('app listener error invalidates confirmation and remount restarts source',async()=>{
  const f=fixture('app'); const a=f.api.watchTrackerSections(user,()=>{}); const old=[...f.subscriptions][0];
  f.error(); await f.api.migrateTrackerSections(user,sectionsFor(base)); assert.equal(f.counts.queries,1);
  const b=f.api.watchTrackerSections(user,()=>{}); assert.equal(f.counts.subscriptions,2);
  old.callback({docs:[],metadata:{fromCache:false,hasPendingWrites:false}});
  await f.api.migrateTrackerSections(user,sectionsFor(base)); assert.equal(f.counts.queries,1);
  a();b();
});
test('app accounts and database runtimes are isolated, late stopped callbacks ignored',async()=>{
  const f=fixture('app'), g=fixture('app'); const a=f.api.watchTrackerSections(user,()=>{});
  await f.api.migrateTrackerSections({uid:'other'},sectionsFor(base)); assert.equal(f.counts.queries,1);
  await g.api.migrateTrackerSections(user,sectionsFor(base)); assert.equal(g.counts.queries,1);
  const old=[...f.subscriptions][0]; a(); old.callback({docs:[{id:'subjects',data:()=>({value:base.subjects})}],metadata:{fromCache:false,hasPendingWrites:false}});
  await f.api.migrateTrackerSections(user,sectionsFor(base)); assert.equal(f.counts.queries,2);
});
test('standalone app test watcher retains its single-document target',()=>{
  const f=fixture('app'); const stop=f.api.watchTrackerTests(user,()=>{});
  assert.equal(f.counts.initialSnapshotDocuments,1); stop();
});
console.log('Optimized diagnostics executed with mocked SDK boundaries; no production calls or billing estimates.');
