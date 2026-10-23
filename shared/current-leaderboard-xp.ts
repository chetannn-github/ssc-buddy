import { getXpSummary } from "../mobile-tasks/src/domain/xp";
import { summarizeXp } from "../mobile-tasks/src/domain/xp-levels";
import type { Task } from "../mobile-tasks/src/domain/tasks";

export type LeaderboardIdentity = { uid: unknown; username?: unknown; xp?: unknown; level?: unknown; focusDays?: unknown; focusXp?: unknown };
export type CurrentProfileXp = { tasks: Task[] | null; focusXp?: number };

/** A historical row supplies weekly scores, never today's identity XP. */
export function currentLeaderboardXp(entry: LeaderboardIdentity, latest: LeaderboardIdentity | undefined, profile: CurrentProfileXp | undefined, viewerUid?: string, viewerTasks?: Task[]) {
  const tasks = String(entry.uid) === viewerUid ? viewerTasks ?? profile?.tasks : profile?.tasks;
  const focusXp = profile?.focusXp ?? (typeof latest?.focusXp === "number" ? latest.focusXp : undefined);
  if (tasks && focusXp !== undefined) return getXpSummary(tasks, focusXp);
  if (latest?.focusDays && typeof latest.xp === "number" && Number.isFinite(latest.xp)) return summarizeXp(latest.xp);
  if (tasks && latest) return getXpSummary(tasks);
  return typeof latest?.xp === "number" && Number.isFinite(latest.xp) ? summarizeXp(latest.xp) : null;
}
