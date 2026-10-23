import { useEffect } from "react";
import type { Firestore } from "firebase/firestore";
import type { createStudyController, StudyControl } from "./study-controller";
import { dueFocusOccurrence, focusOccurrences } from "./focus-schedules";
import { effectiveStudySession } from "./study-breaks";

type Reader=Pick<ReturnType<typeof createStudyController>,"watchStudyControl"|"activateDueFocusSchedule">;
/** One existing control listener; wall-clock checks do not poll Firestore. */
export function useFocusScheduleRunner(uid:string|undefined,getDatabase:()=>Firestore,reader:Reader) {
  useEffect(()=>{
    if(!uid)return;
    let stopped=false,busy=false,timer:ReturnType<typeof setTimeout>,control:StudyControl|null=null,retryAt=0,last="";
    const run=()=>{
      clearTimeout(timer);if(stopped)return;
      const now=Date.now(),session=control?.session?effectiveStudySession(control.session,now):null;
      const active=!!session&&(session.paused||session.endsAt>now),schedules=control?.focusSchedules??[];
      const due=dueFocusOccurrence(schedules,now);
      if(due&&!active&&!busy&&last!==due.id&&now>=retryAt){
        busy=true;retryAt=now+30000;
        void reader.activateDueFocusSchedule(getDatabase(),uid).then(session=>{if(session?.id===due.id)last=due.id;}).catch(()=>{retryAt=Date.now()+30000;}).finally(()=>{busy=false;if(!stopped)run();});
      }
      const boundaries=schedules.flatMap(schedule=>focusOccurrences(schedule,now)).flatMap(window=>[window.startedAt,window.endsAt]).filter(time=>time>now);
      if(session&&!session.paused&&session.endsAt>now)boundaries.push(session.endsAt);
      timer=setTimeout(run,Math.max(250,Math.min(60000,(Math.min(...boundaries,retryAt>now?retryAt:Infinity)-now)||60000)));
    };
    const stop=reader.watchStudyControl(getDatabase(),uid,value=>{control=value;run();},()=>{});
    const wake=()=>run();
    if(typeof window!=="undefined")window.addEventListener("focus",wake);
    if(typeof document!=="undefined")document.addEventListener("visibilitychange",wake);
    return()=>{stopped=true;stop();clearTimeout(timer);if(typeof window!=="undefined")window.removeEventListener("focus",wake);if(typeof document!=="undefined")document.removeEventListener("visibilitychange",wake);};
  },[uid,getDatabase,reader]);
}
