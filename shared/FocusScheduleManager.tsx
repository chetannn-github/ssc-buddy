import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { watchStudyControl, saveFocusSchedule } from "./study-lock";
import { focusScheduleFrozen, SCHEDULE_PRESETS, scheduleTime, WEEKDAY_LABELS, type FocusSchedule } from "./focus-schedules";
import { studyTimeZone } from "./study-focus";
import { AnimatedChoices } from "./AnimatedChoices";
import { focusSchedulePreviews, isFocusSchedulePreview, focusScheduleIconIndex } from "./focus-schedule-preview";
import { ArrowLeft, Plus, Moon, Sunrise, BookOpen, Coffee, Leaf } from "lucide-react";
import "./focus-schedules.css";
import { useRef } from "react";
import { SlidingHighlight } from "./SlidingHighlight";
import { StudyDurationPicker } from "./StudyDurationPicker";

export function FocusScheduleManager({uid,getDatabase,domains,onBack,onSaved}:{uid:string;getDatabase:()=>Firestore;domains:string[];onBack?:()=>void;onSaved?:()=>void}) {
  const [items,setItems]=useState<FocusSchedule[]>([]),[draft,setDraft]=useState<FocusSchedule|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[now,setNow]=useState(Date.now());
  const [previews,setPreviews]=useState(focusSchedulePreviews);
  const savedRow=useRef<HTMLDivElement>(null);
  const [picking,setPicking]=useState<"startMinute"|"endMinute"|null>(null);
  useEffect(()=>{
    let opened=false;
    return watchStudyControl(getDatabase(),uid,value=>{
      const schedules=value?.focusSchedules??[];setItems(schedules);
      if(!opened){opened=true;const initial=schedules[0]??fresh();setDraft({...initial});}
    },()=>setError("Could not load schedules."));
  },[uid,getDatabase]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const fresh=(preset=SCHEDULE_PRESETS[0]!)=>({id:crypto.randomUUID(),name:preset.name,startMinute:preset.startMinute,endMinute:preset.endMinute,weekdays:[0,1,2,3,4,5,6],domains,timeZone:studyTimeZone(),appLimit:0,enabled:true,createdAt:Date.now()});
  const run=async(value:FocusSchedule|null,id:string)=>{setBusy(true);setError("");try{if(isFocusSchedulePreview(id)){setPreviews(previous=>previous.flatMap(item=>item.id===id?(value?[{...value,enabled:false}]:[]):[item]));}else await saveFocusSchedule(getDatabase(),uid,value,id);setDraft(null);if(value)onSaved?.();}catch(e){setError(e instanceof Error?e.message:"Could not save schedule.");}finally{setBusy(false);}};
  const frozen=!!draft&&!!items.find(item=>item.id===draft.id)&&focusScheduleFrozen(items.find(item=>item.id===draft.id)!,now);
  if(draft&&picking)return <StudyDurationPicker timeOfDay title={picking==="startMinute"?"Start time":"End time"} minutes={draft[picking]} onCancel={()=>setPicking(null)} onConfirm={value=>{if(!frozen)setDraft({...draft,[picking]:value});setPicking(null);}}/>;
  return <section className="focus-schedules" aria-label="Focus schedules">
    <div className="focus-schedule-toolbar">
      {onBack&&<button type="button" className="focus-schedule-icon" aria-label="Back to Focus Lock" onClick={onBack}><ArrowLeft size={19}/></button>}
      <h2 id="browser-study-title">Add schedule</h2>
      <div ref={savedRow} className="focus-schedule-list" aria-label="Saved schedules"><SlidingHighlight container={savedRow} active={draft?.id} color="#f9fcf5" radius={16}/>{[...items,...previews].map(item=>{const Icon=[Moon,Sunrise,BookOpen,Coffee,Leaf][focusScheduleIconIndex(item.id)]!;return <button type="button" data-slide-key={item.id} className="focus-schedule-item" data-schedule-preview={isFocusSchedulePreview(item.id)?"":undefined} aria-label={`Edit ${item.name}`} aria-pressed={draft?.id===item.id} key={item.id} disabled={busy} onClick={()=>{setError("");setDraft({...item});}}>
        <Icon size={14} aria-hidden="true"/><b>{item.name}</b>
      </button>;})}</div>
      <button type="button" className="focus-schedule-icon" aria-label="Add focus schedule" disabled={busy} onClick={()=>{setError("");setDraft(fresh());}}><Plus size={21}/></button>
    </div>
    {draft&&<div className="focus-schedule-form">
      <label>Name<input aria-label="Schedule name" maxLength={40} disabled={busy||frozen} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      <div className="focus-schedule-times">{(["startMinute","endMinute"] as const).map(field=><button type="button" key={field} aria-label={field==="startMinute"?"Schedule start":"Schedule end"} disabled={busy||frozen} onClick={()=>setPicking(field)}><small>{field==="startMinute"?"Start":"End"}</small><strong>{scheduleTime(draft[field])}</strong></button>)}</div>
      <div className="focus-schedule-days">{WEEKDAY_LABELS.map((day,index)=><button type="button" key={day} aria-pressed={draft.weekdays.includes(index)} disabled={busy||frozen} onClick={()=>setDraft({...draft,weekdays:draft.weekdays.includes(index)?draft.weekdays.filter(value=>value!==index):[...draft.weekdays,index]})}>{day}</button>)}</div>
      <div className="focus-schedule-apps"><span>Allowed apps</span><AnimatedChoices className="focus-schedule-choice focus-schedule-app-choice" label="Extra allowed apps" value={String(draft.appLimit)} options={[0,1,2].map(value=>({value:String(value),label:String(value),disabled:busy||frozen}))} onChange={value=>setDraft({...draft,appLimit:Number(value)})}/></div>
      <div className="focus-schedule-actions"><button type="button" onClick={()=>setDraft(null)}>Cancel</button>{[...items,...previews].some(item=>item.id===draft.id)&&<button type="button" disabled={busy||frozen} onClick={()=>void run(null,draft.id)}>Delete</button>}<button type="button" className="focus-schedule-save" disabled={busy||frozen} onClick={()=>void run(draft,draft.id)}>{busy?"Saving…":"Save schedule"}</button></div>
    </div>}
    {!!error&&<p role="alert">{error}</p>}
  </section>;
}
