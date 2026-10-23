import { act } from "react";
import { createRoot } from "react-dom/client";
import { FocusScheduleManager } from "../../shared/FocusScheduleManager";
import { useFocusScheduleRunner } from "../../shared/use-focus-schedule-runner";
import * as reader from "../../shared/study-lock";
import { StudyLockControl } from "../../shared/StudyLockControl";

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
  const button=(text:string)=>text==="Edit"?container.querySelector<HTMLButtonElement>('[aria-label="Edit Sleep"]')!:[...container.querySelectorAll("button")].find(item=>item.textContent===text)!;
  const tick=async(time:number)=>act(async()=>{
    now=time;
    const due=[...timers].filter(([,timer])=>timer.at<=now);
    for(const [id,timer]of due){if(timer.period)timer.at=now+timer.period;else timers.delete(id);timer.fn();}
  });
  try{
    await act(async()=>root.render(<View/>));
    if(transactions)throw Error("scheduler polled DB before a due start");
    if(container.querySelector<HTMLInputElement>('[aria-label="Schedule name"]')?.value!=="Sleep")throw Error("existing schedule editor did not open immediately");
    const previewCards=[...container.querySelectorAll<HTMLButtonElement>('[data-schedule-preview]')];
    if(previewCards.length!==5)throw Error("expected five temporary preview schedules");
    const savedRow=container.querySelector<HTMLElement>('[aria-label="Saved schedules"]')!,addButton=container.querySelector<HTMLElement>('[aria-label="Add focus schedule"]')!;
    if(savedRow.getBoundingClientRect().top<addButton.getBoundingClientRect().bottom)throw Error("saved schedules should be in the next row");
    if(savedRow.textContent?.includes('Preview')||savedRow.textContent?.includes(':')||savedRow.querySelectorAll('svg').length!==6)throw Error("saved chips should only show names and icons");
    await act(async()=>previewCards[2]!.click());
    await act(async()=>button("Save schedule").click());
    if(transactions)throw Error("saving a preview touched the database");
    await act(async()=>button("Edit").click());
    if(container.textContent?.includes("Asia/Kolkata")||container.textContent?.includes("No breaks"))throw Error("extra setup descriptions remain visible");
    if(container.querySelector('[aria-label="Schedule preset"]'))throw Error("preset categories should be removed");
    const appsGroup=container.querySelector('[aria-label="Extra allowed apps"]')!;
    await act(async()=>appsGroup.querySelectorAll('button')[2]!.click());
    if(appsGroup.querySelector('[aria-pressed="true"]')?.textContent!=="2")throw Error("allowed apps switch failed");
    const weekday=container.querySelector<HTMLButtonElement>('.focus-schedule-days button')!;
    const before=weekday.getAttribute('aria-pressed');
    await act(async()=>weekday.click());
    if(weekday.getAttribute('aria-pressed')===before||getComputedStyle(weekday).transitionDuration==='0s')throw Error("weekday tap animation missing");
    await act(async()=>weekday.click());
    const friday=[...container.querySelectorAll<HTMLButtonElement>('.focus-schedule-days button')].find(item=>item.textContent==='Fri')!;
    await act(async()=>friday.click());await act(async()=>friday.click());
    const fridayText=document.createRange();fridayText.selectNodeContents(friday);
    if(fridayText.getClientRects().length!==1||getComputedStyle(friday).whiteSpace!=='nowrap')throw Error("Friday label wraps when selected");
    if(transactions)throw Error("selection-only changes wrote to DB");
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
    docs.set(path,{version:1,revision:'empty',session:null,focusSchedules:[]});
    const panelRoot=createRoot(container);
    await act(async()=>panelRoot.render(<StudyLockControl uid="student" source="web" getDatabase={getDb}/>));
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Focus Lock"]')!.click());
    if(document.querySelector('[aria-label="Focus schedules"]')===null||document.querySelector('[aria-label="Focus schedules"]')?.closest('.browser-study-heading')===null)throw Error("schedule icon missing from header");
    if(document.querySelector('.focus-schedules'))throw Error("schedules are still inline in focus setup");
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Focus schedules"]')!.click());
    if(!document.querySelector('.focus-schedules'))throw Error("schedule icon did not open schedules");
    if(document.querySelector<HTMLInputElement>('[aria-label="Schedule name"]')?.value!=="Sleep")throw Error("empty account did not open a new schedule directly");
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Back to Focus Lock"]')!.click());
    if(document.querySelector('.focus-schedules'))throw Error("schedule back navigation failed");
    await act(async()=>panelRoot.unmount());
    if(timers.size||listeners.some(item=>item.active))throw Error("focus dialog leaked timers or listeners");
    return "direct new/existing editor, five local previews, preview saves without DB writes, animated selections, freeze, auto-start/end, cleanup";
  }finally{
    Date.now=originals.now;window.setInterval=originals.interval;window.setTimeout=originals.timeout;window.clearInterval=originals.clearInterval;window.clearTimeout=originals.clearTimeout;
    container.remove();delete (globalThis as any).__scheduleSdk;
  }
}

