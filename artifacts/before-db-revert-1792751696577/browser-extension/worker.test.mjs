import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker-engine.js';
import { encode, decodeDocument } from './firestore-codec.js';
import { MAX_STUDY_WEBSITES } from '../shared/study-selection.ts';
import { beginStudyBreak } from '../shared/study-breaks.ts';
import { STUDY_HEARTBEAT_MS } from '../shared/study-presence.ts';
const wait = async check => { for(let i=0;i<100;i++){ if(check()) return; await new Promise(r=>setTimeout(r,5)); } throw Error('Worker did not settle'); };

test('live session updates replace polling; seven-hour heartbeats are throttled and survive worker restart', async () => {
  const realNow = Date.now, realInterval = globalThis.setInterval;
  let now = realNow(), intervalCalls = 0, reads = 0, watches = 0, onAlarm, onMessage, push, failAck = false;
  const data = {}, acknowledgements = [], rules = [];
  const user = { uid: 'student' };
  let packet = { version: 1, revision: 'idle', session: null, allowedDomains: ['study.example'] };
  const cloud = {
    ready: Promise.resolve(), user: () => user, subscribe: () => {},
    watchControl: callback => { watches++; push = callback; queueMicrotask(() => callback(structuredClone(packet))); return () => {}; },
    read: async () => { reads++; return structuredClone(packet); },
    acknowledge: async (id, sessionId) => { if (failAck) throw Error('Offline'); acknowledgements.push({ id, sessionId, at: now }); },
  };
  Date.now = () => now;
  globalThis.setInterval = () => { intervalCalls++; return 0; };
  globalThis.chrome = {
    runtime: { id: 'test', getURL: p => `chrome-extension://test/${p}`, onMessage: { addListener: fn => onMessage = fn } },
    storage: { local: { get: async () => structuredClone(data), set: async value => Object.assign(data, structuredClone(value)), setAccessLevel: async () => {} } },
    declarativeNetRequest: { getSessionRules: async () => [], updateSessionRules: async () => {}, updateDynamicRules: async value => rules.splice(0, rules.length, ...value.addRules) },
    alarms: { clear: async () => {}, create: async () => {}, onAlarm: { addListener: fn => onAlarm = fn } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { query: async () => [], update: async () => {} },
  };
  const message = type => new Promise(resolve => onMessage({ type }, { id: 'test', url: chrome.runtime.getURL('popup.html') }, resolve));
  try {
    startWorker(cloud);
    await wait(() => !!data.studyHeartbeat);
    for (let i = 0; i < 60; i++) { now += 60000; await onAlarm({ name: 'study-watch' }); }
    assert.equal(reads, 0, 'idle watchdog never polls the control document');
    assert.equal(acknowledgements.length, 1, 'idle registration has no periodic write');
    assert.equal(watches, 1);
    assert.equal(intervalCalls, 0, '10-second polling interval removed');

    const startedAt = now;
    packet = { ...packet, revision: 'start', session: { id: 'seven-hours', startedAt, endsAt: now + 420 * 60000, domains: ['study.example'], breakLimit: 3, breaksTaken: 0 } };
    push(structuredClone(packet));
    await wait(() => data.studyHeartbeat.state.includes('seven-hours'));
    assert.equal(rules.length, 2, 'remote session start enforced without polling');
    const atStart = acknowledgements.length;
    for (let i = 1; i < 420; i++) { now = startedAt + i * 60000; await onAlarm({ name: 'study-watch' }); }
    assert.equal(acknowledgements.length - atStart, 83, 'one heartbeat per five minutes across seven hours');
    now = startedAt + 420 * 60000;
    await onAlarm({ name: 'study-end' });
    assert.equal(rules.length, 0);
    assert.equal(data.study.session, null);
    assert.equal(acknowledgements.at(-1).sessionId, null, 'completion acknowledged immediately');
    const completedCount = acknowledgements.length;
    startWorker(cloud); // Same durable storage, fresh in-memory heartbeat state.
    await wait(() => watches === 2);
    await onAlarm({ name: 'study-watch' });
    assert.equal(acknowledgements.length, completedCount, 'restart does not duplicate idle acknowledgement');
    assert.equal(reads, 0);

    packet = { ...packet, revision: 'next', session: { id: 'next', startedAt: now, endsAt: now + 120 * 60000, domains: ['study.example'], breakLimit: 3, breaksTaken: 0 } };
    push(structuredClone(packet));
    await wait(() => data.studyHeartbeat.state.includes('next'));
    now += 30 * 60000;
    packet = { ...packet, revision: 'break', session: beginStudyBreak(packet.session, now) };
    push(structuredClone(packet));
    await wait(() => data.study.session?.paused && rules.length === 0);
    await onAlarm({ name: 'study-watch' });
    assert.equal(data.studyHeartbeat.state.includes('true'), true, 'break state acknowledged without a five-minute wait');
    now = packet.session.breakUntil;
    await onAlarm({ name: 'study-end' });
    assert.equal(rules.length, 2);
    assert.equal(data.studyHeartbeat.state.includes('false'), true, 'auto-resume acknowledged immediately');

    now += STUDY_HEARTBEAT_MS;
    failAck = true;
    const lastHeartbeat = structuredClone(data.studyHeartbeat);
    await onAlarm({ name: 'study-watch' });
    assert.deepEqual(data.studyHeartbeat, lastHeartbeat, 'failed heartbeat is never marked successful');
    failAck = false;
    await onAlarm({ name: 'study-watch' });
    assert.equal(data.studyHeartbeat.at, now, 'failed writes retry on the next watchdog');
    assert.equal((await message('sync')).ok, true);
    assert.equal(reads, 1, 'explicit Refresh still fetches fresh cloud state');
  } finally { Date.now = realNow; globalThis.setInterval = realInterval; delete globalThis.chrome; }
});
test('Firebase Firestore REST values preserve the shared session contract', () => {
  const value={version:1,revision:'one',session:{id:'s',startedAt:1000,endsAt:61000,domains:['chatgpt.com']}};
  assert.deepEqual(decodeDocument({fields:encode(value).mapValue.fields}),value);
  assert.equal(decodeDocument({fields:{lastSeenAt:{timestampValue:'2026-10-22T00:00:00Z'}}}).lastSeenAt,Date.parse('2026-10-22T00:00:00Z'));
});

test('slow stats save cannot drop a rapid remote break/resume transition', async () => {
  const realNow = Date.now;
  const start = realNow() - 50 * 60000;
  Date.now = () => start + 50 * 60000;
  const running = { id: 'slow-session', startedAt: start, endsAt: start + 120 * 60000, domains: ['study.example'], breakLimit: 3, breaksTaken: 0 };
  // Compatibility with a pause packet from a previously installed client.
  const paused = { ...running, paused: true, pausedAt: start + 30 * 60000, remainingMs: 90 * 60000 };
  const resumed = { id: 'slow-session:focus-1', lockId: 'slow-session', startedAt: start + 40 * 60000, endsAt: start + 130 * 60000, domains: running.domains, breakLimit: 3, breaksTaken: 1 };
  const data = {}, saved = [], acks = [];
  let push, release, alarm;
  const cloud = {
    ready: Promise.resolve(), user: () => ({ uid: 'student' }), subscribe: () => {},
    watchControl: callback => { push = callback; queueMicrotask(() => callback({ version: 1, revision: 'start', session: running })); return () => {}; },
    acknowledge: async (_id, sessionId) => acks.push(sessionId),
    recordFocus: async session => {
      saved.push(structuredClone(session));
      if (saved.length === 1) await new Promise(resolve => { release = resolve; });
    },
  };
  globalThis.chrome = {
    runtime: { getURL: p => `chrome-extension://test/${p}`, onMessage: { addListener: () => {} } },
    storage: { local: { get: async () => structuredClone(data), set: async value => Object.assign(data, structuredClone(value)), setAccessLevel: async () => {} } },
    declarativeNetRequest: { getSessionRules: async () => [], updateSessionRules: async () => {}, updateDynamicRules: async () => {} },
    alarms: { clear: async () => {}, create: async () => {}, onAlarm: { addListener: callback => alarm = callback } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { query: async () => [] },
  };
  try {
    startWorker(cloud);
    await wait(() => !!release);
    push({ version: 1, revision: 'break', session: paused });
    push({ version: 1, revision: 'resume', session: resumed });
    release();
    await wait(() => data.study.session.id === resumed.id);
    await alarm({ name: 'study-watch' });
    assert.equal(saved.some(session => session.paused && session.pausedAt === paused.pausedAt), true, 'paused segment must be saved before the resume');
    assert.equal(acks.length, 3, 'start, break and resume each acknowledged in order');
    assert.equal(saved.filter(session => session.id === running.id).every((session, index) => index === 0 || session.paused), true, 'old running segment is never queued across the skipped break');
    assert.equal(data.pendingFocus.length, 0, 'finalized paused credit drained successfully');
  } finally { release?.(); Date.now = realNow; delete globalThis.chrome; }
});

test('offline break expiry reinstalls rules and covers a disallowed website already open', async () => {
  const realNow = Date.now, realInterval = globalThis.setInterval;
  const start = realNow() - 35 * 60000;
  const paused = beginStudyBreak({ id: 'break-test', startedAt: start, endsAt: start + 120 * 60000, domains: ['study.example'], breakLimit: 3, breaksTaken: 0 }, start + 30 * 60000);
  let now = start + 35 * 60000, onAlarm;
  const data = { study: { uid: 'student', revision: 'break', session: paused } }, rules = [], redirected = [], alarms = [];
  Date.now = () => now;
  globalThis.setInterval = () => ({ unref() {} });
  globalThis.chrome = {
    runtime: { getURL: p => `chrome-extension://test/${p}`, onMessage: { addListener: () => {} } },
    storage: { local: { get: async () => structuredClone(data), set: async value => Object.assign(data, structuredClone(value)), setAccessLevel: async () => {} } },
    declarativeNetRequest: { getSessionRules: async () => [], updateSessionRules: async () => {}, updateDynamicRules: async value => rules.splice(0, rules.length, ...value.addRules) },
    alarms: { clear: async () => {}, create: async (name, value) => alarms.push({ name, ...value }), onAlarm: { addListener: fn => onAlarm = fn } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { query: async () => [{ id: 1, url: 'https://social.example/' }, { id: 2, url: 'https://study.example/' }], update: async (id, value) => redirected.push({ id, ...value }) },
  };
  try {
    startWorker({ ready: Promise.resolve(), user: () => null, subscribe: () => {} });
    await wait(() => alarms.some(a => a.name === 'study-end'));
    assert.equal(rules.length, 0, 'websites unlock during the break');
    assert.equal(redirected.length, 0);
    assert.equal(alarms.find(a => a.name === 'study-end').when, paused.breakUntil);
    now = paused.breakUntil;
    onAlarm({ name: 'study-end' });
    await wait(() => redirected.length === 1);
    assert.equal(rules.length, 2);
    assert.equal(redirected[0].id, 1);
    assert.equal(data.study.session.paused, undefined);
    assert.equal(data.study.session.startedAt, paused.breakUntil);
    assert.equal(data.study.session.endsAt, start + 130 * 60000);
  } finally { Date.now = realNow; globalThis.setInterval = realInterval; delete globalThis.chrome; }
});
test('cloud-driven rules acknowledge after enforcement and survive Firebase outage until local expiry', async () => {
  const realInterval=globalThis.setInterval, timers=[];
  globalThis.setInterval=(...args)=>{const timer=realInterval(...args);timer.unref();timers.push(timer);return timer;};
  const data={},rules=[],acks=[],redirected=[];let onMessage,onAlarm,fail=false,offline=false;
  let packet={version:1,revision:'one',session:{id:'session',startedAt:Date.now()-120000,endsAt:Date.now()+60000,domains:['chatgpt.com']}};
  let signedIn=false;
  const user={uid:'test-user',email:'test@example.org'};
  const cloud={ready:Promise.resolve(),user:()=>signedIn?user:null,subscribe:()=>()=>{},read:async()=>{if(offline)throw Error('Offline');return structuredClone(packet);},acknowledge:async(id,sessionId)=>acks.push({id,sessionId}),login:async()=>{},logout:async()=>{throw Error('Should remain locked');}};
  globalThis.chrome={
    webNavigation:{onBeforeNavigate:{addListener:()=>{}},onHistoryStateUpdated:{addListener:()=>{}}},
    runtime:{id:'a'.repeat(32),getURL:p=>`chrome-extension://${'a'.repeat(32)}/${p}`,onMessage:{addListener:f=>onMessage=f}},
    storage:{local:{get:async()=>structuredClone(data),set:async value=>Object.assign(data,structuredClone(value)),setAccessLevel:async()=>{}}},
    declarativeNetRequest:{getSessionRules:async()=>[],updateSessionRules:async()=>{},updateDynamicRules:async update=>{if(fail)throw Error('Rule installation failed');rules.splice(0,rules.length,...update.addRules);}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    alarms:{clear:async()=>{},create:async()=>{},onAlarm:{addListener:f=>onAlarm=f}},
    tabs:{onRemoved:{addListener:()=>{}},query:async()=>[{id:1,url:'https://chatgpt.com/'},{id:2,url:'https://social.example/'},{id:3,url:'chrome://settings'}],update:async(id,value)=>redirected.push({id,...value})}
  };
  try {
    startWorker(cloud);await wait(()=>!!onMessage);
    const message=(type,extra={},page='popup.html')=>new Promise(resolve=>onMessage({type,...extra},{id:chrome.runtime.id,url:chrome.runtime.getURL(page)},resolve));
    const signedOut=await message('status');assert.equal(signedOut.ok,true);assert.deepEqual(signedOut.domains,[]);
    signedIn=true;await message('sync');await wait(()=>acks.length===1);
    assert.equal(rules.length,2);assert.equal(data.study.session.startedAt,packet.session.startedAt);assert.equal(data.study.session.endsAt,packet.session.endsAt,"late browser connection preserves original deadline");assert.equal(data.study.uid,user.uid);assert.deepEqual(redirected.map(t=>t.id),[2]);assert.equal(acks[0].sessionId,'session');
    assert.equal(onMessage({type:'status'},{id:chrome.runtime.id,url:'https://evil.example'},()=>assert.fail('Untrusted message')),undefined);
    assert.equal((await message('logout')).ok,false);
    assert.equal((await message('login',{email:'other@example.org',password:'x'},'blocked.html')).ok,false);
    let activeUrl='https://parmar.com/lecture?topic=1';
    const query=chrome.tabs.query;
    chrome.tabs.query=async options=>options.active?[{id:7,url:activeUrl}]:query(options);
    cloud.editWebsite=async domain=>{assert.equal(domain,'parmar.com');packet={...packet,revision:'current-site',session:{...packet.session,domains:[...packet.session.domains,domain]}};};
    assert.equal((await message('status')).currentSite.domain,'parmar.com');
    assert.equal((await message('current-add',{domain:'evil.org'})).ok,true);
    assert.deepEqual(data.study.session.domains,['chatgpt.com','parmar.com'],'current tab URL is used instead of user-supplied domain');
    activeUrl=chrome.runtime.getURL('blocked.html')+'#site='+encodeURIComponent('https://instagram.com/reels/');
    assert.equal((await message('status')).currentSite.canAdd,false);
    assert.equal((await message('current-add')).ok,false);
    activeUrl='https://www.youtube.com/shorts/shorts00001';assert.equal((await message('status')).currentSite.canAdd,data.study.session.domains.length < MAX_STUDY_WEBSITES);
    activeUrl='chrome://settings/';assert.equal((await message('status')).currentSite,null);
    const acknowledged=acks.length;
    packet={...packet,revision:'early-stop',session:null};await message('sync');assert.equal(data.study.session.id,'session');assert.equal(rules.length,2);
    fail=true;packet={version:1,revision:'two',session:{id:'session',startedAt:data.study.session.startedAt,endsAt:data.study.session.endsAt,domains:['chatgpt.com','parmar.com','example.org']}};await message('sync');assert.equal(acks.length,acknowledged,'failed rule installation is not acknowledged');assert.equal(data.study.session.id,'session');fail=false;
    offline=true;await message('sync');assert.equal(rules.length,2);assert.equal(data.study.session.id,'session');
    data.study.session.endsAt=Date.now()-1;onAlarm({name:'study-end'});await wait(()=>rules.length===0);assert.equal(data.study.session,null);
  } finally {for(const timer of timers)clearInterval(timer);globalThis.setInterval=realInterval;delete globalThis.chrome;}
});
