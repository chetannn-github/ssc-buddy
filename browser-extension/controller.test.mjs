import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudyController } from '../shared/study-controller.ts';
import { normalizeStudyDomain, studyControlPath, studyDevicesPath } from '../shared/study-lock.ts';
import { MAX_STUDY_WEBSITES } from '../shared/study-selection.ts';
test('public focus shares only daily totals and preserves profile data across credit retries', async () => {
  const documents = new Map(), writes = [];
  documents.set('users/student/profile/current', { username: 'student' });
  documents.set('publicProfiles/student', { uid: 'student', name: 'Student', focusDays: { '2026-10-20': 60000 } });
  const api = {
    doc: (_db, ...parts) => parts.join('/'), collection: () => '', serverTimestamp: () => null,
    onSnapshot: (ref, callback) => { assert.equal(ref, 'publicProfiles/student', 'visitors never read private focus documents'); callback({ data: () => documents.get(ref) }); return () => {}; },
    runTransaction: async (_db, work) => {
      let written = false;
      return work({
        get: async ref => { assert.equal(written, false); return { data: () => documents.get(ref) }; },
        set: (ref, value, options) => {
          written = true; writes.push({ ref, value });
          documents.set(ref, options?.merge ? { ...documents.get(ref), ...value, focusDays: { ...documents.get(ref)?.focusDays, ...value.focusDays } } : value);
        },
      });
    },
  };
  const controller = createStudyController(api);
  const session = { id: 'focus', startedAt: Date.parse('2026-10-21T10:00:00Z'), endsAt: Date.parse('2026-10-21T10:03:00Z'), timeZone: 'UTC', domains: ['private.example'] };
  await controller.recordStudyFocus({}, 'student', session, session.endsAt);
  await controller.recordStudyFocus({}, 'student', session, session.endsAt);
  const profile = documents.get('publicProfiles/student');
  assert.equal(profile.name, 'Student');
  assert.deepEqual(profile.focusDays, { '2026-10-20': 60000, '2026-10-21': 180000 });
  documents.set('users/student/studyFocusDays/2026-10-19', { totalMilliseconds: 90000 });
  await controller.publishStudyFocusDay({}, 'student', '2026-10-19', 'UTC');
  assert.equal(documents.get('publicProfiles/student').focusDays['2026-10-19'], 90000, 'previously saved focus is published without starting a new session');
  for (const write of writes.filter(write => write.ref === 'publicProfiles/student')) assert.deepEqual(Object.keys(write.value).sort(), ['focusDays', 'focusTimeZone', 'updatedAt']);
  let shown;
  controller.watchPublicStudyFocus({}, 'student', 'student', value => { shown = value; }, assert.fail);
  assert.equal(shown.days['2026-10-21'], 180000);
  assert.equal(shown.timeZone, 'UTC');
  const leaderboardPath = 'leaderboards/2026-10-19/entries/student';
  documents.set(leaderboardPath, { ...documents.get(leaderboardPath), points: 20, xp: 495, completed: 2 });
  const long = { ...session, id: 'long', endsAt: session.startedAt + 3600000 };
  await controller.recordStudyFocus({}, 'student', long, long.endsAt);
  await controller.recordStudyFocus({}, 'student', long, long.endsAt);
  const leaderboard = documents.get(leaderboardPath);
  assert.equal(leaderboard.focusXp, 6);
  assert.equal(leaderboard.focusDays['2026-10-21'], 3780000);
  assert.equal(leaderboard.points, 20, 'focus publication preserves task points');
  assert.equal(leaderboard.xp, 495, 'focus publication preserves task XP');
  assert.equal(leaderboard.completed, 2);
  const count = writes.length;
  await controller.publishStudyFocusDay({}, 'student', '2026-10-21', 'UTC');
  assert.equal(writes.length, count, 'unchanged totals do not repeatedly write rewards');
});
test('offline overlay break replay preserves restrictions, remaining time and retry-safe focus credits', async () => {
  const documents = new Map();
  const api = {
    doc: (_db, ...parts) => parts.join('/'), collection: () => '', onSnapshot: () => () => {}, serverTimestamp: () => null,
    runTransaction: async (_db, work) => work({ get: async ref => ({ data: () => documents.get(ref) }), set: (ref, value) => documents.set(ref, value) })
  };
  const controller = createStudyController(api);
  const ref = 'users/student/studyLock/current', start = Date.now() - 600000;
  documents.set(ref, { version: 1, revision: 'first', source: 'mobile', session: { id: 'focus', startedAt: start, endsAt: start + 1500000, domains: ['example.org'], timeZone: 'UTC' } });
  let session;
  for (const [index, seconds] of [60, 180, 240, 300].entries()) {
    const action = { id: `break-${index}`, lockId: 'focus', at: start + seconds * 1000, paused: index % 2 === 0 };
    session = await controller.applyOverlayBreak({}, 'student', action);
    assert.deepEqual(await controller.applyOverlayBreak({}, 'student', action), session, 'acknowledgement retries do not repeat a break');
    assert.deepEqual(session.domains, ['example.org']);
    assert.equal(session.lockId ?? session.id, 'focus', 'app exception slots remain unchanged');
  }
  assert.equal(session.endsAt - session.startedAt, 1380000, 'only two minutes of focus consumed');
  await controller.recordStudyFocus({}, 'student', session, start + 360000);
  const total = [...documents].filter(([key]) => key.includes('/studyFocusDays/')).reduce((sum, [, day]) => sum + day.totalMilliseconds, 0);
  assert.equal(total, 180000, 'three minutes of focus, excluding breaks');
});
test('legacy repeated pauses preserve native app allowance identity while counting separate focus segments', async () => {
  const documents = new Map();
  const api = {
    doc: (_db, ...parts) => parts.join('/'), collection: () => '', onSnapshot: () => () => {}, serverTimestamp: () => null,
    runTransaction: async (_db, work) => work({ get: async ref => ({ data: () => documents.get(ref) }), set: (ref, value) => documents.set(ref, value) })
  };
  const controller = createStudyController(api);
  const ref = 'users/student/studyLock/current';
  await controller.startStudySession({}, 'student', 25, ['example.org']);
  delete documents.get(ref).session.breakLimit;
  delete documents.get(ref).session.breaksTaken;
  const originalId = documents.get(ref).session.id;
  for (let i = 0; i < 2; i++) {
    await controller.pauseStudySession({}, 'student');
    const paused = documents.get(ref).session;
    await assert.rejects(() => controller.saveStudyWebsites({}, 'student', []), /locked/);
    await controller.resumeStudySession({}, 'student');
    const resumed = documents.get(ref).session;
    assert.equal(resumed.lockId, originalId, 'two app slots cannot reset on resume');
    assert.notEqual(resumed.id, paused.id, 'focus segments remain separately credited');
    assert.equal(resumed.endsAt - resumed.startedAt, paused.remainingMs);
  }
});
test('ecosystem controllers normalize domains and share account-scoped paths', () => {
  assert.equal(normalizeStudyDomain('https://ChatGPT.com/c/1'),'chatgpt.com');
  assert.equal(normalizeStudyDomain('docs.example.org'),'docs.example.org');
  for(const input of ['*','com','127.0.0.1','file:///C:/secret','https://user:password@example.org','my_site.example','-bad.example']) assert.throws(()=>normalizeStudyDomain(input));
  assert.deepEqual(studyControlPath('one'),['users','one','studyLock','current']);
  assert.deepEqual(studyDevicesPath('two'),['users','two','studyLockDevices']);
});

