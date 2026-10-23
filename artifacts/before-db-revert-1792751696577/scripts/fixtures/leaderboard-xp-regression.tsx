import { act } from "react";
import { createRoot } from "react-dom/client";
import { useLeaderboardXp } from "../../shared/use-leaderboard-xp";

export async function runLeaderboardXpRegression() {
  const check = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
  const currentWeek = "2026-10-19", previousWeek = "2026-10-12", db = {} as any;
  const old = { uid: "alice", username: "alice", week: previousWeek, xp: 100, level: 1, points: 11, focusDays: { "2026-10-12": 600000 } };
  const original = JSON.stringify(old);
  const subscriptions: Array<{ path: string; next: (snapshot: any) => void; active: boolean }> = [];
  const reads: string[] = [];
  const documents = new Map<string, any>();
  const currentPath = `leaderboards/${currentWeek}/entries`;
  const profilePath = "publicProfiles/alice";
  const query = (value: any[]) => ({ docs: value.map(item => ({ id: item.uid, data: () => item })) });
  const rawCurrent = { uid: "alice", xp: 500, focusXp: 30, focusDays: { "2026-10-23": 600000 }, points: 10 };
  documents.set(currentPath, query([rawCurrent]));
  (globalThis as any).__leaderboardXpSDK = {
    collection: (_db: any, ...parts: string[]) => parts.join("/"), doc: (_db: any, ...parts: string[]) => parts.join("/"),
    onSnapshot: (path: string, next: (snapshot: any) => void) => {
      const entry = { path, next, active: true }; subscriptions.push(entry);
      return () => { entry.active = false; };
    },
    getDocs: async (path: string) => { reads.push(path); return documents.get(path) ?? query([]); },
    getDoc: async (path: string) => { reads.push(path); return { data: () => documents.get(path) }; },
  };
  const getDatabase = () => db;
  let shown: Record<string, { xp: number; level: number } | null>;
  function Board({ live = true, week = previousWeek, own = false, focusXp }: { live?: boolean; week?: string; own?: boolean; focusXp?: number | null }) {
    shown = useLeaderboardXp([old], week, currentWeek, getDatabase, own ? "alice" : undefined, own ? [] : undefined, live, focusXp);
    return <div>{shown.alice ? `${shown.alice.xp}:${shown.alice.level}` : "loading"}</div>;
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const emit = async (path: string, snapshot: any) => {
    await act(async () => { subscriptions.filter(item => item.active && item.path === path).forEach(item => item.next(snapshot)); });
  };
  try {
    await act(async () => root.render(<Board />));
    check(shown!.alice === null, "historical XP must never masquerade as current while loading");
    await emit(currentPath, query([rawCurrent]));
    check(shown!.alice?.xp === 530 && shown!.alice?.level === 2, "historical view uses normalized current task + focus XP and level");
    await emit(currentPath, query([{ ...rawCurrent, xp: 1200, focusXp: 40 }]));
    check(shown!.alice?.xp === 1240 && shown!.alice?.level === 3, "current updates propagate while previous week stays open");
    check(JSON.stringify(old) === original, "historical score/rank input is never rewritten");
    await act(async () => root.render(<Board own focusXp={1500} />));
    check(shown!.alice?.xp === 1500, "own latest app-level focus XP wins over a stale published identity");
    await act(async () => root.render(<Board own focusXp={null} />));
    check(shown!.alice === null, "own XP waits while app-level focus is loading");
    await act(async () => root.render(<Board key="web-complete" live={false} />));
    check(shown!.alice?.xp === 530, "web previous-week identity is read once from current week");
    check(reads.filter(path => path === currentPath).length === 1 && !reads.includes(profilePath), "complete current entry needs one query and no profile fallback");
    documents.set(currentPath, query([]));
    documents.set(profilePath, { uid: "alice", dashboard: { dailyTasks: [] }, focusDays: { "2026-10-23": 6000000 } });
    await act(async () => root.render(<Board key="web-fallback" live={false} />));
    check(shown!.alice?.xp === 10, "missing current entry falls back to current public profile and all-time focus");
    documents.set(profilePath, { uid: "other-account", dashboard: { dailyTasks: [] }, focusDays: { "2026-10-23": 6000000 } });
    await act(async () => root.render(<Board key="web-owner" live={false} />));
    check(shown!.alice === null, "reassigned usernames cannot supply another account XP");
    await act(async () => root.unmount());
    check(subscriptions.every(item => !item.active), "leaderboard listeners are released");
    return { passed: true, scenarios: ["historical/current separation", "focus XP normalization", "live current level", "own app cache", "web one-shot reads", "missing entry fallback", "profile ownership", "cleanup"] };
  } finally {
    await act(async () => root.unmount()); container.remove(); delete (globalThis as any).__leaderboardXpSDK;
  }
}
