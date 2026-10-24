import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker-engine.js';
import { encode, decodeDocument } from './firestore-codec.js';
import { MAX_STUDY_WEBSITES } from '../shared/study-selection.ts';
import { beginStudyBreak } from '../shared/study-breaks.ts';
const wait = async check => { for(let i=0;i<100;i++){ if(check()) return; await new Promise(r=>setTimeout(r,5)); } throw Error('Worker did not settle'); };

test('listener-backed schedule publishes once and eight hours of timer ticks do not poll or checkpoint', async () => {
  const realNow=Date.now,realInterval=globalThis.setInterval;
  let now=Date.parse('2026-10-19T16:29:00Z'),onAlarm,interval,nextPacket;
  const start=Date.parse('2026-10-19T16:30:00Z'),end=Date.parse('2026-10-20T00:30:00Z');
  const schedule={id:'sleep',name:'Sleep',weekdays:[1],startMinute:1320,endMinute:360,timeZone:'Asia/Kolkata',appLimit:0,domains:['study.example'],enabled:true,createdAt:0};
  let packet={version:1,revision:'saved',session:null,focusSchedules:[schedule]};
  const data={},rules=[],counts={reads:0,credits:0,acks:0};
  const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
  Date.now=()=>now;globalThis.setInterval=fn=>{interval=fn;return 1;};
  globalThis.chrome={
    runtime:{getURL:p=>`chrome-extension://test/${p}`,onMessage:{addListener:()=>{}}},
    storage:{local:{get:async()=>structuredClone(data),set:async value=>Object.assign(data,structuredClone(value)),setAccessLevel:async()=>{}}},
    declarativeNetRequest:{getSessionRules:async()=>[],updateSessionRules:async()=>{},updateDynamicRules:async value=>rules.splice(0,rules.length,...value.addRules)},
    alarms:{clear:async()=>{},create:async()=>{},onAlarm:{addListener:fn=>onAlarm=fn}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    tabs:{query:async()=>[],update:async()=>{}},
  };
  const cloud={ready:Promise.resolve(),user:()=>({uid:'student'}),subscribe:()=>()=>{},
    watch:(_uid,next)=>{nextPacket=next;queueMicrotask(()=>next(structuredClone(packet)));return()=>{};},
    read:async()=>{counts.reads++;packet={...packet,revision:'server-start',session:{id:`schedule-sleep-${start}`,startedAt:start,endsAt:end,domains:schedule.domains,timeZone:schedule.timeZone,appLimit:0,breakLimit:0,breaksTaken:0}};queueMicrotask(()=>nextPacket(structuredClone(packet)));return structuredClone(packet);},
    acknowledge:async()=>{counts.acks++;},recordFocus:async()=>{counts.credits++;},
  };
  try{
    startWorker(cloud);await flush();assert.equal(counts.reads,0);
    now=start;onAlarm({name:'focus-schedule'});await flush();
    assert.equal(counts.reads,1);assert.equal(data.study.revision,'server-start');assert.equal(rules.length,2);
    const baseline={...counts};
    for(let tick=1;tick<2880;tick++){now=start+tick*10000;interval();await flush();}
    assert.deepEqual(counts,baseline,'no running control reads, credits or acknowledgements');
    now=end;onAlarm({name:'study-end'});await flush();
    assert.equal(counts.reads,1);assert.equal(counts.credits,1);assert.equal(rules.length,0);
  }finally{Date.now=realNow;globalThis.setInterval=realInterval;delete globalThis.chrome;}
});

test('cached schedules start offline at the original deadline and finish locally', async () => {
  const realNow=Date.now,realInterval=globalThis.setInterval;
  let now=Date.parse('2026-10-19T16:29:00Z'),onAlarm;
  const start=Date.parse('2026-10-19T16:30:00Z'),end=Date.parse('2026-10-20T00:30:00Z');
  const schedule={id:'sleep',name:'Sleep',weekdays:[1],startMinute:1320,endMinute:360,timeZone:'Asia/Kolkata',appLimit:0,domains:['study.example'],enabled:true,createdAt:0};
  const data={study:{uid:'student',revision:'saved',session:null},focusScheduleCache:{uid:'student',items:[schedule]}},rules=[],alarms=[],redirected=[];
  Date.now=()=>now;globalThis.setInterval=()=>({unref(){}});
  globalThis.chrome={
    runtime:{getURL:p=>`chrome-extension://test/${p}`,onMessage:{addListener:()=>{}}},
    storage:{local:{get:async()=>structuredClone(data),set:async value=>Object.assign(data,structuredClone(value)),setAccessLevel:async()=>{}}},
    declarativeNetRequest:{getSessionRules:async()=>[],updateSessionRules:async()=>{},updateDynamicRules:async value=>rules.splice(0,rules.length,...value.addRules)},
    alarms:{clear:async()=>{},create:async(name,value)=>alarms.push({name,...value}),onAlarm:{addListener:fn=>onAlarm=fn}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    tabs:{query:async()=>[{id:1,url:'https://social.example/'}],update:async(id,value)=>redirected.push({id,...value})},
  };
  try{
    startWorker({ready:Promise.resolve(),user:()=>null,subscribe:()=>{}});
    await wait(()=>alarms.some(item=>item.name==='focus-schedule'));
    assert.equal(alarms.find(item=>item.name==='focus-schedule').when,start);
    assert.equal(rules.length,0);
    now=start+60000;onAlarm({name:'focus-schedule'});
    await wait(()=>data.study.session?.id===`schedule-sleep-${start}`);
    assert.equal(data.study.session.endsAt,end);assert.equal(data.study.session.startedAt,start);
    assert.equal(data.study.session.breakLimit,0);assert.equal(rules.length,2);
    await wait(()=>redirected.length===1);
    now=end;onAlarm({name:'study-end'});await wait(()=>data.study.session===null);
    assert.equal(rules.length,0);
  }finally{Date.now=realNow;globalThis.setInterval=realInterval;delete globalThis.chrome;}
});
test('Firebase Firestore REST values preserve the shared session contract', () => {
  const value={version:1,revision:'one',session:{id:'s',startedAt:1000,endsAt:61000,domains:['chatgpt.com']}};
  assert.deepEqual(decodeDocument({fields:encode(value).mapValue.fields}),value);
  assert.equal(decodeDocument({fields:{lastSeenAt:{timestampValue:'2026-10-22T00:00:00Z'}}}).lastSeenAt,Date.parse('2026-10-22T00:00:00Z'));
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

test('7-hour listener-driven session has no polling reads, heartbeat writes or running credit writes; survives worker restart', async () => {
  const realNow = Date.now, realInterval = globalThis.setInterval;
  let now = Date.parse('2026-10-19T10:00:00Z'), interval, nextPacket, failedWatch, onMessage;
  const data = {}, rules = [], counters = {reads:0, acks:0, credits:0, watches:0};
  const packet = {version:1, revision:'long-session', session:{id:'long', startedAt:now, endsAt:now+7*3600000, domains:['study.example'], timeZone:'UTC'}};
  const flush = async () => { for (let i=0;i<12;i++) await new Promise(resolve => setImmediate(resolve)); };
  Date.now = () => now;
  globalThis.setInterval = callback => { interval = callback; return 1; };
  globalThis.chrome = {
    runtime:{id:'test',getURL:p=>`chrome-extension://test/${p}`,onMessage:{addListener:fn=>{onMessage=fn;}}},
    storage:{local:{get:async()=>structuredClone(data),set:async value=>Object.assign(data,structuredClone(value)),setAccessLevel:async()=>{}}},
    declarativeNetRequest:{getSessionRules:async()=>[],updateSessionRules:async()=>{},updateDynamicRules:async value=>rules.splice(0,rules.length,...value.addRules)},
    alarms:{clear:async()=>{},create:async()=>{},onAlarm:{addListener:()=>{}}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    tabs:{query:async()=>[],update:async()=>{}},
  };
  const cloud = {
    ready:Promise.resolve(),user:()=>({uid:'student'}),subscribe:()=>()=>{},
    watch:(_uid,next,failed)=>{counters.watches++;nextPacket=next;failedWatch=failed;queueMicrotask(()=>next(structuredClone(packet)));return()=>{};},
    read:async()=>{counters.reads++;return structuredClone(packet);},
    acknowledge:async()=>{counters.acks++;},recordFocus:async()=>{counters.credits++;},
  };
  try {
    startWorker(cloud); await flush();
    assert.equal(counters.watches,1); assert.equal(counters.acks,1);
    assert.equal(rules.length,2);
    for(let tick=1;tick<2520;tick++){now=packet.session.startedAt+tick*10000;interval();await flush();}
    assert.deepEqual(counters,{reads:0,acks:1,credits:0,watches:1});
    assert.deepEqual(data.websiteDraft.domains,['study.example'],'local maintenance never clears the saved website draft');
    now=packet.session.endsAt;interval();await flush();
    assert.equal(rules.length,0);assert.equal(data.study.session,null);
    assert.equal(counters.credits,1);assert.equal(counters.acks,2);
    startWorker(cloud);await flush();
    assert.equal(counters.credits,1,'persisted receipt prevents final publication again after worker cold start');
    assert.equal(counters.reads,0);
    // A listener error is retried, rather than permanently losing remote updates.
    failedWatch(Error('offline'));interval();await flush();
    assert.equal(counters.watches,2,'failed listener waits before retrying');
    now+=30000;interval();await flush();
    assert.equal(counters.watches,3);
    // Explicit refresh remains a server read on demand.
    await new Promise(resolve=>onMessage({type:'sync'},{id:'test',url:chrome.runtime.getURL('popup.html')},resolve));
    assert.equal(counters.reads,1);
  } finally {Date.now=realNow;globalThis.setInterval=realInterval;delete globalThis.chrome;}
});

test('listener start/break events unlock immediately and local alarm resumes offline without a cloud read', async () => {
  const realNow=Date.now,realInterval=globalThis.setInterval;
  let now=Date.parse('2026-10-19T10:00:00Z'),nextPacket,onAlarm,interval;
  const initial={id:'break-flow',startedAt:now,endsAt:now+120*60000,domains:['study.example'],timeZone:'UTC',breakLimit:1,breaksTaken:0};
  let packet={version:1,revision:'start',session:initial};
  const data={},rules=[],credits=[],acks=[];
  const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
  Date.now=()=>now;globalThis.setInterval=fn=>{interval=fn;return 1;};
  globalThis.chrome={
    runtime:{id:'test',getURL:p=>`chrome-extension://test/${p}`,onMessage:{addListener:()=>{}}},
    storage:{local:{get:async()=>structuredClone(data),set:async value=>Object.assign(data,structuredClone(value)),setAccessLevel:async()=>{}}},
    declarativeNetRequest:{getSessionRules:async()=>[],updateSessionRules:async()=>{},updateDynamicRules:async value=>rules.splice(0,rules.length,...value.addRules)},
    alarms:{clear:async()=>{},create:async()=>{},onAlarm:{addListener:fn=>{onAlarm=fn;}}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},tabs:{query:async()=>[],update:async()=>{}},
  };
  const cloud={ready:Promise.resolve(),user:()=>({uid:'student'}),subscribe:()=>()=>{},
    watch:(_uid,next)=>{nextPacket=next;queueMicrotask(()=>next(structuredClone(packet)));return()=>{};},
    read:async()=>{throw Error('unexpected polling read');},
    acknowledge:async(_id,id)=>{acks.push(id);},recordFocus:async s=>{credits.push(s);},
  };
  try {
    startWorker(cloud);await flush();assert.equal(rules.length,2);
    now+=30*60000;packet={...packet,revision:'break',session:beginStudyBreak(initial,now)};
    nextPacket(structuredClone(packet));await flush();assert.equal(rules.length,0);assert.equal(credits.length,1);
    for(let i=0;i<5;i++){now+=60000;interval();await flush();}
    assert.equal(credits.length,1,'break duration causes no repeated credit or heartbeat');
    now=packet.session.breakUntil;onAlarm({name:'study-end'});await flush();
    assert.equal(rules.length,2,'offline break expires with local rules reinstalled');
    assert.equal(data.study.session.startedAt,packet.session.breakUntil);
    assert.equal(data.study.session.endsAt,initial.endsAt+600000);
    now=data.study.session.endsAt;onAlarm({name:'study-end'});await flush();
    assert.equal(rules.length,0);assert.equal(credits.length,2);
    assert.equal(credits[0].pausedAt-credits[0].startedAt,30*60000);
    assert.equal(credits[1].endsAt-credits[1].startedAt,90*60000);
    assert.equal(acks.length,4,'one acknowledgement for start, break, local resume and expiry');
  } finally {Date.now=realNow;globalThis.setInterval=realInterval;delete globalThis.chrome;}
});