test('web and mobile share one session and preserve its active websites and deadline', async () => {
  const documents = new Map(), writes = [];
  const api = {
    doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'),
    onSnapshot: () => () => {}, serverTimestamp: () => ({ timestamp: true }),
    runTransaction: async (_db, work) => work({
      get: async ref => ({ data: () => documents.get(ref) }),
      set: (ref, value) => { documents.set(ref, value); writes.push(value); }
    })
  };
  const web = createStudyController(api, () => 'web-id');
  const mobile = createStudyController(api, () => 'mobile-id');
  await web.saveStudyWebsites({}, 'same-user', ['parmar.com'], 'web');
  const pressedAt = Date.now();
  await mobile.startStudySession({}, 'same-user', 25, ['parmar.com'], 'mobile');
  const reference = 'users/same-user/studyLock/current';
  const session = structuredClone(documents.get(reference).session);
  assert.equal(writes.at(-1).source, 'mobile');
  assert.deepEqual(session.domains, ['parmar.com']);
  assert.ok(session.startedAt >= pressedAt && session.startedAt <= Date.now(), 'timer starts immediately without any browser/device check');
  assert.equal(session.endsAt - session.startedAt, 25 * 60000);
  await assert.rejects(() => web.startStudySession({}, 'same-user', 30, ['example.org'], 'web'), /locked/);
  await assert.rejects(() => mobile.saveStudyWebsites({}, 'same-user', [], 'mobile'), /locked/);
  assert.deepEqual(documents.get(reference).session, session);
  await assert.rejects(() => mobile.startStudySession({}, 'another-user', 25, Array.from({ length: MAX_STUDY_WEBSITES + 1 }, (_, index) => `study${index}.example`), 'mobile'), new RegExp(`${MAX_STUDY_WEBSITES} websites`));
  assert.equal(documents.has('users/another-user/studyLock/current'), false);
  const appOnly = await mobile.startStudySession({}, 'app-only', 15, [], 'mobile');
  assert.deepEqual(appOnly.domains, []);
  assert.equal(appOnly.endsAt - appOnly.startedAt, 15 * 60000);
  await assert.rejects(() => mobile.pauseStudySession({}, 'app-only', 'mobile'), /No breaks/);
  assert.deepEqual(documents.get('users/app-only/studyLock/current').session.domains, []);
  await assert.rejects(() => web.startStudySession({}, 'web-empty', 15, [], 'web'), /websites/);
  for (const limit of [0, 1, 2]) {
    const uid = `app-limit-${limit}`;
    const selected = await mobile.startStudySession({}, uid, 15, [], 'mobile', limit);
    assert.equal(selected.appLimit, limit);
    delete documents.get(`users/${uid}/studyLock/current`).session.breakLimit;
    delete documents.get(`users/${uid}/studyLock/current`).session.breaksTaken;
    await mobile.pauseStudySession({}, uid, 'mobile');
    await mobile.resumeStudySession({}, uid, 'mobile');
    const resumed = documents.get(`users/${uid}/studyLock/current`).session;
    assert.equal(resumed.appLimit, limit);
    assert.equal(resumed.lockId, selected.id);
    const paused = await mobile.applyOverlayBreak({}, uid, { id: `pause-${limit}`, lockId: resumed.lockId, at: resumed.startedAt + 1, paused: true });
    const overlayResumed = await mobile.applyOverlayBreak({}, uid, { id: `resume-${limit}`, lockId: resumed.lockId, at: resumed.startedAt + 2, paused: false });
    assert.equal(paused.appLimit, limit);
    assert.equal(overlayResumed.appLimit, limit);
  }
  await assert.rejects(() => mobile.startStudySession({}, 'invalid-limit', 15, [], 'mobile', 3), /0, 1 or 2/);
});

