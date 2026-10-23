import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, type DocumentData, type DocumentSnapshot, type QuerySnapshot, type Firestore } from "firebase/firestore";
import { observeOnce } from "./read-once";
import { currentLeaderboardXp, type PublicXpData } from "./leaderboard-xp";
import { focusRewardTotal } from "./focus-rewards";
import type { Task } from "../mobile-tasks/src/domain/tasks";
import { rankWeeklyEntries } from "../mobile-tasks/src/domain/weekly-results";

type Entry = { uid: unknown; username?: unknown; xp?: unknown; level?: unknown; focusDays?: unknown; focusXp?: unknown };
type Xp = { xp: number; level: number };

/** Match mobile's current XP fallback for legacy and historical leaderboard entries. */
export function useLeaderboardXp(entries: Entry[], week: string, currentWeek: string, getDatabase: () => Firestore, viewerUid?: string, viewerTasks?: Task[], live = true, viewerFocusXp?: number | null) {
  const [current, setCurrent] = useState<{ week: string; entries: Record<string, Entry> }>({ week: "", entries: {} });
  const members = JSON.stringify(entries.map(entry => {
    const latest = week === currentWeek ? entry : current.week === currentWeek ? current.entries[String(entry.uid)] : undefined;
    const state = !live && week !== currentWeek && current.week !== currentWeek ? "waiting" : !live && latest?.focusDays && typeof latest.xp === "number" ? "complete" : "fallback";
    return [String(entry.uid), String(entry.username ?? ""), state];
  }).sort((a, b) => a[0]!.localeCompare(b[0]!)));
  const [profiles, setProfiles] = useState<{ key: string; values: Record<string, PublicXpData> }>({ key: "", values: {} });
  useEffect(() => {
    if (week === currentWeek) return;
    const db = getDatabase(), reference = collection(db, "leaderboards", currentWeek, "entries");
    const next = (snapshot: QuerySnapshot<DocumentData>) => {
      const ranked = rankWeeklyEntries(snapshot.docs.map(item => ({ ...item.data(), uid: item.id, week: currentWeek })));
      setCurrent({ week: currentWeek, entries: Object.fromEntries(ranked.map(item => [item.uid, item])) });
    };
    const failed = () => setCurrent({ week: currentWeek, entries: {} });
    return live ? onSnapshot(reference, next, failed) : observeOnce(db, JSON.stringify(["xp-current-week", currentWeek]), () => getDocs(reference), next, failed);
  }, [week, currentWeek, getDatabase, live]);
  useEffect(() => {
    let active = true;
    setProfiles({ key: members, values: {} });
    const stops = (JSON.parse(members) as string[][]).filter(([uid, username, state]) => (uid !== viewerUid || viewerFocusXp === undefined) && /^[a-z0-9._-]{3,24}$/.test(username!) && state === "fallback").map(([uid, username]) => {
      const update = (value: PublicXpData) => {
        if (active) setProfiles(previous => ({ key: members, values: { ...(previous.key === members ? previous.values : {}), [uid!]: value } }));
      };
      const db = getDatabase(), reference = doc(db, "publicProfiles", username!);
      const next = (snapshot: DocumentSnapshot<DocumentData>) => {
        const profile = snapshot.data();
        const owned = profile?.["uid"] === uid;
        update({ tasks: owned && Array.isArray(profile?.["dashboard"]?.dailyTasks) ? profile["dashboard"].dailyTasks : null,
          ...(owned && profile?.["focusDays"] && typeof profile["focusDays"] === "object" ? { focusXp: focusRewardTotal(profile["focusDays"]) } : {}) });
      };
      return live ? onSnapshot(reference, next, () => update({ tasks: null })) : observeOnce(db, JSON.stringify(["xp-profile", username]), () => getDoc(reference), next, () => update({ tasks: null }));
    });
    return () => { active = false; stops.forEach(stop => stop()); };
  }, [members, viewerUid, getDatabase, live, viewerFocusXp === undefined]);
  return Object.fromEntries(entries.map(entry => {
    const uid = String(entry.uid);
    return [uid, currentLeaderboardXp(entry, week, currentWeek, current.week === currentWeek ? current.entries[uid] : undefined,
      profiles.key === members ? profiles.values[uid] : undefined, { uid: viewerUid, tasks: viewerTasks, focusXp: viewerFocusXp })];
  })) as Record<string, Xp | null>;
}
