import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFocusSchedule, focusScheduleFrozen, nextFocusOccurrence, dueFocusOccurrence, scheduledFocusSession, assertScheduleChange } from '../shared/focus-schedules.ts';
import { createStudyController } from '../shared/study-controller.ts';
import { validSession, startControl } from '../browser-extension/policy.js';

const at=value=>Date.parse(value);
const sleep=()=>normalizeFocusSchedule({id:'sleep',name:'Sleep',weekdays:[1,3,5],startMinute:1320,endMinute:360,timeZone:'Asia/Kolkata',appLimit:0,domains:[],enabled:true,createdAt:0});

test('weekday belongs to start day; overnight window keeps the scheduled timezone and exact deadline',()=>{
  const schedule=sleep(),now=at('2026-10-19T16:30:00Z'); // Monday 10 PM IST
  const occurrence=dueFocusOccurrence([schedule],now);
  assert.equal(occurrence.startedAt,now);assert.equal(occurrence.endsAt,at('2026-10-20T00:30:00Z'));
  assert.equal(occurrence.id,`schedule-sleep-${now}`);
  assert.equal(dueFocusOccurrence([schedule],at('2026-10-20T00:29:59Z')).id,occurrence.id);
  assert.equal(dueFocusOccurrence([schedule],occurrence.endsAt),null);
  assert.equal(nextFocusOccurrence(schedule,occurrence.endsAt).startedAt,at('2026-10-21T16:30:00Z'));
  assert.equal(scheduledFocusSession(occurrence).breakLimit,0);
  assert.equal(validSession(scheduledFocusSession(occurrence),now).appLimit,0);
});
test('edits/deletion/disable lock at exactly 9 PM and unlock only after the 6 AM end',()=>{
  const s=sleep(),freeze=at('2026-10-19T15:30:00Z'),end=at('2026-10-20T00:30:00Z');
  assert.equal(focusScheduleFrozen(s,freeze-1),false);
  for(const now of [freeze,freeze+3600000,end-1]){
    assert.equal(focusScheduleFrozen(s,now),true);
    assert.throws(()=>assertScheduleChange([s],null,s.id,now),/locked/);
    assert.throws(()=>assertScheduleChange([s],{...s,enabled:false},s.id,now),/locked/);
    assert.throws(()=>assertScheduleChange([s],{...s,endMinute:420},s.id,now),/locked/);
  }
  assert.doesNotThrow(()=>assertScheduleChange([s],null,s.id,end));
});
test('schedule validation rejects missing days, invalid times, equal start/end and over-12-hour windows',()=>{
  for(const patch of [{weekdays:[]},{startMinute:1440},{endMinute:1320},{endMinute:720},{appLimit:3},{timeZone:'Not/AZone'}])assert.throws(()=>normalizeFocusSchedule({...sleep(),...patch}));
  assert.equal(normalizeFocusSchedule({...sleep(),weekdays:[1,1,3]}).weekdays.join(','),'1,3');
});
test('overlap detection includes overnight spill but allows touching windows and independent weekdays',()=>{
  const s=sleep(),now=at('2026-10-19T10:00:00Z');
  const morning={...s,id:'morning',weekdays:[2],startMinute:300,endMinute:420};
  assert.throws(()=>assertScheduleChange([s],morning,morning.id,now),/overlaps/);
  assert.doesNotThrow(()=>assertScheduleChange([s],{...morning,startMinute:360},morning.id,now));
  assert.doesNotThrow(()=>assertScheduleChange([s],{...morning,weekdays:[1]},morning.id,now));
});
test('reopening late retains original end, fully missed windows are not replayed and newly created past starts wait',()=>{
  const s=sleep(),late=at('2026-10-19T19:30:00Z');
  assert.equal(dueFocusOccurrence([s],late).endsAt,at('2026-10-20T00:30:00Z'));
  assert.equal(dueFocusOccurrence([s],at('2026-10-20T02:00:00Z')),null);
  assert.equal(dueFocusOccurrence([{...s,createdAt:late}],late),null);
});
test('DST gap and repeated time match Android Calendar wall-clock behavior',()=>{
  const base={...sleep(),weekdays:[0],timeZone:'America/New_York',startMinute:150,endMinute:240};
  const spring=nextFocusOccurrence(base,at('2026-03-08T05:00:00Z'));
  assert.equal(spring.startedAt,at('2026-03-08T07:30:00Z'));assert.equal(spring.endsAt,at('2026-03-08T08:00:00Z'));
  const fall=nextFocusOccurrence({...base,startMinute:90,endMinute:150},at('2026-11-01T04:00:00Z'));
  assert.equal(fall.startedAt,at('2026-11-01T06:30:00Z'));assert.equal(fall.endsAt,at('2026-11-01T07:30:00Z'));
});