test('finished sessions are saved before the next session replaces them, and retries preserve totals', async () => {
  const documents = new Map();
  const api = {
    doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'),
    onSnapshot: () => () => {}, serverTimestamp: () => ({ timestamp: true }),
    runTransaction: async (_db, work) => {
      let written = false;
      await work({
        get: async ref => { assert.equal(written, false, 'transaction reads finish before writes'); return { data: () => documents.get(ref) }; },
        set: (ref, value) => { written = true; documents.set(ref, value); }
      });
    }
  };
  const controller = createStudyController(api, () => crypto.randomUUID());
  const previous = { id: 'previous', domains: ['parmar.com'], timeZone: 'Asia/Kolkata', startedAt: Date.parse('2026-10-20T23:45:00+05:30'), endsAt: Date.parse('2026-10-21T00:15:00+05:30') };
  documents.set('users/alice/studyLock/current', { session: previous });
  await controller.startStudySession({}, 'alice', 25, ['parmar.com'], 'web');
  assert.equal(documents.get('users/alice/studyFocusDays/2026-10-20').totalMilliseconds, 900000);
  assert.equal(documents.get('users/alice/studyFocusDays/2026-10-21').totalMilliseconds, 900000);
  await controller.recordStudyFocus({}, 'alice', previous);
  await controller.recordStudyFocus({}, 'alice', previous);
  assert.equal(documents.get('users/alice/studyFocusDays/2026-10-20').totalMilliseconds, 900000);
  assert.equal(documents.get('users/alice/studyFocusDays/2026-10-21').totalMilliseconds, 900000);
  const second = { ...previous, id: 'second' };
  await controller.recordStudyFocus({}, 'alice', second);
  assert.equal(documents.get('users/alice/studyFocusDays/2026-10-20').totalMilliseconds, 1800000);
  assert.equal(documents.has('users/bob/studyFocusDays/2026-10-20'), false);
});
