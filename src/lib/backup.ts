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

type PracticeBackup = {
  format: "mcq-practice-backup";
  version: 1;
  exportedAt: string;
  profile: PracticeProfile | null;
  subjects: Subject[];
  marking: MarkingScheme | null;
  history: TestRecord[];
};

function isProfile(value: unknown): value is PracticeProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<PracticeProfile>;
  return (
    typeof profile.name === "string" &&
    typeof profile.questionGoal === "number" &&
    Number.isFinite(profile.questionGoal) &&
    profile.questionGoal >= 1 &&
    (profile.avatar === undefined || typeof profile.avatar === "string")
  );
}

export function downloadPracticeBackup() {
  const backup: PracticeBackup = {
    format: "mcq-practice-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: loadPracticeProfile(),
    subjects: loadSubjects(),
    marking: loadMarking(),
    history: loadHistory(),
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
  if (
    parsed.format !== "mcq-practice-backup" ||
    parsed.version !== 1 ||
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
  window.dispatchEvent(new Event("cbt-backup-restored"));
  return parsed.profile ?? null;
}
