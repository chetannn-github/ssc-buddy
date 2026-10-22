import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker-engine.js';
import { encode, decodeDocument } from './firestore-codec.js';
import { MAX_STUDY_WEBSITES } from '../shared/study-selection.ts';
const wait = async check => { for(let i=0;i<100;i++){ if(check()) return; await new Promise(r=>setTimeout(r,5)); } throw Error('Worker did not settle'); };
test('Firebase Firestore REST values preserve the shared session contract', () => {
  const value={version:1,revision:'one',session:{id:'s',startedAt:1000,endsAt:61000,domains:['chatgpt.com']}};
  assert.deepEqual(decodeDocument({fields:encode(value).mapValue.fields}),value);
  assert.equal(decodeDocument({fields:{lastSeenAt:{timestampValue:'2026-10-22T00:00:00Z'}}}).lastSeenAt,Date.parse('2026-10-22T00:00:00Z'));
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
