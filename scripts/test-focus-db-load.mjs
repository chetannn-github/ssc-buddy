import assert from 'node:assert/strict';
import test from 'node:test';
import { createStudyController } from '../shared/study-controller.ts';
import { beginStudyBreak, effectiveStudySession } from '../shared/study-breaks.ts';
import { todayFocusMilliseconds, focusSlices } from '../shared/study-focus.ts';
import { focusLeaderboardPatch, focusWeek } from '../shared/focus-rewards.ts';

function fixture() {
  const db = {}, docs = new Map([
    ['users/student/profile/current', { username: 'student' }],
    ['publicProfiles/student', { uid: 'student', name: 'Student', focusDays: {} }],
  ]);
  const counters = { transactions: 0, reads: 0, writes: 0 };
  let fail = false;
  const merge = (old, patch) => Object.fromEntries(Object.entries({...old, ...patch}).map(([key, value]) => [key,
    value && typeof value === 'object' && !Array.isArray(value) ? merge(old?.[key] ?? {}, value) : value]));
  const api = {
    doc: (_, ...parts) => parts.join('/'), collection: (_, ...parts) => parts.join('/'),
    onSnapshot: () => () => {}, serverTimestamp: () => 1,
    runTransaction: async (_, work) => {
      counters.transactions++;
      if (fail) throw Error('offline');
      let written = false;
      return work({
        get: async path => { assert.equal(written, false, 'all reads precede writes'); counters.reads++; return {data: () => structuredClone(docs.get(path))}; },
        set: (path, value, options) => { written = true; counters.writes++; docs.set(path, options?.merge ? merge(docs.get(path), value) : structuredClone(value)); },
      });
    },
  };
  return {db, docs, counters, api, controller: createStudyController(api), offline: value => { fail = value; }};
}
const start = Date.parse('2026-10-19T10:00:00Z');
const session = (id = 'long', hours = 7) => ({id, startedAt: start, endsAt: start + hours * 3600000, domains: ['study.example'], timeZone: 'UTC', breakLimit: 0});

test('7 hours of web/app/Windows timer ticks cause zero focus DB operations; end commits once', async () => {
  const f = fixture(), s = session();
  for (let minute = 0; minute < 420; minute++) {
    for (let client = 0; client < 4; client++) await f.controller.settleStudyFocus(f.db, 'student', s, start + minute * 60000);
  }
  assert.deepEqual(f.counters, {transactions:0, reads:0, writes:0});
  assert.equal(todayFocusMilliseconds(null, s, s.endsAt - 1000), 7 * 3600000 - 1000, 'UI still ticks locally');
  await Promise.all(Array.from({length:4}, () => f.controller.settleStudyFocus(f.db, 'student', s, s.endsAt)));
  assert.deepEqual(f.counters, {transactions:1, reads:3, writes:3});
  assert.equal(f.docs.get('users/student/studyFocusDays/2026-10-19').totalMilliseconds, 7 * 3600000);
  assert.equal(f.docs.get('publicProfiles/student').focusDays['2026-10-19'], 7 * 3600000);
  assert.equal(f.docs.get('leaderboards/2026-10-19/entries/student').focusXp, 42);
  const counts = {...f.counters};
  for (let repeat = 0; repeat < 500; repeat++) await f.controller.settleStudyFocus(f.db, 'student', s, s.endsAt + repeat * 60000);
  assert.deepEqual(f.counters, counts, 'expired timer never re-reads or republishes on subsequent ticks');
});

test('manual break, automatic resume, second break and end keep exact focus excluding both breaks', async () => {
  const f = fixture(), s = {...session('breaks', 2), breakLimit:2, breaksTaken:0};
  const path = 'users/student/studyLock/current';
  f.docs.set(path, {version:1, revision:'start', session:s});
  const realNow = Date.now;
  try {
    let now = start + 30 * 60000; Date.now = () => now;
    await f.controller.pauseStudySession(f.db, 'student');
    const paused = f.docs.get(path).session;
    assert.equal(paused.breakUntil, now + 600000);
    assert.equal(f.docs.get('users/student/studyFocusDays/2026-10-19').totalMilliseconds, 30 * 60000);
    now = paused.breakUntil;
    await f.controller.reconcileStudySession(f.db, 'student');
    const resumed = f.docs.get(path).session;
    assert.equal(resumed.endsAt, s.endsAt + 600000);
    const counts = {...f.counters};
    for (let minute = 0; minute < 30; minute++) await f.controller.settleStudyFocus(f.db, 'student', resumed, now + minute * 60000);
    assert.deepEqual(f.counters, counts);
    now += 30 * 60000;
    await f.controller.pauseStudySession(f.db, 'student');
    assert.equal(f.docs.get('users/student/studyFocusDays/2026-10-19').totalMilliseconds, 60 * 60000);
    const second = f.docs.get(path).session;
    now = second.breakUntil;
    const last = effectiveStudySession(second, now);
    now = last.endsAt;
    await f.controller.settleStudyFocus(f.db, 'student', second, now);
    assert.equal(f.docs.get('users/student/studyFocusDays/2026-10-19').totalMilliseconds, 120 * 60000);
    assert.equal(last.endsAt, s.endsAt + 20 * 60000);
  } finally { Date.now = realNow; }
});

