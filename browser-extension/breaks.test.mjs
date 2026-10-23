import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginStudyBreak, effectiveStudySession, maxStudyBreaks, onStudyBreak, studyBreakState, studyTimerMilliseconds } from '../shared/study-breaks.ts';
import { createStudyController } from '../shared/study-controller.ts';
import { validSession, rulesFor } from './policy.js';
const minute = 60000;
const start = Date.parse('2026-10-23T08:00:00Z');
const initial = () => ({ id: 'session', startedAt: start, endsAt: start + 120 * minute, domains: ['study.example'], timeZone: 'UTC', breakLimit: 3, breaksTaken: 0, appLimit: 1 });

test('break slots follow duration and each optional break needs 30 actual focus minutes', () => {
  assert.deepEqual([15, 29, 30, 59, 60, 90, 120, 240, 720].map(maxStudyBreaks), [0, 0, 0, 0, 1, 2, 3, 7, 23]);
  const first = initial();
  assert.equal(studyBreakState(first, start + 30 * minute - 1).available, false);
  const paused = beginStudyBreak(first, start + 60 * minute);
  assert.equal(paused.remainingMs, 60 * minute, 'taking the first break late does not consume focus');
  assert.equal(paused.breakUntil, start + 70 * minute);
  assert.equal(paused.breaksTaken, 1);
  assert.equal(studyTimerMilliseconds(paused, start + 65 * minute), 5 * minute);
  const resumed = effectiveStudySession(paused, start + 75 * minute);
  assert.equal(resumed.startedAt, start + 70 * minute, 'offline resume uses deadline, not reconnection');
  assert.equal(resumed.endsAt, start + 130 * minute);
  assert.equal(resumed.lockId, first.id);
  assert.equal(resumed.appLimit, 1);
  assert.equal(studyBreakState(resumed, start + 90 * minute).available, false);
  const second = beginStudyBreak(resumed, start + 100 * minute); // 90 actual focus minutes
  assert.equal(second.breaksTaken, 2);
  const running = effectiveStudySession(second, start + 110 * minute);
  assert.equal(running.endsAt, start + 140 * minute, '120 focus + two 10-minute breaks');
  assert.equal(studyBreakState(running, running.endsAt).available, false, 'no break after completion');
  assert.throws(() => beginStudyBreak({ ...first, breakLimit: 0 }, start + 40 * minute), /No breaks/);
});

test('all three breaks may be used at 30, 60, 90 focus minutes, adding exactly 30 minutes', () => {
  let session = initial();
  for (let i = 0; i < 3; i++) {
    session = beginStudyBreak(session, session.startedAt + 30 * minute);
    session = effectiveStudySession(session, session.breakUntil);
  }
  assert.equal(session.breaksTaken, 3);
  assert.equal(session.endsAt, start + 150 * minute);
  assert.equal(studyBreakState(session, session.startedAt + 30 * minute - 1).left, 0);
});

test('browser unlocks only for the saved 10-minute window and resumes offline', () => {
  const paused = beginStudyBreak(initial(), start + 30 * minute);
  assert.equal(onStudyBreak(paused, paused.breakUntil - 1), true);
  const realNow = Date.now;
  try {
    Date.now = () => paused.pausedAt;
    assert.deepEqual(rulesFor(validSession(paused)), []);
    Date.now = () => paused.breakUntil;
    const resumed = validSession(paused);
    assert.equal(resumed.paused, undefined);
    assert.equal(rulesFor(resumed).length, 2);
    assert.equal(studyTimerMilliseconds(paused), 90 * minute);
    assert.equal(validSession(paused, resumed.endsAt), null);
    assert.throws(() => validSession({ ...paused, breakUntil: paused.breakUntil + 1 }), /deadline/);
  } finally { Date.now = realNow; }
});

test('controllers enforce eligibility, auto-resume across clients, and never award break time', async () => {
  const documents = new Map(); let writes = 0;
  const api = {
    doc: (_db, ...parts) => parts.join('/'), collection: () => '', onSnapshot: () => () => {}, serverTimestamp: () => null,
    runTransaction: async (_db, work) => {
      let wrote = false;
      return work({ get: async ref => { assert.equal(wrote, false); return { data: () => documents.get(ref) }; }, set: (ref, value) => { wrote = true; writes++; documents.set(ref, value); } });
    },
  };
  const controller = createStudyController(api), ref = 'users/student/studyLock/current';
  const realNow = Date.now; let now = start;
  Date.now = () => now;
  try {
    await assert.rejects(() => controller.startStudySession({}, 'student', 120, ['study.example'], 'web', 2, 4), /number of breaks/);
    await controller.startStudySession({}, 'student', 120, ['study.example'], 'web', 2, 3);
    await assert.rejects(() => controller.pauseStudySession({}, 'student'), /30 minutes/);
    now += 60 * minute;
    await controller.pauseStudySession({}, 'student');
    const paused = documents.get(ref).session;
    assert.equal(paused.breaksTaken, 1);
    await assert.rejects(() => controller.resumeStudySession({}, 'student'), /automatically/);
    await assert.rejects(() => controller.saveStudyWebsites({}, 'student', []), /locked/);
    now += 15 * minute;
    await controller.reconcileStudySession({}, 'student');
    const resumed = documents.get(ref).session, savedWrites = writes;
    await controller.reconcileStudySession({}, 'student');
    assert.equal(writes, savedWrites, 'multiple clients do not repeat the resume');
    assert.equal(resumed.startedAt, start + 70 * minute);
    await controller.recordStudyFocus({}, 'student', resumed, now);
    const day = documents.get('users/student/studyFocusDays/2026-10-23');
    assert.equal(day.totalMilliseconds, 65 * minute);
    await controller.recordStudyFocus({}, 'student', paused, now);
    assert.equal(documents.get('users/student/studyFocusDays/2026-10-23').totalMilliseconds, 65 * minute);
    await assert.rejects(() => controller.pauseStudySession({}, 'student'), /30 minutes/);
  } finally { Date.now = realNow; }
});
