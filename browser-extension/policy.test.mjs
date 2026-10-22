import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSession, allowed, rulesFor, editWebsites, startControl } from './policy.js';
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
});
test('only top-level websites redirected, allow rules override default restriction', () => {
  const [block,allow] = rulesFor(session);
  assert.deepEqual(block.condition.resourceTypes,['main_frame']); assert.deepEqual(allow.condition.resourceTypes,['main_frame']);
  assert.ok(allow.priority>block.priority); assert.deepEqual(allow.condition.requestDomains,session.domains);
  assert.equal(block.action.redirect.extensionPath,'/blocked.html'); assert.deepEqual(rulesFor(null),[]);
});
test('website edits cap each session at three, preserve deadline, and prevent rotating sites', () => {
  let control = {version:1,revision:'one',session:{...session,domains:['chatgpt.com']}};
  control = editWebsites(control,'https://PARMAR.com/lecture',false,2000);
  control = editWebsites(control,'example.org',false,2000);
  assert.deepEqual(control.session.domains,['chatgpt.com','parmar.com','example.org']);
  assert.equal(control.session.endsAt,session.endsAt);assert.equal(control.session.startedAt,session.startedAt);assert.equal(control.session.id,session.id);
  assert.throws(()=>editWebsites(control,'fourth.org',false,2000),/Maximum 3/);
  assert.throws(()=>editWebsites(control,'parmar.com',true,2000),/locked/);
  assert.equal(editWebsites(control,'parmar.com',false,2000).session.domains.length,3);
  const draft=editWebsites(control,'parmar.com',true,62000);assert.equal(draft.session,null);assert.deepEqual(draft.allowedDomains,['chatgpt.com','example.org']);
});

test("YouTube is an ordinary website and channel IDs are no longer accepted",()=>{const control=editWebsites({session:null},"youtube.com",false,1000);assert.deepEqual(startControl(control,40,1000).session.domains,["youtube.com"]);assert.throws(()=>editWebsites(control,"UC"+"a".repeat(22),false,1000));assert.equal(rulesFor(startControl(control,40,1000).session).length,2);});
