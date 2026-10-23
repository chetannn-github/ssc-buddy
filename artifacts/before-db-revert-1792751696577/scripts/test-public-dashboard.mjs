import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicDashboardPublisher, dashboardFieldsEqual } from '../shared/public-dashboard.ts';

const payload = () => ({ uid: 'alice', username: 'alice', name: 'Alice', activity: { '2026-10-23': 1 }, dashboard: { records: [], dailyTasks: [{ id: 'task', completed: false }], tracker: { activity: [], subjects: [] } } });
function fixture() {
  const docs = new Map(), writes = []; let fail = false;
  const api = { doc: (_db, ...parts) => parts.join('/'), serverTimestamp: () => 'new-timestamp',
    runTransaction: async (_db, work) => {
      let written = false;
      return work({
        get: async ref => { assert.equal(written, false); if (fail) throw Error('offline'); return { data: () => structuredClone(docs.get(ref)) }; },
        set: (ref, fields, options) => { written = true; assert.equal(options.merge, true); writes.push({ ref, fields: structuredClone(fields) }); docs.set(ref, structuredClone({ ...docs.get(ref), ...fields })); },
      });
    },
  };
  return { docs, writes, publish: createPublicDashboardPublisher(api), offline(value) { fail = value; } };
}

test('identical dashboard produces no writes across callers, restarts, and object key order', async () => {
  const f = fixture(), db = {}, value = payload();
  f.docs.set('publicProfiles/alice', { ...value, updatedAt: 'original', focusDays: { '2026-10-23': 1800000 }, focusTimeZone: 'UTC' });
  for (let i = 0; i < 20; i++) assert.equal(await f.publish(db, 'alice', 'alice', structuredClone(value)), false);
  const reordered = { dashboard: { tracker: { subjects: [], activity: [] }, dailyTasks: [{ completed: false, id: 'task' }], records: [] }, activity: value.activity, name: 'Alice', username: 'alice', uid: 'alice' };
  assert.equal(dashboardFieldsEqual(value, reordered), true);
  assert.equal(await f.publish(db, 'alice', 'alice', reordered), false);
  assert.equal(f.writes.length, 0);
  assert.equal(f.docs.get('publicProfiles/alice').updatedAt, 'original');
});

test('real task and profile changes publish once without overwriting focus or unrelated fields', async () => {
  const f = fixture(), db = {}, value = payload();
  f.docs.set('publicProfiles/alice', { ...structuredClone(value), focusDays: { '2026-10-23': 1800000 }, retained: 'yes' });
  value.dashboard.dailyTasks[0].completed = true;
  value.activity['2026-10-23'] = 2;
  assert.equal(await f.publish(db, 'alice', 'alice', value), true);
  assert.equal(await f.publish(db, 'alice', 'alice', value), false);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.docs.get('publicProfiles/alice').focusDays, { '2026-10-23': 1800000 });
  assert.equal(f.docs.get('publicProfiles/alice').retained, 'yes');
  value.name = 'Updated Alice';
  assert.equal(await f.publish(db, 'alice', 'alice', value), true);
  assert.equal(f.writes.length, 2);
});

test('new/empty dashboard creates correctly, ownership is enforced, failures can retry', async () => {
  const f = fixture(), db = {}, value = payload();
  f.offline(true);
  await assert.rejects(f.publish(db, 'alice', 'alice', value), /offline/);
  f.offline(false);
  assert.equal(await f.publish(db, 'alice', 'alice', value), true);
  assert.equal(f.writes.length, 1);
  await assert.rejects(f.publish(db, 'bob', 'alice', { ...value, uid: 'bob' }), /another account/);
  await assert.rejects(f.publish(db, 'bob', 'bob', value), /Invalid/);
  const cleared = { ...value, activity: {}, dashboard: { records: [], dailyTasks: [], tracker: { activity: [], subjects: [] } } };
  assert.equal(await f.publish(db, 'alice', 'alice', cleared), true, 'intentional data clearing still publishes');
});

test('app and web publish only after account-scoped hydration; other mobile readers retain cached default', async () => {
  const file = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
  const [mobile, root, shell, native, web] = await Promise.all(['mobile-tasks/App.tsx', 'src/routes/__root.tsx', 'src/components/layout/AppShell.tsx', 'mobile-tasks/src/lib/firebase.ts', 'src/lib/firebase-sync.ts'].map(file));
  assert.match(mobile, /!profileActivityReady \|\| publicActivityOwner !== user.uid \|\| publicTasksOwner !== user.uid \|\| publicProfileOwner !== user.uid/);
  assert.match(root, /setHydratedUser\(syncUser.uid\)/);
  assert.match(root, /WorkspaceHydratedUserContext.Provider/);
  assert.match(shell, /!profileHydrated \|\| !workspaceHydrated/);
  assert.match(shell, /taskActivityDates, profileHydrated, workspaceHydrated/);
  assert.match(native, /onServerReady\?: \(\) => void/);
  assert.match(native, /if \(!snapshot.metadata.fromCache\) onServerReady\?\.\(\)/);
  assert.doesNotMatch(native, /if \([^\n]*snapshot.metadata.fromCache\) return/);
  assert.match(native, /await publishDashboard\(getFirebaseFirestore\(\), user.uid/);
  assert.match(web, /await publishDashboard\(dbValue, user.uid/);
});
