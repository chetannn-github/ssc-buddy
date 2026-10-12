import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import type { User } from "firebase/auth";
import { replaceCloudBackup } from "../lib/firebase";
import { PROFILE_KEY, normalizeProfile, type PracticeProfile } from "../lib/profile-store";
import { TASK_STORAGE_KEY, type Task } from "../domain/tasks";

type Props = { user: User; visible: boolean; onSkip: () => void; onImported: (profile: PracticeProfile, tasks: Task[]) => void };
type Backup = { format?: string; version?: number; storage?: Record<string, string>; profile?: unknown; subjects?: unknown; history?: unknown; marking?: unknown; tracker?: unknown; dailyTasks?: unknown; preferences?: Record<string, unknown> };
const trackerKeys = ["meta", "subjects", "revision", "tests", "activity", "pinned"] as const;
const parse = (value: string | undefined, fallback: unknown) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };

export function BackupImportPrompt({ user, visible, onSkip, onImported }: Props) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const importBackup = async () => {
    setError("");
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json"], copyToCacheDirectory: true });
    if (result.canceled) return;
    setBusy(true);
    try {
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      const backup = JSON.parse(text) as Backup;
      if (backup.format && backup.format !== "mcq-practice-backup") throw new Error("Choose an SSC Buddy JSON backup.");
      const storage = backup.storage ?? {};
      if (backup.format === "mcq-practice-backup" && backup.version === 4 && !backup.storage) throw new Error("This backup has no data snapshot.");
      const tasks = (parse(storage["ssc-buddy:tasks:v2"], backup.dailyTasks ?? []) as unknown[]).filter((item): item is Task => Boolean(item && typeof item === "object" && typeof (item as Task).id === "string"));
      const subjects = parse(storage["cbt-subjects"], backup.subjects ?? []) as Array<{ id?: unknown }>;
      const attempts = parse(storage["cbt-history"], backup.history ?? []) as Array<{ id?: unknown }>;
      const favourites = parse(storage["cbt-favorite-questions"], backup.preferences?.favoriteQuestionIds ?? []) as string[];
      const marking = parse(storage["cbt-marking"], backup.marking ?? null) as Record<string, unknown> | null;
      const trackerRaw = parse(storage["ssc-cgl-2027-tracker-v1"] ?? storage["ssc-buddy-mobile:tracker:v1"], backup.tracker ?? null) as Record<string, unknown> | null;
      const tracker = trackerRaw ? Object.fromEntries(trackerKeys.map((key) => [key, key === "pinned" ? (trackerRaw.pinnedChapterIds ?? trackerRaw.pinned ?? []) : trackerRaw[key]])) : null;
      const profile = normalizeProfile(parse(storage["cbt-practice-profile"], backup.profile ?? {}));
      const preferences = typeof parse(storage["cbt-test-dark-mode"], null) === "boolean" ? { testDarkMode: parse(storage["cbt-test-dark-mode"], null) } : null;
      const shared = Object.fromEntries(["ssc-buddy-liked-videos", "ssc-buddy-liked-music", "ssc-buddy-manifestation-completed"].flatMap((key) => storage[key] === undefined ? [] : [[key, storage[key]]]));
      await replaceCloudBackup(user, {
        tasks, subjects: subjects.filter((item): item is { id: string } => typeof item?.id === "string"),
        attempts: attempts.filter((item): item is { id: string } => typeof item?.id === "string"),
        favourites: favourites.filter((item): item is string => typeof item === "string"), marking, tracker, profile: profile.name ? profile : null, preferences, shared,
      });
      await AsyncStorage.multiSet([
        [TASK_STORAGE_KEY, JSON.stringify(tasks)], ["cbt-subjects", JSON.stringify(subjects)], ["cbt-history", JSON.stringify(attempts)],
        ["cbt-favorite-questions", JSON.stringify(favourites)], ["cbt-marking", JSON.stringify(marking ?? { positive: 4, negative: 1 })], [PROFILE_KEY, JSON.stringify(profile)],
      ]);
      onImported(profile, tasks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this backup.");
    } finally { setBusy(false); }
  };
  return <Modal transparent visible={visible} animationType="fade"><View style={styles.backdrop}><View style={styles.dialog}><Text style={styles.kicker}>WELCOME TO SSC BUDDY</Text><Text style={styles.title}>Restore your backup?</Text><Text style={styles.copy}>Bring your tasks, tracker and practice history into this new account. Existing cloud data will be replaced.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={busy} onPress={() => void importBackup()} style={[styles.primary, busy && styles.dim]}>{busy ? <ActivityIndicator size="small" color="#061a2d" /> : <Text style={styles.primaryText}>Choose backup file</Text>}</Pressable><Pressable disabled={busy} onPress={onSkip} style={styles.skip}><Text style={styles.skipText}>Start fresh</Text></Pressable></View></View></Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,.76)" }, dialog: { borderRadius: 22, padding: 22, backgroundColor: "#1c1c1c", borderWidth: 1, borderColor: "#343434" }, kicker: { color: "#60a5fa", fontSize: 10, letterSpacing: 1.6, fontWeight: "800" }, title: { marginTop: 8, color: "#fafafa", fontSize: 23, fontWeight: "800" }, copy: { marginTop: 8, color: "#a1a1aa", fontSize: 13, lineHeight: 20 }, error: { marginTop: 12, color: "#fca5a5", fontSize: 12, lineHeight: 18 }, primary: { height: 46, marginTop: 20, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#60a5fa" }, primaryText: { color: "#061a2d", fontWeight: "800", fontSize: 14 }, skip: { alignSelf: "center", padding: 12, marginTop: 4 }, skipText: { color: "#a1a1aa", fontSize: 13, fontWeight: "700" }, dim: { opacity: .62 } });
