import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSession, allowed, rulesFor, editWebsites, startControl } from './policy.js';
import { MAX_STUDY_WEBSITES, splitSelection } from '../shared/study-selection.ts';
const session = { id:'test', startedAt:1000, endsAt:61000, domains:['chatgpt.com','example.org'] };
test('deadline expires exactly and offline state cannot extend it', () => {
  assert.equal(validSession(session,61000),null); assert.deepEqual(validSession(session,60999),session);
  assert.throws(() => validSession({...session,endsAt:1000+721*60000},1000));
});
test('allowlist respects host boundaries and protocols', () => {
  for (const url of ['https://chatgpt.com/c/1','https://auth.chatgpt.com/']) assert.equal(allowed(url,session.domains),true);
  for (const url of ['https://fakechatgpt.com','https://chatgpt.com.evil.org','https://chatgpt.com@evil.org','file:///chatgpt.com']) assert.equal(allowed(url,session.domains),false);
});
test('invalid Firebase packets cannot broaden website access', () => {
  for (const domains of [['*'],['com'],['example.org/path'],['127.0.0.1'],['https://example.org']]) assert.throws(() => validSession({...session,domains},1000));
});

test('mobile sessions without website exceptions still enforce the browser lock', () => {
  const active = validSession({ ...session, domains: [] }, 1000);
  assert.deepEqual(active.domains, []);
  assert.equal(rulesFor(active).length, 1);
  assert.equal(rulesFor(active)[0].action.type, 'redirect');
  assert.equal(allowed('https://example.org', active.domains), false);
  assert.throws(() => startControl({ session: null, allowedDomains: [] }, 15, 1000), /Add a website/);
  for (const appLimit of [0, 1, 2]) assert.equal(validSession({ ...session, appLimit }, 1000).appLimit, appLimit);
  assert.throws(() => validSession({ ...session, appLimit: 3 }, 1000), /app limit/);
});
test('only top-level websites redirected, allow rules override default restriction', () => {
  const [block,allow] = rulesFor(session);
  assert.deepEqual(block.condition.resourceTypes,['main_frame']); assert.deepEqual(allow.condition.resourceTypes,['main_frame']);
  assert.ok(allow.priority>block.priority); assert.deepEqual(allow.condition.requestDomains,session.domains);
  assert.equal(block.action.redirect.extensionPath,'/blocked.html'); assert.deepEqual(rulesFor(null),[]);
});
test('website edits use the shared slot limit, preserve deadline, and prevent rotating sites', () => {
  let control = {version:1,revision:'one',session:{...session,domains:['chatgpt.com']}};
  const sites = Array.from({ length: MAX_STUDY_WEBSITES - 1 }, (_, index) => `study${index}.example`);
  for (const site of sites) control = editWebsites(control,site,false,2000);
  assert.deepEqual(control.session.domains,['chatgpt.com',...sites]);
  assert.equal(control.session.endsAt,session.endsAt);assert.equal(control.session.startedAt,session.startedAt);assert.equal(control.session.id,session.id);
  assert.throws(()=>editWebsites(control,'overflow.org',false,2000),new RegExp(`Maximum ${MAX_STUDY_WEBSITES}`));
  assert.throws(()=>editWebsites(control,'chatgpt.com',true,2000),/locked/);
  assert.equal(editWebsites(control,'chatgpt.com',false,2000).session.domains.length,MAX_STUDY_WEBSITES);
  const draft=editWebsites(control,'chatgpt.com',true,62000);assert.equal(draft.session,null);assert.deepEqual(draft.allowedDomains,sites);
  assert.throws(() => splitSelection([...control.session.domains, 'overflow.org']), new RegExp(`Maximum ${MAX_STUDY_WEBSITES}`));
  assert.deepEqual(validSession({ ...session, domains: [...control.session.domains, 'legacy.org'] }, 2000).domains, control.session.domains);
  const legacyDraft = { session: null, allowedDomains: [...control.session.domains, 'legacy.org'] };
  assert.deepEqual(startControl(legacyDraft, 25, 2000).session.domains, control.session.domains);
  assert.deepEqual(editWebsites(legacyDraft, 'chatgpt.com', true, 2000).allowedDomains, sites);
});

test("YouTube is an ordinary website and channel IDs are no longer accepted",()=>{const control=editWebsites({session:null},"youtube.com",false,1000);assert.deepEqual(startControl(control,40,1000).session.domains,["youtube.com"]);assert.throws(()=>editWebsites(control,"UC"+"a".repeat(22),false,1000));assert.equal(rulesFor(startControl(control,40,1000).session).length,2);});
