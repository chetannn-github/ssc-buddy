import { act } from "react";
import { createRoot } from "react-dom/client";
import { useStartupProfileFocus, useStartupReadiness } from "../../shared/use-startup-readiness";
import { useProfileFocusData } from "../../shared/use-profile-focus";

export async function run() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const db = {} as any, getDb = () => db, listeners: any[] = [];
  const watch = (uid: string, kind: string, next: any, error: any) => {
    const item = { uid, kind, next, error, active: true }; listeners.push(item);
    return () => { item.active = false; };
  };
  const reader: any = {
    watchStudyFocusDays: (_: any, uid: string, next: any, error: any) => watch(uid, "days", next, error),
    watchStudyControl: (_: any, uid: string, next: any, error: any) => watch(uid, "control", next, error),
    repairStudyFocusDays: async () => {}, publishStudyFocusDay: async () => {},
  };
  function Profile({ uid }: { uid: string }) {
    const data = useProfileFocusData(getDb, reader, uid, undefined, false, () => true);
    return <output>{data.ready ? data.text : "Not ready"}</output>;
  }
  function App({ uid = "alice", profile = false, tasks = false, activity = false, waitMs = 60_000 }: any) {
    const focus = useStartupProfileFocus(uid, getDb, reader);
    const startup = useStartupReadiness(uid, { profile, tasks, focus, activity }, waitMs);
    return <section data-ready={startup.ready} data-timeout={startup.timedOut}><span>{startup.message}</span>{uid && startup.ready && <Profile uid={uid} />}</section>;
  }
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = async (props: any) => act(async () => root.render(<App {...props} />));
  const emit = async (uid: string, kind: string, value: any) => act(async () => listeners.filter(item => item.active && item.uid === uid && item.kind === kind).forEach(item => item.next(value)));
  const ready = () => host.querySelector("section")?.getAttribute("data-ready") === "true";
  const check = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
  const all = { profile: true, tasks: true, activity: true };
  const days = { "2026-10-20": { totalMilliseconds: 7_200_000, sessionCredits: {} } };
  try {
    await render({});
    check(!ready() && host.textContent?.includes("profile"), "did not wait for profile");
    check(listeners.length === 2, "preload should attach two existing Focus streams");
    await render({ profile: true }); check(!ready() && host.textContent?.includes("tasks"), "task stage missing");
    await render({ profile: true, tasks: true }); check(!ready() && host.textContent?.includes("focus time"), "Focus stage missing");
    await emit("alice", "control", null); check(!ready(), "control alone released startup");
    await emit("alice", "days", days); check(!ready() && host.textContent?.includes("stats"), "activity stage missing");
    await render(all); check(ready() && host.querySelector("output")?.textContent === "2h", "landing did not have complete Focus data");
    check(listeners.length === 2, "Profile mount started duplicate streams");
    await render({}); check(ready(), "later state change reopened splash");
    await render({ uid: "bob", ...all }); check(!ready(), "another account reused Alice readiness");
    await render({ uid: "alice", ...all }); check(!ready(), "rapid account return reused an old startup latch");
    await emit("alice", "days", {}); await emit("alice", "control", null); check(ready(), "empty account could not finish startup");
    await render({ uid: "offline", waitMs: 80 }); check(!ready(), "offline startup did not wait");
    await act(async () => listeners.filter(item => item.active && item.uid === "offline").forEach(item => item.error(Error("unavailable"))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    check(host.textContent?.includes("A little longer"), "slow connection text did not change");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 65)); });
    check(ready() && host.querySelector("section")?.getAttribute("data-timeout") === "true", "offline fallback stayed stuck");
    await emit("offline", "days", days); await emit("offline", "control", null);
    check(host.querySelector("output")?.textContent === "2h", "fallback prevented late cloud recovery");
    await render({ uid: undefined }); // default test owner, then explicit sign-out below
    await render({ uid: null }); check(ready(), "guest/sign-out blocked");
    await act(async () => root.unmount());
    check(listeners.every(item => !item.active), "startup source leaked after unmount");
    return "staged startup, Focus ready before landing, shared streams, no later splash, empty/account switching, slow/offline fallback and late recovery";
  } finally { host.remove(); }
}
