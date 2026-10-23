import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, type DocumentData, type DocumentSnapshot, type QuerySnapshot, type Firestore } from "firebase/firestore";
import { observeOnce } from "./read-once";
import { getXpSummary } from "../mobile-tasks/src/domain/xp";
import type { Task } from "../mobile-tasks/src/domain/tasks";

type Entry = { uid: unknown; username?: unknown; xp?: unknown; level?: unknown; focusDays?: unknown; focusXp?: unknown };
type Xp = { xp: number; level: number };
const meta = (entry: Entry): Xp => {
  const xp = Number(entry.xp) || 0;
  return { xp, level: Number.isFinite(Number(entry.level)) ? Number(entry.level) : xp < 0 ? 0 : 1 };
};

/** Match mobile's current XP fallback for legacy and historical leaderboard entries. */
export function useLeaderboardXp(entries: Entry[], week: string, currentWeek: string, getDatabase: () => Firestore, viewerUid?: string, viewerTasks?: Task[], live = true) {
  const members = JSON.stringify(entries.map(entry => [String(entry.uid), String(entry.username ?? ""), !live && entry.focusDays && typeof entry.xp === "number" ? "complete" : "fallback"]).sort((a, b) => a[0]!.localeCompare(b[0]!)));
  const [profiles, setProfiles] = useState<{ key: string; tasks: Record<string, Task[] | null> }>({ key: "", tasks: {} });
  const [current, setCurrent] = useState<{ week: string; entries: Record<string, Entry> }>({ week: "", entries: {} });
  useEffect(() => {
    if (week === currentWeek) return;
    const db = getDatabase(), reference = collection(db, "leaderboards", currentWeek, "entries");
    const next = (snapshot: QuerySnapshot<DocumentData>) => {
      setCurrent({ week: currentWeek, entries: Object.fromEntries(snapshot.docs.map(item => [item.id, { ...item.data(), uid: item.id }])) });
    };
    const failed = () => setCurrent({ week: currentWeek, entries: {} });
    return live ? onSnapshot(reference, next, failed) : observeOnce(db, JSON.stringify(["xp-current-week", currentWeek]), () => getDocs(reference), next, failed);
  }, [week, currentWeek, getDatabase, live]);
  useEffect(() => {
    let active = true;
    setProfiles({ key: members, tasks: {} });
    const stops = (JSON.parse(members) as string[][]).filter(([uid, username, state]) => uid !== viewerUid && /^[a-z0-9._-]{3,24}$/.test(username!) && state !== "complete").map(([uid, username]) => {
      const update = (tasks: Task[] | null) => {
        if (active) setProfiles(previous => ({ key: members, tasks: { ...(previous.key === members ? previous.tasks : {}), [uid!]: tasks } }));
      };
      const db = getDatabase(), reference = doc(db, "publicProfiles", username!);
      const next = (snapshot: DocumentSnapshot<DocumentData>) => {
        const profile = snapshot.data();
        update(profile?.["uid"] === uid && Array.isArray(profile?.["dashboard"]?.dailyTasks) ? profile["dashboard"].dailyTasks : null);
      };
      return live ? onSnapshot(reference, next, () => update(null)) : observeOnce(db, JSON.stringify(["xp-profile", username]), () => getDoc(reference), next, () => update(null));
    });
    return () => { active = false; stops.forEach(stop => stop()); };
  }, [members, viewerUid, getDatabase, live]);
  return Object.fromEntries(entries.map(entry => {
    const uid = String(entry.uid);
    if (entry.focusDays && typeof entry.xp === "number") return [uid, meta(entry)];
    const tasks = uid === viewerUid ? viewerTasks : profiles.key === members ? profiles.tasks[uid] : null;
    if (tasks) return [uid, getXpSummary(tasks, Number(entry.focusXp) || 0)];
    const latest = week === currentWeek ? entry : current.week === currentWeek ? current.entries[uid] : null;
    return [uid, latest && typeof latest.xp === "number" && Number.isFinite(latest.xp) ? meta(latest) : null];
  })) as Record<string, Xp | null>;
}