function fixture(){
  const docs=new Map(),writes=[];const db={};
  const api={doc:(_, ...parts)=>parts.join('/'),collection:()=>'',onSnapshot:()=>()=>{},serverTimestamp:()=>null,
    runTransaction:async(_,work)=>work({get:async ref=>({data:()=>docs.get(ref)}),set:(ref,value,options)=>{writes.push(ref);docs.set(ref,options?.merge?{...docs.get(ref),...value,focusDays:{...docs.get(ref)?.focusDays,...value.focusDays}}:value);}})};
  return {docs,writes,db,controller:createStudyController(api)};
}
test('save transaction validates frozen server snapshot; defaults no breaks and activation is idempotent',async()=>{
  const f=fixture(),path='users/student/studyLock/current',realNow=Date.now;
  try{
    let now=at('2026-10-19T14:00:00Z');Date.now=()=>now;
    await f.controller.saveFocusSchedule(f.db,'student',sleep(),'sleep');
    assert.equal(f.docs.get(path).session,null);assert.equal(f.docs.get(path).focusSchedules.length,1);
    now=at('2026-10-19T15:30:00Z');
    await assert.rejects(f.controller.saveFocusSchedule(f.db,'student',null,'sleep'),/locked/);
    now=at('2026-10-19T16:30:00Z');
    const session=await f.controller.activateDueFocusSchedule(f.db,'student');
    assert.equal(session.id,`schedule-sleep-${now}`);assert.equal(session.breakLimit,0);assert.equal(session.endsAt,at('2026-10-20T00:30:00Z'));
    const count=f.writes.length;
    await f.controller.activateDueFocusSchedule(f.db,'student');assert.equal(f.writes.length,count);
    await assert.rejects(f.controller.pauseStudySession(f.db,'student'),/No breaks/);
  }finally{Date.now=realNow;}
});
test('ordinary session/website saves preserve schedules, and overlapping manual starts are rejected on every surface',async()=>{
  const f=fixture(),path='users/student/studyLock/current',realNow=Date.now;
  try{
    Date.now=()=>at('2026-10-19T14:00:00Z');
    f.docs.set(path,{version:1,revision:'base',session:null,focusSchedules:[sleep()]});
    await f.controller.saveStudyWebsites(f.db,'student',['study.example']);assert.equal(f.docs.get(path).focusSchedules.length,1);
    await f.controller.startStudySession(f.db,'student',15,['study.example']);assert.equal(f.docs.get(path).focusSchedules.length,1);
    Date.now=()=>at('2026-10-19T16:00:00Z');
    await assert.rejects(f.controller.startStudySession(f.db,'student',60,['study.example']),/overlaps/);
    assert.throws(()=>startControl({...f.docs.get(path),session:null,allowedDomains:['study.example']},60,Date.now()),/overlaps/);
  }finally{Date.now=realNow;}
});
test('late client never weakens a running manual lock and does not double-count its overlapping interval',async()=>{
  const f=fixture(),path='users/student/studyLock/current',realNow=Date.now;
  try{
    let now=at('2026-10-19T16:30:00Z');Date.now=()=>now;
    const manual={id:'manual',startedAt:now-60000,endsAt:now+60000,domains:['study.example']};
    f.docs.set(path,{version:1,revision:'manual',session:manual,focusSchedules:[sleep()]});
    assert.equal((await f.controller.activateDueFocusSchedule(f.db,'student')).id,'manual');
    now=manual.endsAt;
    const next=await f.controller.activateDueFocusSchedule(f.db,'student');
    assert.equal(next.startedAt,manual.endsAt);assert.equal(next.endsAt,at('2026-10-20T00:30:00Z'));
  }finally{Date.now=realNow;}
});
