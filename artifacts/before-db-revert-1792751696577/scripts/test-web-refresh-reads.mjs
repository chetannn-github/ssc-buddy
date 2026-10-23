import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { observeOnce } from '../shared/read-once.ts';
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('overlapping displays share one read; finished reads never become a persistent stale cache', async () => {
  const db = {}; let calls = 0, value = 10;
  const seen = [], read = async () => { calls++; return value; };
  const fail = assert.fail;
  observeOnce(db, 'week', read, next => seen.push(next), fail);
  observeOnce(db, 'week', read, next => seen.push(next), fail);
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(seen, [10, 10]);
  value = 20;
  await flush();
  assert.deepEqual(seen, [10, 10], 'remote updates do not trigger another background read');
  observeOnce(db, 'week', read, next => seen.push(next), fail);
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(seen, [10, 10, 20], 'reopening/refresh reads current server value');
});

test('navigation cancels only its callback, without dropping another active display', async () => {
  const db = {}; let resolve;
  const seen = [];
  const read = () => new Promise(done => { resolve = done; });
  const stop = observeOnce(db, 'day', read, () => seen.push('old-page'), assert.fail);
  observeOnce(db, 'day', read, () => seen.push('current-page'), assert.fail);
  await flush(); stop(); resolve(1); await flush();
  assert.deepEqual(seen, ['current-page']);
});

test('failed reads are retriable and accounts/dates/databases do not share private results', async () => {
  const db = {}; let calls = 0, errors = 0;
  observeOnce(db, 'alice/today', async () => { throw Error('offline'); }, assert.fail, () => errors++);
  await flush();
  assert.equal(errors, 1);
  const read = async () => ++calls;
  observeOnce(db, 'alice/today', read, () => {}, assert.fail);
  observeOnce(db, 'bob/today', read, () => {}, assert.fail);
  observeOnce(db, 'alice/yesterday', read, () => {}, assert.fail);
  observeOnce({}, 'alice/today', read, () => {}, assert.fail);
  await flush();
  assert.equal(calls, 4);
});

test('web display readers use one-shot fetches while Focus Lock enforcement stays live', async () => {
  const file = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
  const [reader, leaderboard, profile, shell, xp, control, extension, tasks] = await Promise.all([
    'src/lib/web-focus-reader.ts', 'src/lib/leaderboard.ts', 'src/routes/profile.tsx',
    'src/components/layout/AppShell.tsx', 'shared/use-leaderboard-xp.ts',
    'shared/StudyLockControl.tsx', 'browser-extension/cloud.js', 'src/components/tasks/TasksWorkspace.tsx',
  ].map(file));
  assert.doesNotMatch(reader, /onSnapshot/);
  assert.match(reader, /getDocs\(collection\(db, "users", uid, "studyFocusDays"\)\)/);
  assert.match(reader, /value\?\.\["uid"\] === uid/, 'public focus ownership still verified');
  assert.doesNotMatch(leaderboard, /onSnapshot/);
  assert.match(leaderboard, /export function loadLeaderboard/);
  assert.match(profile, /webFocusReader as focusReader/);
  assert.match(shell, /watchStudyFocusDays.*from "@\/lib\/web-focus-reader"/);
  assert.doesNotMatch(shell, /watchCloudProfile\(/);
  assert.match(tasks, /focusReader=\{webFocusReader\}/);
  assert.match(xp, /live = true/, 'Windows XP retains its previous live default');
  assert.match(xp, /live \? onSnapshot/);
  assert.match(control, /const stopControl = watchStudyControl/, 'critical shared timer retains live control subscription');
  assert.match(extension, /watchControl\(/);
  assert.match(extension, /onSnapshot\(/, 'browser blocking must still receive remote changes');
});
