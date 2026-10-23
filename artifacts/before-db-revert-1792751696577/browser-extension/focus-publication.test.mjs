import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishChangedFocusDay } from '../shared/focus-publication.ts';

test('history backfills once; only changed days trigger another publication', async () => {
  const db = {}, calls = [];
  const publish = async (_db, uid, date) => calls.push([uid, date]);
  const days = { '2026-10-20': 600000, '2026-10-21': 1200000, '2026-10-22': 1800000 };
  const scan = () => Promise.all(Object.entries(days).map(([date, total]) => publishChangedFocusDay(db, 'student', date, total, publish, 'UTC')));
  await scan();
  assert.equal(calls.length, 3);
  for (let i = 0; i < 100; i++) await scan();
  assert.equal(calls.length, 3, 'listener events and minute timers do not reread unchanged history');
  days['2026-10-22'] += 60000;
  await scan();
  assert.deepEqual(calls.at(-1), ['student', '2026-10-22']);
  assert.equal(calls.length, 4);
  await publishChangedFocusDay(db, 'student', '2026-10-23', 0, publish, 'UTC');
  assert.equal(calls.length, 4, 'zero focus does not start a publication transaction');
});

test('overlapping screens share one in-flight publication and newer totals are not lost', async () => {
  const db = {}, calls = [];
  let release;
  const publish = async () => { calls.push('publish'); if (calls.length === 1) await new Promise(resolve => { release = resolve; }); };
  const first = publishChangedFocusDay(db, 'student', '2026-10-23', 60000, publish, 'UTC');
  await Promise.resolve();
  const same = publishChangedFocusDay(db, 'student', '2026-10-23', 60000, publish, 'UTC');
  const newer = publishChangedFocusDay(db, 'student', '2026-10-23', 120000, publish, 'UTC');
  assert.equal(calls.length, 1);
  release();
  await Promise.all([first, same, newer]);
  assert.equal(calls.length, 2);
  await publishChangedFocusDay(db, 'student', '2026-10-23', 120000, publish, 'UTC');
  assert.equal(calls.length, 2);
});

test('failed attempts retry; different accounts, dates, zones and database instances stay isolated', async () => {
  const db = {}; let count = 0, offline = true;
  const publish = async () => { count++; if (offline) throw Error('offline'); };
  await assert.rejects(publishChangedFocusDay(db, 'alice', '2026-10-23', 60000, publish, 'UTC'), /offline/);
  offline = false;
  await publishChangedFocusDay(db, 'alice', '2026-10-23', 60000, publish, 'UTC');
  await publishChangedFocusDay(db, 'alice', '2026-10-23', 60000, publish, 'UTC');
  assert.equal(count, 2);
  await publishChangedFocusDay(db, 'bob', '2026-10-23', 60000, publish, 'UTC');
  await publishChangedFocusDay(db, 'alice', '2026-10-24', 60000, publish, 'UTC');
  await publishChangedFocusDay(db, 'alice', '2026-10-23', 60000, publish, 'Asia/Kolkata');
  await publishChangedFocusDay({}, 'alice', '2026-10-23', 60000, publish, 'UTC');
  assert.equal(count, 6);
});

test('publication skipped before profile setup is retried after profile becomes available', async () => {
  const db = {}; let ready = false, calls = 0;
  const publish = async () => { calls++; return ready; };
  await publishChangedFocusDay(db, 'student', '2026-10-23', 60000, publish, 'UTC');
  ready = true;
  await publishChangedFocusDay(db, 'student', '2026-10-23', 60000, publish, 'UTC');
  await publishChangedFocusDay(db, 'student', '2026-10-23', 60000, publish, 'UTC');
  assert.equal(calls, 2, 'only a confirmed publication may suppress a later request');
});
