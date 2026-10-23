import { act } from "react";
import { createRoot } from "react-dom/client";
import { useProfileFocusData } from "../../shared/use-profile-focus";
import { focusDayKey } from "../../shared/study-focus";
import { ProfileFocusProvider, useOwnProfileFocusData } from "../../mobile-tasks/src/components/ProfileFocusProvider";
import { selectProfileFocusRange } from "../../shared/profile-focus-range";
export { runLeaderboardXpRegression } from "./leaderboard-xp-regression";

export async function runFocusHookRegression() {
  const realNow = Date.now, fixedNow = Date.now();
  Date.now = () => fixedNow;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
  const day = focusDayKey(Date.now(), "UTC"), db = {} as any;
  const listeners: Array<{ uid: string; kind: string; callback: (data: any) => void; active: boolean }> = [];
  const publications: Array<{ uid: string; date: string }> = [];
  const listen = (uid: string, kind: string, callback: (data: any) => void) => {
    const entry = { uid, kind, callback, active: true }; listeners.push(entry);
    return () => { entry.active = false; };
  };
  const reader: any = {
    watchStudyFocusDays: (_db: unknown, uid: string, callback: any) => listen(uid, "days", callback),
    watchStudyControl: (_db: unknown, uid: string, callback: any) => listen(uid, "control", callback),
    watchPublicStudyFocus: (_db: unknown, uid: string, _username: string, callback: any) => listen(uid, "public", callback),
    publishStudyFocusDay: async (_db: unknown, uid: string, date: string) => { publications.push({ uid, date }); return true; },
  };
  let current: ReturnType<typeof useProfileFocusData>;
  const getDatabase = () => db;
  function Profile({ uid, readOnly = false }: { uid: string; readOnly?: boolean }) {
    current = useProfileFocusData(getDatabase, reader, uid, readOnly ? uid : undefined, readOnly, () => true);
    return <div>{current.text}</div>;
  }
  const emit = async (uid: string, kind: string, value: unknown) => {
    await act(async () => { listeners.filter(entry => entry.uid === uid && entry.kind === kind && entry.active).forEach(entry => entry.callback(value)); });
  };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Profile uid="alice" />));
    check(!current!.ready, "XP must wait for focus history and control");
    const aliceDays = { [day]: { totalMilliseconds: 600000, sessionCredits: {} } };
    await emit("alice", "days", aliceDays);
    check(!current!.ready, "history alone cannot expose partial XP");
    await emit("alice", "control", { session: { id: "alice-session", startedAt: Date.now() - 30000, endsAt: Date.now() + 60000, timeZone: "UTC" } });
    check(current!.ready, "XP becomes ready after both inputs");
    check(current!.milliseconds >= 630000 && current!.milliseconds < 635000, "live focus added exactly once");
    for (let i = 0; i < 20; i++) await emit("alice", "days", structuredClone(aliceDays));
    check(publications.length === 1, "unchanged history events must share publication cache");
    check(current!.points === 1, "existing XP threshold preserved");
    const lateAlice = listeners.filter(entry => entry.uid === "alice");

    await act(async () => root.render(<Profile uid="bob" />));
    check(current!.milliseconds === 0 && current!.text === "—", "account switch cannot display old focus");
    await act(async () => lateAlice.forEach(entry => entry.callback(entry.kind === "days" ? aliceDays : { session: { id: "late-alice", startedAt: Date.now() - 600000, endsAt: Date.now() + 600000 } })));
    check(current!.milliseconds === 0, "callbacks after unsubscribe cannot replace new account state");
    await emit("bob", "days", { [day]: { totalMilliseconds: 120000, sessionCredits: {} } });
    check(current!.milliseconds === 120000, "new account has only its own saved focus");
    check(publications.length === 2 && publications.at(-1)?.uid === "bob", "separate account backfills separately");

    await act(async () => root.render(<Profile uid="alice" readOnly />));
    check(current!.milliseconds === 0, "public view starts with no private state");
    await emit("alice", "public", { days: { [day]: 1800000 }, timeZone: "UTC" });
    check(current!.milliseconds === 1800000 && current!.points === 3, "public totals and points remain correct");
    check(publications.length === 2, "public profile does not publish or write private data");
    check(listeners.filter(entry => entry.active).length === 1 && listeners.some(entry => entry.active && entry.kind === "public"), "public profile uses only public listener");

    await act(async () => root.render(<Profile uid="alice" />));
    check(current!.milliseconds === 0, "switching public to private cannot reuse public history as private input");
    await emit("alice", "days", aliceDays);
    check(current!.milliseconds === 600000, "own profile saved focus survives navigation");
    check(publications.length === 2, "remount in same runtime does not repeat successful history publication");
    await act(async () => root.unmount());
    check(listeners.every(entry => !entry.active), "unmount releases every subscription");
    (globalThis as any).__profileFocusTest = { reader, db };
    const providerContainer = document.createElement("div"); document.body.append(providerContainer);
    const providerRoot = createRoot(providerContainer);
    let visible: ReturnType<typeof useOwnProfileFocusData>;
    function Tab({ uid, tab }: { uid: string; tab: string }) {
      visible = useOwnProfileFocusData(uid);
      return <div>{tab === "profile" && visible?.ready ? visible.totalPoints : "—"}</div>;
    }
    function Workspace({ uid, tab }: { uid: string; tab: string }) {
      return <ProfileFocusProvider uid={uid}><Tab key={tab} uid={uid} tab={tab} /></ProfileFocusProvider>;
    }
    try {
      const before = listeners.length;
      await act(async () => providerRoot.render(<Workspace uid="alice" tab="tasks" />));
      check(listeners.length === before + 2 && !visible!.ready, "one app-level history/control pair starts");
      await emit("alice", "days", aliceDays);
      await emit("alice", "control", null);
      check(visible!.ready && visible!.totalPoints === 1, "app-level cache receives complete data");
      await emit("alice", "days", { [day]: { totalMilliseconds: 1800000, sessionCredits: {} } });
      for (let index = 0; index < 20; index++) await act(async () => providerRoot.render(<Workspace uid="alice" tab={index % 2 ? "tasks" : "profile"} />));
      await act(async () => providerRoot.render(<Workspace uid="alice" tab="profile" />));
      check(visible!.ready && visible!.totalPoints === 3 && providerContainer.textContent === "3", "profile first render uses latest XP after tab remount");
      check(listeners.length === before + 2, "tab switches never reattach history/control listeners");
      check(selectProfileFocusRange(visible!, date => date === day).milliseconds === 1800000, "date filtering reuses the live totals");
      check(selectProfileFocusRange(visible!, () => false).milliseconds === 0 && visible!.totalPoints === 3, "date filtering cannot reduce all-time XP");
      await act(async () => providerRoot.render(<Workspace uid="bob" tab="profile" />));
      check(!visible!.ready && providerContainer.textContent === "—", "account switch never flashes another account XP");
      await emit("bob", "control", null);
      await emit("bob", "days", {});
      check(visible!.ready && visible!.totalPoints === 0 && providerContainer.textContent === "0", "confirmed empty account is ready with zero focus XP");
    } finally {
      await act(async () => providerRoot.unmount()); providerContainer.remove(); delete (globalThis as any).__profileFocusTest;
    }
    check(listeners.every(entry => !entry.active), "app-level provider cleanup releases all listeners");
    return { passed: true, scenarios: ["live totals", "unchanged snapshots", "account switch", "late callbacks", "public privacy", "XP readiness", "20 tab switches without refetch", "latest first-render XP", "date filters", "listener cleanup"] };
  } finally { await act(async () => root.unmount()); container.remove(); Date.now = realNow; }
}
