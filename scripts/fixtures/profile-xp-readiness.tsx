import { act } from "react";
import { createRoot } from "react-dom/client";
import { ProfileFocusSync } from "../../shared/ProfileFocusSync";
import { useProfileFocusData } from "../../shared/use-profile-focus";
import { getXpSummary } from "../../mobile-tasks/src/domain/xp";

export async function run() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const db = {} as any, getDb = () => db;
  const listeners: any[] = [], seen: string[] = [];
  const watch = (uid: string, kind: string, next: any, error: any) => {
    const item = { uid, kind, next, error, active: true }; listeners.push(item);
    return () => { item.active = false; };
  };
  const reader: any = {
    watchStudyFocusDays: (_db: any, uid: string, next: any, error: any) => watch(uid, "days", next, error),
    watchStudyControl: (_db: any, uid: string, next: any, error: any) => watch(uid, "control", next, error),
    watchPublicStudyFocus: (_db: any, uid: string, _name: string, next: any, error: any) => watch(uid, "public", next, error),
    repairStudyFocusDays: async () => {}, publishStudyFocusDay: async () => {},
  };
  function Profile({ uid, publicView = false }: { uid: string; publicView?: boolean }) {
    const focus = useProfileFocusData(getDb, reader, uid, publicView ? uid : undefined, publicView, () => true);
    const xp = getXpSummary([], focus.totalPoints);
    const text = focus.ready ? `${xp.xp}:${xp.level}` : "Loading";
    seen.push(text);
    return <span data-focusing={focus.focusing}>{text}</span>;
  }
  function App({ uid = "alice", visible = true, publicView = false }: any) {
    return <><ProfileFocusSync uid={uid} reader={reader} getDatabase={getDb} enabled={visible} />{visible && <Profile uid={uid} publicView={publicView} />}</>;
  }
  const container = document.createElement("div"); document.body.append(container);
  let root = createRoot(container);
  const render = async (props: any = {}) => act(async () => root.render(<App {...props} />));
  const emit = async (uid: string, kind: string, value: any) => act(async () => {
    listeners.filter(item => item.active && item.uid === uid && item.kind === kind).forEach(item => item.next(value));
  });
  const days = (points: number) => ({ "2026-10-19": { totalMilliseconds: points * 600_000, sessionCredits: {} } });
  const check = (text: string) => { if (container.textContent !== text) throw Error(`Expected ${text}, got ${container.textContent}`); };
  try {
    await render({ visible: false });
    if (listeners.length) throw Error("lazy warmup fetched before Profile was opened");
    await render(); check("Loading");
    if (listeners.length !== 2) throw Error("root/profile did not share the initial source");
    await emit("alice", "days", days(600)); check("Loading");
    await emit("alice", "control", null); check("600:2");
    await render({ visible: false });
    await emit("alice", "days", days(700));
    const count = listeners.length; seen.length = 0;
    await render(); check("700:2");
    if (listeners.length !== count || seen.some(value => value !== "700:2")) throw Error("tab return refetched/reset XP before current value");
    await emit("alice", "days", days(800)); check("800:2");
    const old = listeners.filter(item => item.uid === "alice");
    await render({ uid: "bob" }); check("Loading");
    await act(async () => old.forEach(item => item.next(item.kind === "days" ? days(999999) : null))); check("Loading");
    await emit("bob", "days", days(0)); await emit("bob", "control", null); check("0:1");
    const focusState = (expected: boolean) => { if (container.querySelector("span")?.getAttribute("data-focusing") !== String(expected)) throw Error(`Wrong Focusing indicator: expected ${expected}`); };
    focusState(false);
    const beforeStatus = listeners.length;
    const now = Date.now();
    const session = { id: "badge", startedAt: now - 1_000, endsAt: now + 60_000, domains: [] };
    await emit("bob", "control", { session }); focusState(true);
    await emit("bob", "control", { session: { ...session, paused: true, remainingMs: 60_000, breakUntil: now + 10_000 } }); focusState(false);
    await emit("bob", "control", { session: { ...session, paused: true, remainingMs: 60_000, breakUntil: now - 1_000 } }); focusState(true);
    await emit("bob", "control", { session: { ...session, startedAt: now - 20_000, endsAt: now - 10_000 } }); focusState(false);
    await emit("bob", "control", null); focusState(false);
    if (listeners.length !== beforeStatus) throw Error("Focusing indicator added/refetched listeners");
    await act(async () => listeners.find(item => item.active && item.uid === "bob" && item.kind === "days").error(Error("permission"))); check("Loading");
    await render({ uid: "bob", visible: false }); await render({ uid: "bob" });
    await emit("bob", "days", days(50)); await emit("bob", "control", null); check("50:1");
    await render({ uid: "bob", publicView: true }); check("Loading");
    await emit("bob", "public", { days: { "2026-10-19": 90 * 600_000 } }); check("90:1");
    await act(async () => root.unmount());
    if (listeners.some(item => item.active)) throw Error("source leaked after logout/unmount");
    root = createRoot(container);
    await act(async () => root.render(<App />)); check("Loading");
    await act(async () => root.unmount());
    return "cold readiness, no incomplete XP, shared listeners, live hidden-tab updates, no tab-return reset/fetch, account isolation, errors/retry, public/private separation and cleanup";
  } finally { container.remove(); }
}
