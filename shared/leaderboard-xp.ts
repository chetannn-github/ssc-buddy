import { getXpSummary } from "../mobile-tasks/src/domain/xp";
import { summarizeXp } from "../mobile-tasks/src/domain/xp-levels";
import type { Task } from "../mobile-tasks/src/domain/tasks";

export type LeaderboardXpEntry = { uid: unknown; username?: unknown; xp?: unknown; level?: unknown; focusDays?: unknown; focusXp?: unknown };
export type PublicXpData = { tasks: Task[] | null; focusXp?: number };

/** Identity XP is current; the selected week's score/rank stays on its own row. */
export function currentLeaderboardXp(entry: LeaderboardXpEntry, week: string, currentWeek: string, latest: LeaderboardXpEntry | undefined, profile?: PublicXpData, viewer?: { uid?: string; tasks?: Task[]; focusXp?: number }) {
  const current = week === currentWeek ? entry : latest;
  const ownTasks = String(entry.uid) === viewer?.uid ? viewer.tasks : undefined;
  if (ownTasks && viewer?.focusXp !== undefined) return getXpSummary(ownTasks, viewer.focusXp);
  if (profile?.tasks && profile.focusXp !== undefined) return getXpSummary(profile.tasks, profile.focusXp);
  if (current?.focusDays && typeof current.xp === "number" && Number.isFinite(current.xp)) return summarizeXp(current.xp);
  const tasks = ownTasks ?? profile?.tasks;
  if (tasks) return getXpSummary(tasks, Number(current?.focusXp) || 0);
  return typeof current?.xp === "number" && Number.isFinite(current.xp) ? summarizeXp(current.xp) : null;
}
