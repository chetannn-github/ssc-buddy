import {
  loadHistory,
  loadMarking,
  loadSubjects,
  saveHistory,
  saveMarking,
  saveSubjects,
  type MarkingScheme,
  type Subject,
  type TestRecord,
} from "@/lib/exam";
import { loadPracticeProfile, savePracticeProfile, type PracticeProfile } from "@/lib/profile";
import { loadTrackerData, saveTrackerData } from "@/lib/tracker-store";
import type { TrackerData } from "@/lib/tracker";
import { loadDailyTasks, saveDailyTasks, type DailyTask } from "@/lib/daily-tasks";

type PracticeBackup = {
  format: "mcq-practice-backup";
  version: 1 | 2;
  exportedAt: string;
  profile: PracticeProfile | null;
  subjects: Subject[];
  marking: MarkingScheme | null;
  history: TestRecord[];
  tracker: TrackerData;
  dailyTasks: DailyTask[];
};

function isProfile(value: unknown): value is PracticeProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<PracticeProfile>;
  return (
    typeof profile.name === "string" &&
    typeof profile.questionGoal === "number" &&
    Number.isFinite(profile.questionGoal) &&
    profile.questionGoal >= 1 &&
    (profile.avatar === undefined || typeof profile.avatar === "string") &&
    (profile.manifestation === undefined || typeof profile.manifestation === "string")
  );
}

export function downloadPracticeBackup() {
  const backup: PracticeBackup = {
    format: "mcq-practice-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: loadPracticeProfile(),
    subjects: loadSubjects(),
    marking: loadMarking(),
    history: loadHistory(),
    tracker: loadTrackerData(),
    dailyTasks: loadDailyTasks(),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `mcq-practice-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function restorePracticeBackup(file: File) {
  const parsed = JSON.parse(await file.text()) as Partial<PracticeBackup>;
  const trackerOnly = parsed as unknown as Partial<TrackerData>;
  if (!parsed.format && Array.isArray(trackerOnly.subjects)) {
    saveTrackerData(trackerOnly as TrackerData);
    return loadPracticeProfile();
  }
  if (
    parsed.format !== "mcq-practice-backup" ||
    (parsed.version !== 1 && parsed.version !== 2) ||
    !Array.isArray(parsed.subjects) ||
    !Array.isArray(parsed.history) ||
    (parsed.profile !== null && !isProfile(parsed.profile))
  ) {
    throw new Error("This is not a valid MCQ Practice backup file.");
  }

  saveSubjects(parsed.subjects);
  saveHistory(parsed.history);
  if (parsed.marking && typeof parsed.marking === "object")
    saveMarking(parsed.marking as MarkingScheme);
  if (parsed.profile) savePracticeProfile(parsed.profile);
  if (parsed.tracker && typeof parsed.tracker === "object") saveTrackerData(parsed.tracker);
  if (Array.isArray(parsed.dailyTasks)) saveDailyTasks(parsed.dailyTasks);
  window.dispatchEvent(new Event("cbt-backup-restored"));
  return parsed.profile ?? null;
}
