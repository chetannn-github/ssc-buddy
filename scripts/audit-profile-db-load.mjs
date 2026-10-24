import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';

// Actual helper/hook bodies, mocked SDK/React boundaries; no billing simulation.
const root=process.cwd();
const read=path=>readFileSync(resolve(root,path),'utf8');
const fixed='2026-10-24T12:00:00+05:30';
class AuditDate extends Date { constructor(...args) { super(...(args.length?args:[fixed])); } static now(){ return new Date(fixed).getTime(); } }
function harness(firstState){
  const targets=[], cleanups=[], timers=[], writes=[], reads=[];
  const database={};
  let stateIndex=0;
  const react={useState:initial=>[stateIndex++===0&&firstState!==undefined?firstState:typeof initial==='function'?initial():initial,()=>{}],useEffect:effect=>{const stop=effect();if(stop)cleanups.push(stop);}};
  const sdk={collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>parts.join('/'),
    getDocs:async path=>{reads.push(path);return {docs:[]};},getDoc:async path=>{reads.push(path);return {data:()=>undefined};},
    onSnapshot:(path,callback,error)=>{const target={path,active:true,callback,error};targets.push(target);callback({docs:[],data:()=>undefined});return()=>{target.active=false;};},
    serverTimestamp:()=> 'timestamp',setDoc:async(...args)=>writes.push(args),
    runTransaction:async(_db,callback)=>callback({get:async ref=>{reads.push(ref);return{data:()=>({uid:'viewer',username:'viewer'}),exists:()=>true};},set:(...args)=>writes.push(args),delete:()=>assert.fail('unexpected delete')}),
  };
  const cache=new Map();
  function evaluate(source,path){
    const exports={};
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(compiled,{exports,require:id=>{
      if(id==='react')return react;
      if(id==='react-native')return{AppState:{addEventListener:()=>({remove(){}})}};
      if(id==='firebase/firestore')return sdk;
      if(id==='@/lib/firebase-sync'||id==='../lib/firebase')return{getFirebaseFirestore:()=>database};
      if(id==='@/lib/leaderboard')return{watchLeaderboard:(week,cb)=>load('shared/profile-data-source.ts').profileDataSource(sdk).watchWeek(database,week,snap=>cb(snap.docs))};
      if(id.startsWith('.'))return load(resolve(dirname(path),id)+(id.endsWith('.ts')?'':'.ts'));
      throw Error(`Unexpected dependency: ${id}`);
    },Date:AuditDate,setInterval:(_fn,delay)=>{timers.push(delay);return timers.length;},clearInterval:()=>{},window:{setInterval:(_fn,delay)=>{timers.push(delay);return timers.length;},clearInterval(){},addEventListener(){},removeEventListener(){}},console});
    return exports;
  }
  function load(path){path=resolve(root,path);if(!cache.has(path))cache.set(path,evaluate(readFileSync(path,'utf8'),path));return cache.get(path);}
  return{load,evaluate,targets,timers,writes,reads,sdk,database,cleanup:()=>cleanups.reverse().forEach(stop=>stop())};
}
for(const [platform,path]of[['web','src/lib/weekly-results.ts'],['app','mobile-tasks/src/hooks/use-weekly-results.ts']]){
  test(`${platform}: one year of medal history uses one-time reads without history listeners`,async()=>{
    const h=harness(),api=h.load(path),domain=h.load('mobile-tasks/src/domain/weekly-results.ts');
    const current=domain.leaderboardWeek(),first=domain.shiftLeaderboardWeek(current,-52);
    api.useWeeklyMedalCounts('viewer',[first]);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.targets.length,0); assert.equal(h.reads.length,52);
    console.log(`${platform}: 52 completed weeks => 52 one-time board reads; zero medal-history listeners.`);
    h.cleanup();assert.ok(h.targets.every(t=>!t.active));
  });
  test(`${platform}: empty dates fetch previous medal once and keep only celebration live`,async()=>{
    const h=harness(),api=h.load(path);api.useWeeklyMedalCounts('viewer',[]);api.usePreviousWeeklyAward('viewer');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.targets.length,1);assert.equal(h.targets[0].path,h.reads[0]);
    h.cleanup();assert.ok(h.targets.every(t=>!t.active));
  });
}
for(const historical of[false,true])test(`leaderboard XP ${historical?'historical':'current'} rows attach public listeners for every listed member`,()=>{
  const h=harness(),api=h.load('shared/create-use-leaderboard-xp.ts');
  const hook=api.createUseLeaderboardXp({collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>parts.join('/'),onSnapshot:(path,callback)=>{
    const target={path,active:true};h.targets.push(target);callback({docs:[],data:()=>undefined});return()=>{target.active=false;};
  }});
  const entries=Array.from({length:20},(_,i)=>({uid:`member-${i}`,username:`member${i}`,xp:100}));
  hook(entries,historical?'2026-10-12':'2026-10-19','2026-10-19',()=>({}));
  assert.equal(h.targets.filter(t=>t.path.startsWith('publicProfiles/')).length,20);
  assert.equal(h.targets.filter(t=>t.path.startsWith('leaderboards/')).length,historical?1:0);
  h.cleanup();assert.ok(h.targets.every(t=>!t.active));
});
test('weekly detail scopes XP to the selected member on web/app/Windows',()=>{
  assert.match(read('src/routes/weekly-stats.$username.tsx'),/useLeaderboardXp\(xpEntry \? \[xpEntry\] : \[\]/);
  assert.match(read('mobile-tasks/src/screens/LeaderboardScreen.tsx'),/useLeaderboardXp\(xpTarget \? \[xpTarget\] : rows/);
  assert.match(read('desktop-widget/src/main.tsx'),/useLeaderboardXp\(\(selected \? \[selected\] : rows\)/);
});
test('unchanged public profile publication performs repeated writes in main baseline',async()=>{
  const h=harness(),source=read('src/lib/firebase-sync.ts');
  const start=source.indexOf('export async function savePublicProfileActivity('),end=source.indexOf('export async function checkUsernameAvailability',start);
  assert.ok(start>=0&&end>start);
  const api=h.evaluate(`import {setDoc,serverTimestamp} from 'firebase/firestore'; const normalizeUsername=v=>v.trim().toLowerCase();const usernameValidationMessage=()=>'';const services=()=>({db:{}});const publicProfileDoc=(_db,name)=>'publicProfiles/'+name;const publicProfileFields=(_u,name,p)=>({...p,username:name});\n${source.slice(start,end)}`,resolve(root,'src/lib/firebase-sync.ts'));
  for(let i=0;i<2;i++)await api.savePublicProfileActivity({uid:'viewer'},{username:'viewer'},{'2026-10-24':1},{records:[],tracker:{},dailyTasks:[]});
  assert.equal(h.writes.length,2);console.log('Repeated identical public publication: two setDoc calls in baseline. Practice branch already contains its optimization.');
});
test('normal username-preserving profile Save verifies ownership and skips unchanged claim write',async()=>{
  const h=harness(),source=read('src/lib/firebase-sync.ts');
  const start=source.indexOf('export async function saveProfileWithUsername('),end=source.indexOf('export async function readSharedData',start);
  assert.ok(start>=0&&end>start);
  const api=h.evaluate(`import {runTransaction,serverTimestamp} from 'firebase/firestore';const normalizeUsername=v=>v.trim().toLowerCase();const usernameValidationMessage=()=>'';const services=()=>({db:{}});const profileDoc=()=> 'profile';const usernameDoc=()=> 'username';const publicProfileDoc=()=> 'public';const publicProfileFields=(_u,name,p)=>({...p,username:name});\n${source.slice(start,end)}`,resolve(root,'src/lib/firebase-sync.ts'));
  await api.saveProfileWithUsername({uid:'viewer'},{username:'viewer',name:'Viewer'});
  assert.equal(h.reads.length,2);assert.equal(h.writes.length,2);
});
test('profile focus hook republishes every positive historical day when the days effect runs',async()=>{
  const days=Object.fromEntries(Array.from({length:30},(_,i)=>[`2026-09-${String(i+1).padStart(2,'0')}`,{totalMilliseconds:60_000,sessionCredits:{}}]));
  const h=harness(days),api=h.load('shared/use-profile-focus.ts'),published=[],stops=[];
  const watch=()=>{const stop={active:true};stops.push(stop);return()=>{stop.active=false;};};
  api.useProfileFocusData(()=>({}),{watchStudyFocusDays:watch,watchStudyControl:watch,watchPublicStudyFocus:watch,publishStudyFocusDay:async(_db,_uid,date)=>published.push(date)},'viewer',undefined,false,()=>true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(published.length,30); assert.equal(stops.length,2); assert.deepEqual(h.timers,[1000]);
  h.cleanup();assert.ok(stops.every(stop=>!stop.active));
  console.log('Profile focus-days effect with 30 positive days: 30 publication calls (each baseline valid-owner transaction reads four documents).');
});
test('shared documents/boards replay only active data and discard after final unsubscribe',()=>{
  const h=harness(),source=h.load('shared/profile-data-source.ts').profileDataSource(h.sdk),a=[],b=[];
  const one=source.watchDocument(h.database,['publicProfiles','alice'],s=>a.push(s.data()));
  const target=h.targets[0]; target.callback({data:()=>({uid:'alice',xp:900})});
  const two=source.watchDocument(h.database,['publicProfiles','alice'],s=>b.push(s.data()));
  assert.equal(h.targets.length,1);assert.equal(b.at(-1).xp,900);one();assert.ok(target.active);two();assert.ok(!target.active);
  const fresh=[];const three=source.watchDocument(h.database,['publicProfiles','alice'],s=>fresh.push(s.data()));
  assert.equal(h.targets.length,2);assert.equal(fresh.at(-1),undefined);
  target.callback({data:()=>({xp:999999})});assert.equal(fresh.at(-1),undefined);three();
});
test('source scopes isolate database instances, private accounts and weeks',()=>{
  const h=harness(),source=h.load('shared/profile-data-source.ts').profileDataSource(h.sdk),stops=[];
  stops.push(source.watchDocument(h.database,['users','alice','profile','current'],()=>{}));
  stops.push(source.watchDocument(h.database,['users','bob','profile','current'],()=>{}));
  stops.push(source.watchDocument({},['users','alice','profile','current'],()=>{}));
  stops.push(source.watchWeek(h.database,'2026-10-12',()=>{}));stops.push(source.watchWeek(h.database,'2026-10-19',()=>{}));
  assert.equal(h.targets.length,5);stops.forEach(stop=>stop());assert.ok(h.targets.every(t=>!t.active));
});
test('terminal listener failure restarts on new subscriber and ignores stale callbacks',()=>{
  const h=harness(),source=h.load('shared/profile-data-source.ts').profileDataSource(h.sdk);let failures=0,latest;
  const a=source.watchWeek(h.database,'2026-10-19',()=>{},()=>failures++);const old=h.targets[0];old.error();assert.equal(failures,1);
  const b=source.watchWeek(h.database,'2026-10-19',s=>latest=s.docs);assert.equal(h.targets.length,2);
  old.callback({docs:[{id:'stale'}]});assert.equal(latest.length,0);a();b();
});
test('concurrent reads coalesce, later reads remain fresh, failures retry and accounts stay isolated',async()=>{
  const h=harness(),source=h.load('shared/profile-data-source.ts').profileDataSource(h.sdk);let count=0,release;
  const reader=()=>{count++;return new Promise(resolve=>release=resolve);};
  const a=source.readWeek(h.database,'2026-10-19',reader,'alice'),b=source.readWeek(h.database,'2026-10-19',reader,'alice');
  await Promise.resolve();assert.equal(count,1);release({docs:[]});await Promise.all([a,b]);
  await source.readWeek(h.database,'2026-10-19',async()=>{count++;return{docs:[]};},'alice');assert.equal(count,2);
  await assert.rejects(source.readWeek(h.database,'2026-10-19',async()=>{throw Error('offline');},'alice'));
  await source.readWeek(h.database,'2026-10-19',async()=>{count++;return{docs:[]};},'alice');assert.equal(count,3);
  const calls=[];await Promise.all(['alice','bob'].map(uid=>source.readWeek(h.database,'2026-10-19',async()=>{calls.push(uid);return{docs:[]};},uid)));assert.equal(calls.length,2);
});
test('medal history schedules at most four reads, cancels further weeks and retries failed weeks',async()=>{
  const h=harness(),{loadMedalHistory}=h.load('shared/load-medal-history.ts');let active=true;const pending=[],emitted=[];
  const job=loadMedalHistory(Array.from({length:52},(_,i)=>String(i)),week=>new Promise(resolve=>pending.push(()=>resolve(week))),(week)=>emitted.push(week),()=>active);
  assert.equal(pending.length,4);active=false;pending.forEach(resolve=>resolve());await job;assert.equal(emitted.length,0);assert.equal(pending.length,4);
  let failed=true;await loadMedalHistory(['one'],async()=>{if(failed)throw Error('offline');return[];},week=>emitted.push(week),()=>true);assert.equal(emitted.length,0);
  failed=false;await loadMedalHistory(['one'],async()=>[],week=>emitted.push(week),()=>true);assert.deepEqual(emitted,['one']);
});
for (const platform of ['web','app']) {
  function saveFixture(initial) {
    const h=harness(),store=new Map(Object.entries(initial)),writes=[],deletes=[];
    let fail=false;
    h.sdk.runTransaction=async(_db,job)=>{
      if(fail)throw Error('network');const pending=[],removed=[];
      await job({get:async ref=>({exists:()=>store.has(ref),data:()=>store.get(ref)}),set:(ref,data)=>pending.push([ref,data]),delete:ref=>removed.push(ref)});
      for(const [ref,data]of pending){store.set(ref,{...store.get(ref),...data});writes.push(ref);}for(const ref of removed){store.delete(ref);deletes.push(ref);}
    };
    const path=platform==='web'?'src/lib/firebase-sync.ts':'mobile-tasks/src/lib/firebase.ts';const source=read(path);
    const start=source.indexOf('export async function saveProfileWithUsername('),end=source.indexOf(platform==='web'?'export async function readSharedData':'const cloudPreferencesDoc',start);
    const api=h.evaluate(`import {runTransaction,serverTimestamp,doc} from 'firebase/firestore';const normalizeUsername=v=>v.trim().toLowerCase();const usernameValidationMessage=v=>/^[a-z0-9._]{3,24}$/.test(v)?'':'invalid';const getFirebaseFirestore=()=>({});const services=()=>({db:{}});const profileDoc=(_db,uid)=>'users/'+uid+'/profile/current';const cloudProfileDoc=u=>profileDoc(null,u.uid);const usernameDoc=(_db,name)=>'usernames/'+name;const publicProfileDoc=(_db,name)=>'publicProfiles/'+name;const publicProfileFields=(_u,name,p)=>({...p,username:name});\n${source.slice(start,end)}`,resolve(root,path));
    return{save:fields=>api.saveProfileWithUsername({uid:'viewer'},fields),store,writes,deletes,fail:value=>fail=value};
  }
  const owned={'users/viewer/profile/current':{username:'viewer',name:'Viewer'},'usernames/viewer':{uid:'viewer',username:'viewer'},'publicProfiles/viewer':{uid:'viewer',focusDays:{'2026-10-19':600000}}};
  test(`${platform}: identical Save keeps public repair but skips private/claim writes; changed preferences save`,async()=>{
    const f=saveFixture(owned);await f.save({username:'viewer',name:'Viewer'});
    assert.deepEqual(f.writes,['publicProfiles/viewer']);assert.ok(f.store.get('publicProfiles/viewer').focusDays);
    f.writes.length=0;await f.save({username:'viewer',name:'Viewer',accentColor:'#ffffff',habitsEnabled:false});
    assert.deepEqual(f.writes,['users/viewer/profile/current','publicProfiles/viewer']);assert.equal(f.store.get('users/viewer/profile/current').habitsEnabled,false);
  });
  test(`${platform}: signup and missing/corrupt own claim still create/repair required documents`,async()=>{
    const first=saveFixture({});await first.save({username:'viewer',name:'Viewer'});assert.equal(first.writes.length,3);
    for(const claim of[undefined,{uid:'viewer',username:'broken'}]){
      const initial={...owned};if(claim)initial['usernames/viewer']=claim;else delete initial['usernames/viewer'];
      const f=saveFixture(initial);await f.save({username:'viewer',name:'Viewer'});assert.equal(f.store.get('usernames/viewer').username,'viewer');assert.ok(f.writes.includes('usernames/viewer'));
    }
  });
  test(`${platform}: renaming preserves atomic claim checks and cleans old names`,async()=>{
    const f=saveFixture(owned);await f.save({username:'newviewer',name:'Viewer'});
    assert.equal(f.store.get('usernames/newviewer').uid,'viewer');assert.equal(f.store.get('users/viewer/profile/current').username,'newviewer');
    assert.deepEqual(f.deletes,['usernames/viewer','publicProfiles/viewer']);
  });
  test(`${platform}: another owner's claim rejects without writes and failures remain retryable`,async()=>{
    const taken=saveFixture({...owned,'usernames/viewer':{uid:'other',username:'viewer'}});
    await assert.rejects(taken.save({username:'viewer',name:'Viewer'}),/taken/);assert.equal(taken.writes.length,0);
    const f=saveFixture(owned);f.fail(true);await assert.rejects(f.save({username:'viewer',name:'Changed'}));f.fail(false);
    await f.save({username:'viewer',name:'Changed'});assert.equal(f.store.get('users/viewer/profile/current').name,'Changed');
  });
}
