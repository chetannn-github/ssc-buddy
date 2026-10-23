import { act } from "react";
import { createRoot } from "react-dom/client";
import { FocusScheduleManager } from "../../shared/FocusScheduleManager";
import { useFocusScheduleRunner } from "../../shared/use-focus-schedule-runner";
import * as reader from "../../shared/study-lock";

export async function run() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const originals={now:Date.now,interval:window.setInterval,timeout:window.setTimeout,clearInterval:window.clearInterval,clearTimeout:window.clearTimeout};
  let now=Date.parse("2026-10-19T15:29:59Z"),serial=0,transactions=0;
  const timers=new Map<number,{fn:()=>void;at:number;period?:number}>(),listeners:any[]=[];
  Date.now=()=>now;
  window.setTimeout=((fn:()=>void,delay=0)=>{timers.set(++serial,{fn,at:now+delay});return serial;}) as any;
  window.setInterval=((fn:()=>void,delay=0)=>{timers.set(++serial,{fn,at:now+delay,period:delay});return serial;}) as any;
  window.clearTimeout=window.clearInterval=((id:number)=>timers.delete(id)) as any;
  const schedule={id:"sleep",name:"Sleep",weekdays:[1,3,5],startMinute:1320,endMinute:360,timeZone:"Asia/Kolkata",appLimit:0,domains:[],enabled:true,createdAt:0};
  const path="users/student/studyLock/current",docs=new Map<string,any>([[path,{version:1,revision:"initial",session:null,focusSchedules:[schedule]}]]);
  const snap=(ref:string)=>({exists:()=>docs.has(ref),data:()=>docs.get(ref),metadata:{hasPendingWrites:false}});
  (globalThis as any).__scheduleSdk={
    listen:(ref:string,...args:any[])=>{const next=args.find(value=>typeof value==="function"),listener={ref,next,active:true};listeners.push(listener);next(snap(ref));return()=>{listener.active=false;};},
    transact:async(_:unknown,work:any)=>{transactions++;return work({get:async(ref:string)=>snap(ref),set:(ref:string,value:any)=>{docs.set(ref,value);queueMicrotask(()=>listeners.filter(item=>item.ref===ref&&item.active).forEach(item=>item.next(snap(ref))));}});},
  };
  const db={} as any,getDb=()=>db;
  const container=document.createElement("div");container.style.cssText="width:360px;padding:20px;background:#121212;box-sizing:border-box;color:#eee;font-family:Arial";document.body.append(container);
  const root=createRoot(container);
  function View(){useFocusScheduleRunner("student",getDb,reader);return <FocusScheduleManager uid="student" getDatabase={getDb} domains={[]}/>;}
  const button=(text:string)=>[...container.querySelectorAll("button")].find(item=>item.textContent===text)!;
  const tick=async(time:number)=>act(async()=>{
    now=time;
    const due=[...timers].filter(([,timer])=>timer.at<=now);
    for(const [id,timer]of due){if(timer.period)timer.at=now+timer.period;else timers.delete(id);timer.fn();}
  });
  try{
    await act(async()=>root.render(<View/>));
    if(transactions)throw Error("scheduler polled DB before a due start");
    await act(async()=>button("Edit").click());
    if(button("Save schedule").disabled)throw Error("schedule froze before 9 PM");
    await tick(Date.parse("2026-10-19T15:30:00Z"));
    if(!button("Save schedule").disabled||!button("Delete").disabled)throw Error("open editor did not freeze at 9 PM");
    await tick(Date.parse("2026-10-19T16:30:00Z"));
    const session=docs.get(path).session;
    if(session?.id!==`schedule-sleep-${now}`||session.endsAt!==Date.parse("2026-10-20T00:30:00Z"))throw Error("schedule did not start with the expected deadline: "+JSON.stringify({session,transactions,crypto:typeof crypto.randomUUID}));
    if(transactions!==1)throw Error("scheduled start was not idempotent");
    await tick(now+60000);if(transactions!==1)throw Error("running scheduled session generated extra transactions");
    await tick(Date.parse("2026-10-20T00:30:00Z"));
    if(button("Save schedule").disabled||button("Delete").disabled)throw Error("editor remained frozen after the end");
    await act(async()=>button("Cancel").click());
    await act(async()=>root.unmount());
    if(timers.size||listeners.some(item=>item.active))throw Error("scheduler leaked a timer/listener");
    return "real schedule UI, editor locks at 9 PM, scheduled start at 10 PM, fixed 6 AM end, no steady polling, cleanup";
  }finally{
    Date.now=originals.now;window.setInterval=originals.interval;window.setTimeout=originals.timeout;window.clearInterval=originals.clearInterval;window.clearTimeout=originals.clearTimeout;
    container.remove();delete (globalThis as any).__scheduleSdk;
  }
}

