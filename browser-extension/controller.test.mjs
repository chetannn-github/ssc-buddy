import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudyDomain, studyControlPath, studyDevicesPath } from '../shared/study-lock.ts';
test('ecosystem controllers normalize domains and share account-scoped paths', () => {
  assert.equal(normalizeStudyDomain('https://ChatGPT.com/c/1'),'chatgpt.com');
  assert.equal(normalizeStudyDomain('docs.example.org'),'docs.example.org');
  for(const input of ['*','com','127.0.0.1','file:///C:/secret','https://user:password@example.org','my_site.example','-bad.example']) assert.throws(()=>normalizeStudyDomain(input));
  assert.deepEqual(studyControlPath('one'),['users','one','studyLock','current']);
  assert.deepEqual(studyDevicesPath('two'),['users','two','studyLockDevices']);
});
