import { act } from "react";
import { createRoot } from "react-dom/client";
import { useLeaderboardXp } from "../../shared/use-leaderboard-xp";
import { rankWeeklyEntries } from "../../mobile-tasks/src/domain/weekly-results";
import { useWeeklyMedalCounts } from "../../src/lib/weekly-results";
import { leaderboardWeek, shiftLeaderboardWeek } from "../../mobile-tasks/src/domain/weekly-results";

export async function run() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const listeners: Array<{path: string; next: (snapshot: any) => void; failed: () => void; active: boolean}> = [];
  (globalThis as any).__xpSDK = {
    listen(path: string, next: any, failed: any) {
      const listener = { path, next, failed, active: true }; listeners.push(listener);
      return () => { listener.active = false; };
    },
  };
  const database = {};
  const getDb = () => database as any;
  const currentWeek = "2026-10-19", oldWeek = "2026-10-12";
  const historical = {uid: "alice", username: "alice", xp: 100, level: 1, points: 45, focusDays: {"2026-10-12": 600000}};
  const original = JSON.stringify(historical);
  let result: any;
  function View({ week = oldWeek, rows = [historical], own = false, tasks = [] }: any) {
    result = useLeaderboardXp(rows, week, currentWeek, getDb, own ? "alice" : undefined, own ? tasks : undefined);
    return null;
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const render = async (props: any = {}) => act(async () => root.render(<><View {...props} />{props.twin && <View {...props} />}</>));
  const emit = async (path: string, data: any, failed = false) => act(async () => {
    listeners.filter(item => item.active && item.path === path).forEach(item => failed ? item.failed() : item.next(path.startsWith("leaderboards/")
      ? { docs: data.map((item: any) => ({ id: item.uid, data: () => item })) }
      : { data: () => data }));
  });
  const check = (xp: number | null, label: string, level?: number) => {
    if ((result.alice?.xp ?? null) !== xp || (level !== undefined && result.alice?.level !== level)) throw Error(`${label}: ${JSON.stringify(result)}`);
  };
  try {
    await render(); check(null, "never display historical XP while current loads");
    await emit(`leaderboards/${currentWeek}/entries`, [{uid: "alice", xp: 500, focusXp: 30, focusDays: {"2026-10-19": 600000}}]);
    check(530, "current task and all-time focus XP", 2);
    await emit(`leaderboards/${currentWeek}/entries`, [{uid: "alice", xp: 1200, focusXp: 40, focusDays: {"2026-10-19": 600000}}]);
    check(1240, "live current XP replaces old-week XP", 3);
    await emit("publicProfiles/alice", {uid: "other", dashboard: {dailyTasks: []}, focusDays: {"2026-10-19": 6000000}});
    check(1240, "ignore reassigned username's public data");
    await emit(`leaderboards/${currentWeek}/entries`, []); check(null, "no fallback to historical identity");
    await emit("publicProfiles/alice", {uid: "alice", dashboard: {dailyTasks: []}, focusDays: {"2026-10-12": 600000, "2026-10-19": 6000000}});
    check(11, "current public identity works without this week's participation", 1);
    const now = new Date(), date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    await render({own: true, tasks: [{date, completed: true, minutesSpent: 20}]});
    check(23, "own latest tasks plus all-time focus");
    await emit("publicProfiles/alice", null, true); check(null, "failed reads cannot revive historical XP");
    const normalized = rankWeeklyEntries([{...historical, week: currentWeek, xp: 500, focusXp: 30}]);
    await render({week: currentWeek, rows: normalized}); check(530, "current week focus not counted twice", 2);
    if (listeners.some(item => item.active && item.path.startsWith("leaderboards/"))) throw Error("current week created an extra week subscription");
    const old = listeners.filter(item => !item.active && item.path.startsWith("leaderboards/"));
    await act(async () => old.forEach(item => item.next({docs: [{id:"alice",data:()=>({xp:999999})}]})));
    check(530, "late removed listener ignored");
    if (JSON.stringify(historical) !== original) throw Error("historical weekly scores mutated");
    const many = [historical, ...Array.from({ length: 19 }, (_, index) => ({ uid: `member${index}`, username: `member${index}`, xp: 999999 }))];
    await render({ rows: many });
    if (listeners.filter(item => item.active && item.path.startsWith("publicProfiles/")).length !== 20) throw Error("full list lost live member XP");
    await render({ rows: [historical], twin: true });
    if (listeners.filter(item => item.active && item.path.startsWith("publicProfiles/")).length !== 1) throw Error("selected detail did not reduce/share profile targets");
    if (listeners.filter(item => item.active && item.path.startsWith("leaderboards/")).length !== 1) throw Error("current-week fallback was not shared");
    await emit(`leaderboards/${currentWeek}/entries`, [{ uid: "alice", xp: 800, focusXp: 20, focusDays: { "2026-10-19": 600000 } }]);
    check(820, "selected historical detail retains live current XP");
    await render({ rows: many });
    if (listeners.filter(item => item.active && item.path.startsWith("publicProfiles/")).length !== 20) throw Error("back to list did not restore live members");
    await act(async () => root.unmount());
    if (listeners.some(item => item.active)) throw Error("subscription leak");
    return "historical/current weeks, live XP and level, all-time focus, own tasks, missing current entry, profile ownership, errors, no double-counting, unchanged historical scores, 20-to-1 detail/list switching, shared sources and cleanup";
  } finally { container.remove(); delete (globalThis as any).__xpSDK; }
}

export async function runMedals() {
  const current = leaderboardWeek(), dates = [shiftLeaderboardWeek(current, -4)];
  const reads: string[] = [];
  let rank = 1, fail = false, result: any;
  (globalThis as any).__medalDB = {};
  (globalThis as any).__medalSDK = { read: async (path: string) => {
    reads.push(path);
    if (fail) throw Error("network");
    return { docs: [
      { id: "viewer", data: () => ({ uid: "viewer", points: rank === 1 ? 100 : 50, completed: 1 }) },
      { id: "other", data: () => ({ uid: "other", points: 75, completed: 1 }) },
    ] };
  } };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  function View({ uid = "viewer" }: { uid?: string }) { result = useWeeklyMedalCounts(uid, dates); return null; }
  try {
    await act(async () => root.render(<View />));
    if (reads.length !== 4 || result.gold !== 4) throw Error(`initial medals ${reads.length}: ${JSON.stringify(result)}`);
    await act(async () => root.render(<View />));
    if (reads.length !== 4) throw Error("ordinary rerender refetched medal history");
    rank = 2;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    if (reads.length !== 8 || result.silver !== 4 || result.gold !== 0) throw Error(`refresh corrections ${JSON.stringify(result)}`);
    fail = true;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    if (result.silver !== 4) throw Error("failed refresh erased last verified awards");
    fail = false; rank = 1;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    if (result.gold !== 4) throw Error("failed week could not retry");
    await act(async () => root.render(<View uid="other" />));
    if (result.silver !== 4 || result.gold !== 0) throw Error("account change retained prior awards");
    await act(async () => root.unmount());
    const before = reads.length; window.dispatchEvent(new Event("focus")); await Promise.resolve();
    if (reads.length !== before) throw Error("focus refresh leaked after unmount");
    return "medals on initial open, no rerender refetch, corrected history on focus, failed refresh retains verified values, retry, account switch and cleanup";
  } finally { container.remove(); delete (globalThis as any).__medalDB; delete (globalThis as any).__medalSDK; }
}
