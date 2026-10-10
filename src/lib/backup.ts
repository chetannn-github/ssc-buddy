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

// Kept far below the free-plan 100 KB cap even for multi-byte Hindi/Unicode text.
const JSONBIN_CHUNK_BYTES = 30_000;

type StorageEntry = { key: string; value: string; part?: number; total?: number };

function splitStorageSnapshot(storage: Record<string, string>) {
  const chunks: StorageEntry[][] = [];
  let current: StorageEntry[] = [];
  const push = (entry: StorageEntry) => {
    const candidate = [...current, entry];
    if (current.length && JSON.stringify(candidate).length > JSONBIN_CHUNK_BYTES) {
      chunks.push(current);
      current = [entry];
    } else current = candidate;
  };
  for (const [key, value] of Object.entries(storage)) {
    const size = Math.max(1, JSONBIN_CHUNK_BYTES - 2_000);
    const total = Math.ceil(value.length / size);
    for (let part = 0; part < total; part += 1)
      push({ key, value: value.slice(part * size, (part + 1) * size), ...(total > 1 ? { part, total } : {}) });
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function jsonBinRequest<T>(url: string, init: RequestInit, message: string): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || message);
  return payload;
}

type JsonBinRecord = { metadata?: { id?: string }; record?: unknown; message?: string };

async function createJsonBinRecord(record: unknown, key: string, name: string) {
  const result = await jsonBinRequest<JsonBinRecord>(
    "https://api.jsonbin.io/v3/b",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Master-Key": key, "X-Bin-Private": "true", "X-Bin-Name": name },
      body: JSON.stringify(record),
    },
    "Cloud export failed.",
  );
  if (!result.metadata?.id) throw new Error("Cloud backup was created without an ID.");
  return result.metadata.id;
}

async function readJsonBinRecord(binId: string, config: JsonBinConfig) {
  const key = config.accessKey || config.masterKey;
  const result = await jsonBinRequest<JsonBinRecord>(
    `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}/latest`,
    { headers: config.accessKey ? { "X-Access-Key": key } : { "X-Master-Key": key } },
    "Cloud backup could not be read.",
  );
  return result.record;
}

async function deleteJsonBinRecord(binId: string, masterKey: string) {
  await jsonBinRequest<JsonBinRecord>(
    `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}`,
    { method: "DELETE", headers: { "X-Master-Key": masterKey } },
    "Old cloud backup could not be deleted.",
  );
}

export async function exportToJsonBin(config: JsonBinConfig) {
  const storage = snapshotLocalStorage();
  const chunkIds: string[] = [];
  let manifestId: string | null = null;
  try {
    for (const [index, chunk] of splitStorageSnapshot(storage).entries()) {
      chunkIds.push(await createJsonBinRecord({ format: "ssc-buddy-storage-chunk", version: 2, entries: chunk }, config.masterKey, `ssc-buddy-backup-${index + 1}`));
    }
    const binId = await createJsonBinRecord(
      { format: "ssc-buddy-storage-manifest", version: 1, exportedAt: new Date().toISOString(), chunkIds },
      config.masterKey,
      "ssc-buddy-backup-manifest",
    );
    manifestId = binId;
    if (config.binId && config.binId !== binId) {
      const oldRecord = await readJsonBinRecord(config.binId, { masterKey: config.masterKey });
      const oldChunks = isCloudManifest(oldRecord) ? oldRecord.chunkIds : [];
      await deleteJsonBinRecord(config.binId, config.masterKey);
      await Promise.all(oldChunks.map((id) => deleteJsonBinRecord(id, config.masterKey)));
    }
    saveJsonBinConfig({ ...config, binId });
    restoreStorageSnapshot({});
    return binId;
  } catch (error) {
    if (manifestId) await Promise.allSettled([deleteJsonBinRecord(manifestId, config.masterKey)]);
    await Promise.allSettled(chunkIds.map((id) => deleteJsonBinRecord(id, config.masterKey)));
    throw error;
  }
}

export async function importFromJsonBin(config: JsonBinConfig) {
  if (!config.binId) throw new Error("Enter the cloud backup ID first.");
  const record = await readJsonBinRecord(config.binId, config);
  const storage = isCloudManifest(record)
    ? restoreChunkEntries(await Promise.all(record.chunkIds.map(async (id) => {
        const chunk = await readJsonBinRecord(id, config);
        if (!isCloudChunk(chunk)) throw new Error("Cloud backup contains an invalid data chunk.");
        return chunk.entries;
      })))
    : isCloudSnapshot(record)
      ? record.storage
      : null;
  if (!storage) throw new Error("Cloud backup could not be read.");
  saveJsonBinConfig(config);
  restoreStorageSnapshot(storage);
}

type CloudSnapshot = { format: "ssc-buddy-storage"; storage: Record<string, string> };
type CloudChunk = { format: "ssc-buddy-storage-chunk"; entries: StorageEntry[] };
type CloudManifest = { format: "ssc-buddy-storage-manifest"; chunkIds: string[] };
const isCloudSnapshot = (value: unknown): value is CloudSnapshot =>
  Boolean(value && typeof value === "object" && (value as CloudSnapshot).format === "ssc-buddy-storage" && isStorageSnapshot((value as CloudSnapshot).storage));
const isCloudChunk = (value: unknown): value is CloudChunk =>
  Boolean(value && typeof value === "object" && (value as CloudChunk).format === "ssc-buddy-storage-chunk" && Array.isArray((value as CloudChunk).entries));
const isCloudManifest = (value: unknown): value is CloudManifest =>
  Boolean(value && typeof value === "object" && (value as CloudManifest).format === "ssc-buddy-storage-manifest" && Array.isArray((value as CloudManifest).chunkIds) && (value as CloudManifest).chunkIds.every((id) => typeof id === "string"));

function restoreChunkEntries(chunks: StorageEntry[][]): Record<string, string> {
  const fragments = new Map<string, StorageEntry[]>();
  chunks.flat().forEach((entry) => {
    const current = fragments.get(entry.key) ?? [];
    current.push(entry);
    fragments.set(entry.key, current);
  });
  return Object.fromEntries([...fragments.entries()].map(([key, entries]) => [
    key,
    entries.sort((a, b) => (a.part ?? 0) - (b.part ?? 0)).map((entry) => entry.value).join(""),
  ]));
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
