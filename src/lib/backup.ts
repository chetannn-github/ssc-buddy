import {
  clearTestDarkMode,
  saveFavoriteQuestionIds,
  saveHistory,
  saveMarking,
  saveSubjects,
  saveTestDarkMode,
  type MarkingScheme,
  type Subject,
  type TestRecord,
} from "@/lib/exam";
import {
  clearPracticeProfile,
  loadPracticeProfile,
  savePracticeProfile,
  type PracticeProfile,
} from "@/lib/profile";
import { saveTrackerData } from "@/lib/tracker-store";
import type { TrackerData } from "@/lib/tracker";
import { saveDailyTasks, type DailyTask } from "@/lib/daily-tasks";

type PracticeBackup = {
  format: "mcq-practice-backup";
  version: 1 | 2 | 3 | 4;
  exportedAt: string;
  profile?: PracticeProfile | null;
  subjects?: Subject[];
  marking?: MarkingScheme | null;
  history?: TestRecord[];
  tracker?: TrackerData;
  dailyTasks?: DailyTask[];
  preferences?: {
    favoriteQuestionIds: string[];
    testDarkMode: boolean | null;
    likedVideos: string[];
    likedMusic: string[];
    manifestationCompleted: string | null;
  };
  storage?: Record<string, string>;
};

const VIDEO_LIKES_KEY = "ssc-buddy-liked-videos";
const MUSIC_LIKES_KEY = "ssc-buddy-liked-music";
const MANIFESTATION_COMPLETION_KEY = "ssc-buddy-manifestation-completed";
const JSONBIN_CONFIG_KEY = "ssc-buddy-jsonbin-config";

export type JsonBinConfig = { masterKey: string; accessKey?: string; binId?: string };

function saveStringList(key: string, values: string[]) {
  localStorage.setItem(key, JSON.stringify([...new Set(values)]));
}

function snapshotLocalStorage(): Record<string, string> {
  const storage: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null && key !== JSONBIN_CONFIG_KEY) storage[key] = localStorage.getItem(key) ?? "";
  }
  return storage;
}

function restoreStorageSnapshot(storage: Record<string, string>) {
  const config = localStorage.getItem(JSONBIN_CONFIG_KEY);
  localStorage.clear();
  if (config) localStorage.setItem(JSONBIN_CONFIG_KEY, config);
  Object.entries(storage).forEach(([key, value]) => localStorage.setItem(key, value));
  window.dispatchEvent(new Event("cbt-backup-restored"));
}

export function loadJsonBinConfig(): JsonBinConfig | null {
  try {
    const value = JSON.parse(localStorage.getItem(JSONBIN_CONFIG_KEY) ?? "null") as Partial<JsonBinConfig> | null;
    return value && typeof value.masterKey === "string" && value.masterKey.trim()
      ? { masterKey: value.masterKey.trim(), ...(value.accessKey?.trim() ? { accessKey: value.accessKey.trim() } : {}), ...(value.binId?.trim() ? { binId: value.binId.trim() } : {}) }
      : null;
  } catch { return null; }
}

export function saveJsonBinConfig(config: JsonBinConfig) {
  localStorage.setItem(JSONBIN_CONFIG_KEY, JSON.stringify(config));
}

export async function exportToJsonBin(config: JsonBinConfig) {
  const storage = snapshotLocalStorage();
  const create = await fetch("https://api.jsonbin.io/v3/b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Master-Key": config.masterKey, "X-Bin-Private": "true", "X-Bin-Name": "ssc-buddy-backup" },
    body: JSON.stringify({ format: "ssc-buddy-storage", version: 1, exportedAt: new Date().toISOString(), storage }),
  });
  const created = (await create.json()) as { metadata?: { id?: string }; message?: string };
  const binId = created.metadata?.id;
  if (!create.ok || !binId) throw new Error(created.message || "Cloud export failed.");
  if (config.binId && config.binId !== binId) {
    const remove = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(config.binId)}`, {
      method: "DELETE", headers: { "X-Master-Key": config.masterKey },
    });
    if (!remove.ok) throw new Error("New backup saved, but old cloud backup could not be deleted.");
  }
  saveJsonBinConfig({ ...config, binId });
  restoreStorageSnapshot({});
  return binId;
}

export async function importFromJsonBin(config: JsonBinConfig) {
  if (!config.binId) throw new Error("Enter the cloud backup ID first.");
  const readKey = config.accessKey || config.masterKey;
  const response = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(config.binId)}/latest`, {
    headers: config.accessKey ? { "X-Access-Key": readKey } : { "X-Master-Key": readKey },
  });
  const payload = (await response.json()) as { record?: unknown; message?: string };
  const record = payload.record as { storage?: unknown } | undefined;
  if (!response.ok || !record || !isStorageSnapshot(record.storage))
    throw new Error(payload.message || "Cloud backup could not be read.");
  saveJsonBinConfig(config);
  restoreStorageSnapshot(record.storage);
}

function isStorageSnapshot(value: unknown): value is Record<string, string> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Object.values(value as Record<string, unknown>).every((item) => typeof item === "string")
  );
}

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
    version: 4,
    exportedAt: new Date().toISOString(),
    storage: snapshotLocalStorage(),
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
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4)
  ) {
    throw new Error("This is not a valid MCQ Practice backup file.");
  }

  if (parsed.version === 4) {
    if (!isStorageSnapshot(parsed.storage))
      throw new Error("This full backup has an invalid local storage snapshot.");
    restoreStorageSnapshot(parsed.storage);
    return loadPracticeProfile();
  }

  if (
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
  else if (parsed.profile === null) clearPracticeProfile();
  if (parsed.tracker && typeof parsed.tracker === "object") saveTrackerData(parsed.tracker);
  if (Array.isArray(parsed.dailyTasks)) saveDailyTasks(parsed.dailyTasks);
  if (parsed.preferences && typeof parsed.preferences === "object") {
    const preferences = parsed.preferences;
    if (Array.isArray(preferences.favoriteQuestionIds))
      saveFavoriteQuestionIds(preferences.favoriteQuestionIds.filter((item): item is string => typeof item === "string"));
    if (typeof preferences.testDarkMode === "boolean") saveTestDarkMode(preferences.testDarkMode);
    else if (preferences.testDarkMode === null) clearTestDarkMode();
    if (Array.isArray(preferences.likedVideos)) saveStringList(VIDEO_LIKES_KEY, preferences.likedVideos);
    if (Array.isArray(preferences.likedMusic)) saveStringList(MUSIC_LIKES_KEY, preferences.likedMusic);
    if (typeof preferences.manifestationCompleted === "string")
      localStorage.setItem(MANIFESTATION_COMPLETION_KEY, preferences.manifestationCompleted);
    else if (preferences.manifestationCompleted === null)
      localStorage.removeItem(MANIFESTATION_COMPLETION_KEY);
  }
  window.dispatchEvent(new Event("cbt-backup-restored"));
  return parsed.profile ?? null;
}
