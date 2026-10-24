import { useEffect, useState } from "react";
import type { collection, doc, onSnapshot, Firestore } from "firebase/firestore";
import { currentLeaderboardXp, type CurrentProfileXp } from "./current-leaderboard-xp";
import { focusRewardTotal } from "./focus-rewards";
import { rankWeeklyEntries } from "../mobile-tasks/src/domain/weekly-results";
import type { Task } from "../mobile-tasks/src/domain/tasks";
import { profileDataSource } from "./profile-data-source";

type Entry = { uid: unknown; username?: unknown; xp?: unknown; level?: unknown; focusDays?: unknown; focusXp?: unknown };
type Xp = { xp: number; level: number };

type FirestoreReader = { collection: typeof collection; doc: typeof doc; onSnapshot: typeof onSnapshot };
export function createUseLeaderboardXp({ collection, doc, onSnapshot }: FirestoreReader) {
const source = profileDataSource({ collection, doc, onSnapshot });
return function useLeaderboardXp(entries: Entry[], week: string, currentWeek: string, getDatabase: () => Firestore, viewerUid?: string, viewerTasks?: Task[]) {
  const members = JSON.stringify(entries.map(entry => [String(entry.uid), String(entry.username ?? "")]).sort((a, b) => a[0]!.localeCompare(b[0]!)));
  const [profiles, setProfiles] = useState<{ key: string; values: Record<string, CurrentProfileXp> }>({ key: "", values: {} });
  const [current, setCurrent] = useState<{ week: string; entries: Record<string, Entry> }>({ week: "", entries: {} });
  useEffect(() => {
    if (week === currentWeek || !entries.length) return;
    let active = true;
    const stop = source.watchWeek(getDatabase(), currentWeek, snapshot => {
      const latest = rankWeeklyEntries(snapshot.docs.map(item => ({ ...item.data(), uid: item.id, week: currentWeek })));
      if (active) setCurrent({ week: currentWeek, entries: Object.fromEntries(latest.map(item => [item.uid, item])) });
    }, () => { if (active) setCurrent({ week: currentWeek, entries: {} }); });
    return () => { active = false; stop(); };
  }, [week, currentWeek, getDatabase, entries.length > 0]);
  useEffect(() => {
    let active = true;
    setProfiles({ key: members, values: {} });
    const stops = (JSON.parse(members) as string[][]).filter(([, username]) => /^[a-z0-9._-]{3,24}$/.test(username!)).map(([uid, username]) => {
      const update = (value: CurrentProfileXp) => {
        if (active) setProfiles(previous => ({ key: members, values: { ...(previous.key === members ? previous.values : {}), [uid!]: value } }));
      };
      return source.watchDocument(getDatabase(), ["publicProfiles", username!], snapshot => {
        const profile = snapshot.data();
        const owned = profile?.["uid"] === uid;
        update({ tasks: owned && Array.isArray(profile?.["dashboard"]?.dailyTasks) ? profile["dashboard"].dailyTasks : null,
          ...(owned ? { focusXp: focusRewardTotal(profile?.["focusDays"] ?? {}) } : {}) });
      }, () => update({ tasks: null }));
    });
    return () => { active = false; stops.forEach(stop => stop()); };
  }, [members, getDatabase]);
  return Object.fromEntries(entries.map(entry => {
    const uid = String(entry.uid);
    const latest = week === currentWeek ? entry : current.week === currentWeek ? current.entries[uid] : undefined;
    return [uid, currentLeaderboardXp(entry, latest, profiles.key === members ? profiles.values[uid] : undefined, viewerUid, viewerTasks)];
  })) as Record<string, Xp | null>;
}
}
