import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudyController } from '../shared/study-controller.ts';
import { normalizeStudyDomain, studyControlPath, studyDevicesPath } from '../shared/study-lock.ts';
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
  await mobile.startStudySession({}, 'same-user', 25, ['parmar.com'], 'mobile');
  const reference = 'users/same-user/studyLock/current';
  const session = structuredClone(documents.get(reference).session);
  assert.equal(writes.at(-1).source, 'mobile');
  assert.deepEqual(session.domains, ['parmar.com']);
  assert.equal(session.endsAt - session.startedAt, 25 * 60000);
  await assert.rejects(() => web.startStudySession({}, 'same-user', 30, ['example.org'], 'web'), /locked/);
  await assert.rejects(() => mobile.saveStudyWebsites({}, 'same-user', [], 'mobile'), /locked/);
  assert.deepEqual(documents.get(reference).session, session);
  await assert.rejects(() => mobile.startStudySession({}, 'another-user', 25, ['one.org', 'two.org', 'three.org', 'four.org'], 'mobile'), /3 websites/);
  assert.equal(documents.has('users/another-user/studyLock/current'), false);
});
