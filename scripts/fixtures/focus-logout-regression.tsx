import { act } from "react";
import { createRoot } from "react-dom/client";
import { useProfileFocusData } from "../../shared/use-profile-focus";

export async function run() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const realNow = Date.now, realSet = window.setInterval, realClear = window.clearInterval;
  let now = realNow(), serial = 0;
  const timers = new Map<number, () => void>();
  Date.now = () => now;
  window.setInterval = ((callback: () => void) => { timers.set(++serial, callback); return serial; }) as any;
  window.clearInterval = (id?: number) => { if (id) timers.delete(id); };
  const listeners: Array<{ uid: string; kind: string; next: (value: any) => void; failed: () => void; active: boolean }> = [];
  const listen = (uid: string, kind: string, next: (value: any) => void, failed: () => void) => {
    const entry = { uid, kind, next, failed, active: true }; listeners.push(entry);
    return () => { entry.active = false; };
  };
  const db = {} as any, getDb = () => db;
  const reader: any = {
    watchStudyFocusDays: (_db: any, uid: string, next: any, failed: any) => listen(uid, "days", next, failed),
    watchStudyControl: (_db: any, uid: string, next: any, failed: any) => listen(uid, "control", next, failed),
    watchPublicStudyFocus: (_db: any, uid: string, _name: string, next: any, failed: any) => listen(uid, "public", next, failed),
    publishStudyFocusDay: async () => {},
  };
  function Profile({ uid, readOnly = false }: { uid: string; readOnly?: boolean }) {
    const focus = useProfileFocusData(getDb, reader, uid, readOnly ? uid : undefined, readOnly, () => true);
    return focus.canLogout ? <button>Log out</button> : <span>Hidden</span>;
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const check = (shown: boolean, label: string) => { if (!!container.querySelector("button") !== shown) throw Error(label); };
  const emit = async (uid: string, value: any) => act(async () => { listeners.filter(item => item.uid === uid && item.kind === "control" && item.active).forEach(item => item.next(value)); });
  const tick = async (milliseconds: number) => act(async () => { now += milliseconds; timers.forEach(timer => timer()); });
  try {
    await act(async () => root.render(<Profile uid="alice" />)); check(false, "hide while control loads");
    await emit("alice", null); check(true, "show when idle");
    const session = { id: "focus", startedAt: now, endsAt: now + 60000, domains: [] };
    await emit("alice", { session }); check(false, "hide during active focus");
    await tick(60000); check(true, "show at expiry without a new DB snapshot");
    await emit("alice", { session: { ...session, paused: true, pausedAt: now, remainingMs: 30000 } }); check(false, "legacy paused session still hides logout");
    await emit("alice", { session: { ...session, paused: true, remainingMs: 30000, breakUntil: now + 600000, breaksTaken: 1, breakLimit: 1 } });
    check(false, "hide during timed break");
    await tick(600000); check(false, "hide during automatic resumed focus");
    await tick(30000); check(true, "show after resumed segment expires");
    const old = listeners.filter(item => item.active && item.uid === "alice" && item.kind === "control");
    await act(async () => root.render(<Profile uid="bob" />)); check(false, "account switch must wait for its own session");
    await act(async () => old.forEach(item => item.next(null))); check(false, "late old account callback ignored");
    await emit("bob", null); check(true, "idle new account can logout");
    await act(async () => listeners.filter(item => item.active && item.kind === "control").forEach(item => item.failed())); check(false, "unknown control after error cannot show logout");
    await emit("bob", null); check(true, "recovery restores logout");
    await act(async () => root.render(<Profile uid="bob" readOnly />)); check(false, "public profile cannot expose logout");
    await act(async () => root.unmount());
    if (listeners.some(item => item.active) || timers.size) throw Error("leaked subscriptions or timers");
    return "loading, idle, active focus, legacy pause, timed break, automatic resume/expiry, account isolation, errors, recovery, public view, cleanup";
  } finally {
    await act(async () => root.unmount()); container.remove(); Date.now = realNow; window.setInterval = realSet; window.clearInterval = realClear;
  }
}
