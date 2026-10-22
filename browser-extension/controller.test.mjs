import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudyController } from '../shared/study-controller.ts';
import { normalizeStudyDomain, studyControlPath, studyDevicesPath } from '../shared/study-lock.ts';
test('repeated breaks preserve native app allowance identity while counting separate focus segments', async () => {
  const documents = new Map();
  const api = {
    doc: (_db, ...parts) => parts.join('/'), collection: () => '', onSnapshot: () => () => {}, serverTimestamp: () => null,
    runTransaction: async (_db, work) => work({ get: async ref => ({ data: () => documents.get(ref) }), set: (ref, value) => documents.set(ref, value) })
  };
  const controller = createStudyController(api);
  const ref = 'users/student/studyLock/current';
  await controller.startStudySession({}, 'student', 25, ['example.org']);
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
  await assert.rejects(() => mobile.startStudySession({}, 'another-user', 25, ['one.org', 'two.org', 'three.org', 'four.org'], 'mobile'), /3 websites/);
  assert.equal(documents.has('users/another-user/studyLock/current'), false);
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
