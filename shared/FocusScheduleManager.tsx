import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { watchStudyControl, saveFocusSchedule } from "./study-lock";
import { focusScheduleFrozen, nextFocusOccurrence, SCHEDULE_PRESETS, scheduleTime, WEEKDAY_LABELS, type FocusSchedule } from "./focus-schedules";
import { studyTimeZone } from "./study-focus";
import { AnimatedChoices } from "./AnimatedChoices";
import "./focus-schedules.css";

export function FocusScheduleManager({uid,getDatabase,domains}:{uid:string;getDatabase:()=>Firestore;domains:string[]}) {
  const [items,setItems]=useState<FocusSchedule[]>([]),[draft,setDraft]=useState<FocusSchedule|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[now,setNow]=useState(Date.now());
  const [preset,setPreset]=useState("Sleep");
  useEffect(()=>watchStudyControl(getDatabase(),uid,value=>setItems(value?.focusSchedules??[]),()=>setError("Could not load schedules.")),[uid,getDatabase]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const fresh=(preset=SCHEDULE_PRESETS[0]!)=>({id:crypto.randomUUID(),name:preset.name,startMinute:preset.startMinute,endMinute:preset.endMinute,weekdays:[0,1,2,3,4,5,6],domains,timeZone:studyTimeZone(),appLimit:0,enabled:true,createdAt:Date.now()});
  const run=async(value:FocusSchedule|null,id:string)=>{setBusy(true);setError("");try{await saveFocusSchedule(getDatabase(),uid,value,id);setDraft(null);}catch(e){setError(e instanceof Error?e.message:"Could not save schedule.");}finally{setBusy(false);}};
  const frozen=!!draft&&!!items.find(item=>item.id===draft.id)&&focusScheduleFrozen(items.find(item=>item.id===draft.id)!,now);
  return <section className="focus-schedules" aria-label="Focus schedules">
    <div className="focus-schedule-heading"><button type="button" disabled={busy} onClick={()=>{setError("");setPreset("Sleep");setDraft(fresh());}}>+ Add schedule</button></div>
    {items.map(item=>{const locked=focusScheduleFrozen(item,now),next=nextFocusOccurrence(item,now);return <div className="focus-schedule-item" key={item.id}>
      <div><b>{item.name}</b><small>{scheduleTime(item.startMinute)}–{scheduleTime(item.endMinute)}{item.endMinute<=item.startMinute?" · next day":""}</small><small>{item.weekdays.map(day=>WEEKDAY_LABELS[day]).join(" · ")}</small>{locked&&<small>Locked until {next?new Date(next.endsAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"session ends"}</small>}</div>
      <button type="button" disabled={busy||locked} onClick={()=>{setError("");setPreset(SCHEDULE_PRESETS.some(p=>p.name===item.name)?item.name:"Custom");setDraft({...item});}}>{locked?"Locked":"Edit"}</button>
    </div>;})}
    {draft&&<div className="focus-schedule-form">
      <AnimatedChoices className="focus-schedule-choice" label="Schedule preset" value={preset} options={SCHEDULE_PRESETS.map(p=>({value:p.name,label:p.name,disabled:busy||frozen}))} onChange={value=>{setPreset(value);setDraft({...draft,...SCHEDULE_PRESETS.find(p=>p.name===value)!});}} />
      <label>Name<input aria-label="Schedule name" maxLength={40} disabled={busy||frozen} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      <div className="focus-schedule-times">{(["startMinute","endMinute"] as const).map(field=><label key={field}>{field==="startMinute"?"Start":"End"}<input type="time" aria-label={field==="startMinute"?"Schedule start":"Schedule end"} value={scheduleTime(draft[field])} disabled={busy||frozen} onChange={e=>{const [hour,minute]=e.target.value.split(":").map(Number);if(Number.isFinite(hour)&&Number.isFinite(minute))setDraft({...draft,[field]:hour!*60+minute!});}}/></label>)}</div>
      <div className="focus-schedule-days">{WEEKDAY_LABELS.map((day,index)=><button type="button" key={day} aria-pressed={draft.weekdays.includes(index)} disabled={busy||frozen} onClick={()=>setDraft({...draft,weekdays:draft.weekdays.includes(index)?draft.weekdays.filter(value=>value!==index):[...draft.weekdays,index]})}>{day}</button>)}</div>
      <div className="focus-schedule-apps"><span>Allowed apps</span><AnimatedChoices className="focus-schedule-choice focus-schedule-app-choice" label="Extra allowed apps" value={String(draft.appLimit)} options={[0,1,2].map(value=>({value:String(value),label:String(value),disabled:busy||frozen}))} onChange={value=>setDraft({...draft,appLimit:Number(value)})}/></div>
      <div className="focus-schedule-actions"><button type="button" onClick={()=>setDraft(null)}>Cancel</button>{items.some(item=>item.id===draft.id)&&<button type="button" disabled={busy||frozen} onClick={()=>void run(null,draft.id)}>Delete</button>}<button type="button" className="focus-schedule-save" disabled={busy||frozen} onClick={()=>void run(draft,draft.id)}>{busy?"Saving…":"Save schedule"}</button></div>
    </div>}
    {!!error&&<p role="alert">{error}</p>}
  </section>;
}