test('failed/offline settlement retries and restart recovers expired control without double credit', async () => {
  const f = fixture(), s = session();
  f.offline(true);
  await assert.rejects(f.controller.settleStudyFocus(f.db, 'student', s, s.endsAt));
  f.offline(false);
  await f.controller.settleStudyFocus(f.db, 'student', s, s.endsAt);
  const writes = f.counters.writes;
  await createStudyController(f.api).settleStudyFocus(f.db, 'student', s, s.endsAt + 3600000);
  assert.equal(f.counters.writes, writes, 'a cold client reads credits but never republishes unchanged projections');
  assert.equal(f.docs.get('users/student/studyFocusDays/2026-10-19').totalMilliseconds, 7 * 3600000);
});

test('publication repair is scoped by database, user, day, total and retries on failure', async () => {
  const f = fixture();
  f.docs.set('users/student/studyFocusDays/2026-10-19', {totalMilliseconds:600000, sessionCredits:{}});
  await Promise.all(Array.from({length:6}, () => f.controller.publishStudyFocusDay(f.db, 'student', '2026-10-19', 'UTC', 600000)));
  assert.equal(f.counters.transactions, 1);
  await f.controller.publishStudyFocusDay(f.db, 'student', '2026-10-19', 'UTC', 600000);
  assert.equal(f.counters.transactions, 1);
  f.docs.set('users/student/studyFocusDays/2026-10-19', {totalMilliseconds:1200000, sessionCredits:{}});
  f.offline(true);
  await assert.rejects(f.controller.publishStudyFocusDay(f.db, 'student', '2026-10-19', 'UTC', 1200000));
  f.offline(false);
  await f.controller.publishStudyFocusDay(f.db, 'student', '2026-10-19', 'UTC', 1200000);
  assert.equal(f.docs.get('publicProfiles/student').focusDays['2026-10-19'], 1200000);
  await f.controller.publishStudyFocusDay(f.db, 'other', '2026-10-19', 'UTC', 1200000);
  assert.equal(f.counters.transactions, 4, 'another account does not inherit the successful cache');
});

test('midnight and week boundary settle all days once and retain task/profile fields', async () => {
  const f = fixture(), s = {...session('midnight', 2), startedAt:Date.parse('2026-10-25T23:00:00Z'), endsAt:Date.parse('2026-10-26T01:00:00Z')};
  f.docs.set('leaderboards/2026-10-19/entries/student', {xp:500, points:99, completed:3});
  await f.controller.settleStudyFocus(f.db, 'student', s, s.endsAt);
  for (const slice of focusSlices(s, s.endsAt)) assert.equal(f.docs.get(`users/student/studyFocusDays/${slice.date}`).totalMilliseconds, 3600000);
  assert.equal(f.docs.get('leaderboards/2026-10-19/entries/student').points, 99);
  assert.equal(f.docs.get('leaderboards/2026-10-19/entries/student').xp, 500);
  assert.equal(f.docs.get('leaderboards/2026-10-26/entries/student').focusXp, 12);
  assert.equal(f.docs.get('publicProfiles/student').name, 'Student');
});

test('setting up a public profile later is not suppressed by a cached ineligible publication', async () => {
  const f = fixture();
  f.docs.delete('users/student/profile/current');
  f.docs.set('users/student/studyFocusDays/2026-10-19',{totalMilliseconds:600000,sessionCredits:{}});
  await f.controller.publishStudyFocusDay(f.db,'student','2026-10-19','UTC',600000);
  f.docs.set('users/student/profile/current',{username:'student'});
  await f.controller.publishStudyFocusDay(f.db,'student','2026-10-19','UTC',600000);
  assert.equal(f.docs.get('publicProfiles/student').focusDays['2026-10-19'],600000);
});

test('100 published focus days are checked by week, not 400 per-day reads on every profile mount', async () => {
  const f=fixture(), days={};
  for(let i=0;i<100;i++){
    const date=new Date(Date.parse('2026-01-01T12:00:00Z')+i*86400000).toISOString().slice(0,10);
    days[date]={totalMilliseconds:600000,sessionCredits:{}};
    f.docs.get('publicProfiles/student').focusDays[date]=600000;
  }
  const weeks=new Set(Object.keys(days).map(focusWeek));
  for(const week of weeks){
    const date=Object.keys(days).find(date=>focusWeek(date)===week);
    f.docs.set(`leaderboards/${week}/entries/student`,focusLeaderboardPatch('student',{username:'student'},date,f.docs.get('publicProfiles/student').focusDays));
  }
  await Promise.all(Array.from({length:5},()=>f.controller.repairStudyFocusDays(f.db,'student',days)));
  assert.deepEqual(f.counters,{transactions:1,reads:2+weeks.size,writes:0});
  await f.controller.repairStudyFocusDays(f.db,'student',days);
  assert.equal(f.counters.reads,2+weeks.size);
});

test('a partially missing leaderboard projection is repaired even when the public total already matches', async () => {
  const f=fixture(),date='2026-10-19',day={totalMilliseconds:600000,sessionCredits:{}};
  f.docs.set(`users/student/studyFocusDays/${date}`,day);
  f.docs.get('publicProfiles/student').focusDays[date]=600000;
  await f.controller.repairStudyFocusDays(f.db,'student',{[date]:day});
  assert.equal(f.docs.get('leaderboards/2026-10-19/entries/student').focusXp,1);
  assert.equal(f.docs.get('publicProfiles/student').focusDays[date],600000);
});
