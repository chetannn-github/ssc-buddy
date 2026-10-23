import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { encode, decodeDocument } from './firestore-codec.js';

const built = await build({configFile:false,logLevel:'silent',define:{__FIREBASE_CONFIG__:JSON.stringify({apiKey:'test',projectId:'test',appId:'test'})},
  plugins:[{name:'mock-sdk',enforce:'pre',resolveId(id){if(id.startsWith('firebase/'))return '\0'+id;},load(id){
    if(id==='\0firebase/app')return 'export const initializeApp = value => value;';
    if(id==='\0firebase/auth/web-extension')return 'export const indexedDBLocalPersistence = {}; export const initializeAuth = () => globalThis.__focusCloud.auth; export const onAuthStateChanged = (auth, next) => { queueMicrotask(() => next(auth.currentUser)); return () => {}; }; export const signInWithEmailAndPassword = () => {}; export const signOut = () => {};';
    if(id==='\0firebase/firestore')return 'export const getFirestore = () => ({}); export const doc = (_, ...path) => path.join("/"); export const onSnapshot = (...args) => globalThis.__focusCloud.listen(...args);';
  }}],build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL('./cloud.js',import.meta.url)),formats:['es']}}});
const output = Array.isArray(built)?built[0]:built;
const { createCloud } = await import('data:text/javascript;base64,'+Buffer.from(output.output.find(item=>item.type==='chunk').code).toString('base64'));

test('scheduled REST activation uses guarded writes, preserves schedules and is idempotent', async () => {
  const realFetch=globalThis.fetch,realNow=Date.now;
  const start=Date.parse('2026-10-19T16:30:00Z');Date.now=()=>start+60000;
  const schedule={id:'sleep',name:'Sleep',weekdays:[1],startMinute:1320,endMinute:360,timeZone:'Asia/Kolkata',domains:['study.example'],appLimit:0,enabled:true,createdAt:0};
  let control={version:1,revision:'saved',session:null,focusSchedules:[schedule],allowedDomains:['study.example']},writes=0,attempts=0,version='one';
  globalThis.__focusCloud={auth:{currentUser:{uid:'student',getIdToken:async()=>'token'}}};
  globalThis.fetch=async(raw,options)=>{
    const url=new URL(raw);assert.ok(url.pathname.endsWith('/users/student/studyLock/current'));
    if(!options.method)return {status:200,ok:true,json:async()=>({fields:encode(control).mapValue.fields,updateTime:version})};
    assert.equal(url.searchParams.get('currentDocument.updateTime'),version);
    if(attempts++===0){version='concurrent-update';return {status:412,ok:false,json:async()=>({})};}
    control=decodeDocument(JSON.parse(options.body));writes++;
    return {status:200,ok:true,json:async()=>({})};
  };
  try{
    const cloud=createCloud();await cloud.ready;
    const first=await cloud.read();
    assert.equal(first.session.id,`schedule-sleep-${start}`);
    assert.equal(first.session.startedAt,start);assert.equal(first.session.endsAt,Date.parse('2026-10-20T00:30:00Z'));
    assert.equal(first.session.breakLimit,0);assert.deepEqual(first.focusSchedules,[schedule]);
    assert.deepEqual(first.allowedDomains,['study.example']);assert.equal(writes,1);assert.equal(attempts,2);
    await cloud.read();assert.equal(writes,1,'already active schedule is not rewritten');
  }finally{globalThis.fetch=realFetch;Date.now=realNow;delete globalThis.__focusCloud;}
});

test('extension SDK watch ignores cached state, delivers verified server packets, reports offline and unsubscribes', async () => {
  let listener, stopped=false;
  globalThis.__focusCloud={auth:{currentUser:{uid:'student'}},listen:(path,options,next)=>{assert.equal(path,'users/student/studyLock/current');assert.equal(options.includeMetadataChanges,true);listener=next;return()=>{stopped=true;};}};
  try {
    const cloud=createCloud(); await cloud.ready;
    const packets=[],connections=[];
    const stop=cloud.watch('student',value=>packets.push(value),assert.fail,value=>connections.push(value));
    const packet={version:1,revision:'server',session:null};
    listener({metadata:{fromCache:true},exists:()=>true,data:()=>packet});
    assert.equal(packets.length,0);
    listener({metadata:{fromCache:false},exists:()=>true,data:()=>packet});
    assert.deepEqual(packets,[packet]);
    globalThis.__focusCloud.auth.currentUser={uid:'other'};
    listener({metadata:{fromCache:false},exists:()=>true,data:()=>packet});
    assert.equal(packets.length,1,'old account snapshot cannot be used after account change');
    assert.deepEqual(connections,[false,true,true]);
    stop();assert.equal(stopped,true);
  } finally {delete globalThis.__focusCloud;}
});

test('REST credit retries recover partial publication without repeatedly writing profile or leaderboard', async () => {
  const realFetch=globalThis.fetch;
  const docs=new Map([
    ['users/student/profile/current',{username:'student'}],
    ['publicProfiles/student',{uid:'student',name:'Student',dashboard:{kept:true},focusDays:{}}],
    ['leaderboards/2026-10-19/entries/student',{points:123,xp:500,completed:2}],
  ]), versions=new Map(), writes=[];
  let failPublication=true;
  globalThis.__focusCloud={auth:{currentUser:{uid:'student',getIdToken:async()=>'test-token'}}};
  globalThis.fetch=async(raw,options)=>{
    const url=new URL(raw), path=decodeURIComponent(url.pathname.split('/documents/')[1]);
    const previous=docs.get(path), version=versions.get(path)??'first';
    if(!options.method)return {status:previous?200:404,ok:true,json:async()=>({fields:encode(previous??{}).mapValue.fields,updateTime:version})};
    if(path.startsWith('publicProfiles/')&&failPublication) return {status:503,ok:false,json:async()=>({})};
    assert.equal(options.headers.Authorization,'Bearer test-token');
    const expected=url.searchParams.get('currentDocument.updateTime');
    if(expected) assert.equal(expected,version,'optimistic concurrency guard preserved');
    const value=decodeDocument(JSON.parse(options.body));
    docs.set(path,{...previous,...value});versions.set(path,String(writes.length));writes.push(path);
    return {status:200,ok:true,json:async()=>({})};
  };
  try {
    const cloud=createCloud();await cloud.ready;
    const startedAt=Date.parse('2026-10-19T10:00:00Z');
    const session={id:'seven-hours',startedAt,endsAt:startedAt+7*3600000,timeZone:'UTC'};
    await assert.rejects(cloud.recordFocus(session,session.endsAt,'student'));
    assert.equal(docs.get('users/student/studyFocusDays/2026-10-19').totalMilliseconds,7*3600000);
    failPublication=false;
    await cloud.recordFocus(session,session.endsAt,'student');
    assert.equal(docs.get('publicProfiles/student').focusDays['2026-10-19'],7*3600000);
    assert.equal(docs.get('publicProfiles/student').dashboard.kept,true);
    const ranking=docs.get('leaderboards/2026-10-19/entries/student');
    assert.equal(ranking.focusXp,42);assert.equal(ranking.points,123);assert.equal(ranking.xp,500);
    const count=writes.length;
    await cloud.recordFocus(session,session.endsAt,'student');
    assert.equal(writes.length,count,'unchanged focus projections generate no writes');
    globalThis.__focusCloud.auth.currentUser={uid:'other'};
    await assert.rejects(cloud.recordFocus(session,session.endsAt,'student'));
    assert.equal(writes.length,count);
  } finally {globalThis.fetch=realFetch;delete globalThis.__focusCloud;}
});
