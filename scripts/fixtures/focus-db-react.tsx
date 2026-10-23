import { act } from "react";
import { createRoot } from "react-dom/client";
import { createStudyController } from "../../shared/study-controller";
import { useProfileFocusData } from "../../shared/use-profile-focus";

export async function run() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const originalNow = Date.now, originalSet = window.setInterval, originalClear = window.clearInterval;
  let now = Date.parse("2026-10-19T10:00:00Z"), serial = 0, transactions = 0, writes = 0;
  const timers = new Map<number, () => void>(), listeners: any[] = [];
  Date.now = () => now;
  window.setInterval = ((fn: () => void) => {timers.set(++serial, fn);return serial;}) as any;
  window.clearInterval = ((id: number) => timers.delete(id)) as any;
  const session = {id:"seven-hours", startedAt:now, endsAt:now+7*3600000, timeZone:"UTC", domains:["study.example"]};
  const documents = new Map<string, any>([
    ["users/student/studyLock/current", {session}],
    ["users/student/profile/current", {username:"student"}],
    ["publicProfiles/student", {uid:"student", focusDays:{}}],
  ]);
  const db = {} as any, getDb = () => db;
  const snapshot = (path: string) => ({exists:()=>documents.has(path),data:()=>documents.get(path),metadata:{hasPendingWrites:false},
    docs:[...documents].filter(([key])=>key.startsWith(path+"/") && !key.slice(path.length+1).includes("/")).map(([key,value])=>({id:key.slice(path.length+1),data:()=>value}))});
  const api: any = {
    doc: (_: any, ...path: string[])=>path.join("/"), collection: (_: any, ...path: string[])=>path.join("/"), serverTimestamp:()=>null,
    onSnapshot: (path: string, ...args: any[])=>{
      const next=args.find(value=>typeof value==="function"), listener={path,next,active:true};listeners.push(listener);next(snapshot(path));return()=>{listener.active=false;};
    },
    runTransaction: async (_: any, work: any)=>{transactions++;return work({get:async(path:string)=>snapshot(path),set:(path:string,value:any,options:any)=>{writes++;const old=documents.get(path)??{};documents.set(path,options?.merge?{...old,...value,focusDays:{...old.focusDays,...value.focusDays}}:value);}});},
  };
  const reader = createStudyController(api);
  const container=document.createElement("div");document.body.append(container);
  const root=createRoot(container);
  function Profile({publicView=false}) {
    const focus=useProfileFocusData(getDb,reader,"student",publicView?"student":undefined,publicView,()=>true);
    return <span>{focus.text}</span>;
  }
  const tick = async (time:number)=>act(async()=>{now=time;timers.forEach(fn=>fn());});
  try {
    await act(async()=>root.render(<><Profile /><Profile /></>));
    if(transactions!==0)throw Error("empty profile should not publish any historical totals");
    for(let minute=1;minute<420;minute++)await tick(session.startedAt+minute*60000);
    if(transactions!==0 || writes!==0)throw Error("profile/task hook created running-session DB traffic");
    if(!container.textContent?.includes("6h 59m"))throw Error("live focus stopped advancing locally");
    await tick(session.endsAt);
    if(transactions!==1 || writes!==3)throw Error(`expected one shared final commit, got ${transactions} transactions/${writes} writes`);
    for(let minute=1;minute<=60;minute++)await tick(session.endsAt+minute*60000);
    if(transactions!==1)throw Error("expired hooks repeatedly hit DB");
    await act(async()=>root.render(<Profile publicView />));
    const previous=transactions;
    await tick(session.endsAt+7200000);
    if(transactions!==previous)throw Error("public profile must never settle private credits");
    await act(async()=>root.unmount());
    if(listeners.some(item=>item.active)||timers.size)throw Error("subscription/timer cleanup failed");
    return "two real React profile/task hooks, 7-hour local countdown, one final commit, expired retries cached, public read-only, cleanup";
  } finally {
    Date.now=originalNow;window.setInterval=originalSet;window.clearInterval=originalClear;container.remove();
  }
}
