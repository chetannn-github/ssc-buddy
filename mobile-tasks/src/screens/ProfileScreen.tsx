// @ts-nocheck
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView as NativeScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { User } from "firebase/auth";

import { dateKey, formatMinutes, summarizeTasks, type Task } from "../domain/tasks";
import { colors } from "../theme";
import { MockTestLogDialog, type MockTestLog } from "./MockTestLogDialog";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
import type { PracticeProfile } from "../lib/profile-store";
import { appendTrackerTest, syncTrackerSections, watchPracticeEntities, watchTrackerSections, watchTrackerTests } from "../lib/firebase";

const ScrollView = (props: any) => <NativeScrollView {...props} scrollEventThrottle={16} onScroll={(event) => { if (!props.horizontal) reportVerticalScroll(event.nativeEvent.contentOffset.y); props.onScroll?.(event); }} />;

type Range = "today" | "week" | "lastMonth" | "year" | "all";
const ranges: Array<{ key: Range; label: string }> = [
  { key: "today", label: "Today" }, { key: "week", label: "This week" }, { key: "lastMonth", label: "Last month" }, { key: "year", label: "This year" }, { key: "all", label: "All time" },
];
const withinRange = (date: string, range: Range) => {
  if (range === "all") return true;
  const now = new Date(), start = new Date(now);
  if (range === "today") return date === dateKey(now);
  if (range === "week") start.setDate(now.getDate() - 6);
  if (range === "lastMonth") start.setMonth(now.getMonth() - 1);
  if (range === "year") start.setFullYear(now.getFullYear() - 1);
  return date >= dateKey(start) && date <= dateKey(now);
};
const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Keep these exact filenames aligned with public/avatars/manifest.json in the
// web app. `avatar` is the filename in the shared cloud profile document.
const avatarAssets: Record<string, number> = {
  "1.jpg": require("../../assets/avatars/1.jpg"),
  "32.jpg": require("../../assets/avatars/32.jpg"),
  "Motivational Quotes.jpg": require("../../assets/avatars/Motivational Quotes.jpg"),
  "babe get up i believe in you_.jpg": require("../../assets/avatars/babe get up i believe in you_.jpg"),
  "download (1).jpg": require("../../assets/avatars/download (1).jpg"),
  "download (2).jpg": require("../../assets/avatars/download (2).jpg"),
  "download (3).jpg": require("../../assets/avatars/download (3).jpg"),
  "download (4).jpg": require("../../assets/avatars/download (4).jpg"),
  "download (5).jpg": require("../../assets/avatars/download (5).jpg"),
  "download.jpg": require("../../assets/avatars/download.jpg"),
  "pain is  fuel 🦅🟥.jpg": require("../../assets/avatars/pain is  fuel 🦅🟥.jpg"),
  "💪🏻.jpg": require("../../assets/avatars/💪🏻.jpg"),
};
const avatarFiles = Object.keys(avatarAssets);
const defaultAvatarFor = (name: string) => {
  const hash = Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0);
  return avatarFiles[hash % avatarFiles.length] ?? avatarFiles[0];
};

type Props = {
  user: User | null;
  tasks: Task[];
  profileSettings: PracticeProfile | null;
  onProfileSaved: (profile: PracticeProfile) => void;
  onLogout: () => void;
  onOpenVideo: () => void;
  onOpenMusic: () => void;
  onOpenTracker: (tab: "Syllabus" | "Revision" | "Mock Test") => void;
  streak: number;
};

type ImportedSubject = { id: string; name: string; chapters: Array<{ id: string; name: string; total: number; completed: number }> };

function parseSubjectsFile(value: unknown): ImportedSubject[] {
  const source = value as { subjects?: unknown };
  if (!Array.isArray(source?.subjects) || source.subjects.length === 0) throw new Error("JSON must include a non-empty subjects array.");
  const ids = new Set<string>();
  return source.subjects.map((item, subjectIndex) => {
    const subject = item as { id?: unknown; name?: unknown; chapters?: unknown };
    const id = typeof subject.id === "string" ? subject.id.trim() : "";
    const name = typeof subject.name === "string" ? subject.name.trim() : "";
    if (!id || !name || ids.has(id) || !Array.isArray(subject.chapters)) throw new Error(`Subject ${subjectIndex + 1} needs a unique id, name, and chapters array.`);
    ids.add(id);
    const chapterIds = new Set<string>();
    const chapters = subject.chapters.map((chapterItem, chapterIndex) => {
      const chapter = chapterItem as { id?: unknown; name?: unknown; total?: unknown; completed?: unknown };
      const chapterId = typeof chapter.id === "string" ? chapter.id.trim() : "";
      const chapterName = typeof chapter.name === "string" ? chapter.name.trim() : "";
      const total = Math.max(1, Number(chapter.total) || 0);
      if (!chapterId || !chapterName || chapterIds.has(chapterId)) throw new Error(`${name}: chapter ${chapterIndex + 1} needs a unique id and name.`);
      chapterIds.add(chapterId);
      return { id: chapterId, name: chapterName, total, completed: Math.min(total, Math.max(0, Number(chapter.completed) || 0)) };
    });
    return { id, name, chapters };
  });
}

export function ProfileScreen({ user, tasks, profileSettings, onProfileSaved, onLogout, onOpenVideo, onOpenMusic, onOpenTracker, streak }: Props) {
  const [profileName, setProfileName] = useState(profileSettings?.name ?? "");
  const [profileReady, setProfileReady] = useState(profileSettings !== null);
  const [examName, setExamName] = useState(profileSettings?.examName ?? "");
  const [goal, setGoal] = useState(String(profileSettings?.questionGoal ?? 100));
  const [manifestation, setManifestation] = useState(profileSettings?.manifestation ?? "");
  const [editing, setEditing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const name = profileReady ? (profileName.trim() || user?.displayName?.trim() || user?.email?.split("@")[0] || "Student") : "";
  const [avatarFile, setAvatarFile] = useState(() => profileSettings?.avatar && avatarAssets[profileSettings.avatar] ? profileSettings.avatar : defaultAvatarFor(profileSettings?.name || user?.displayName || user?.email || "Student"));
  const [viewingAvatar, setViewingAvatar] = useState(false);
  const [spin] = useState(() => new Animated.Value(0));
  const [loggingMockTest, setLoggingMockTest] = useState(false);
  const [mockTests, setMockTests] = useState<MockTestLog[]>([]);
  const [syllabusSubjects, setSyllabusSubjects] = useState<string[]>([]);
  const [trackerData, setTrackerData] = useState<Record<string, any>>({ subjects: [], revision: {} });
  const [practiceRecords, setPracticeRecords] = useState<Array<{ id: string; date: string; subject?: string; chapter?: string }>>([]);
  const [range, setRange] = useState<Range>("today");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeMenuVisible, setRangeMenuVisible] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [addingSubjects, setAddingSubjects] = useState(false);
  const [importedSubjects, setImportedSubjects] = useState<ImportedSubject[]>([]);
  const [subjectFileName, setSubjectFileName] = useState("");
  const [subjectImportError, setSubjectImportError] = useState("");
  const rangeMenuProgress = useRef(new Animated.Value(0)).current;
  const rangeContent = useRef(new Animated.Value(1)).current;
  const avatarImage = avatarAssets[avatarFile] ?? avatarAssets[avatarFiles[0]];
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const changeAvatar = () => {
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 560, useNativeDriver: true }).start();
    const options = avatarFiles.filter((file) => file !== avatarFile);
    const nextAvatar = options[Math.floor(Math.random() * options.length)] ?? avatarFile;
    setAvatarFile(nextAvatar);
    onProfileSaved({
      name: profileName,
      examName,
      questionGoal: Number(goal) || 100,
      manifestation,
      avatar: nextAvatar,
    });
  };
  const chooseSubjectsFile = async () => {
    if (savingProfile) return;
    setSubjectImportError("");
    try {
      // File.pickFileAsync owns the Android document permission grant for the
      // selected URI. It avoids the missing-read-permission issue produced by
      // DocumentPicker + a separate FileSystem reader.
      const result = await File.pickFileAsync({ mimeTypes: ["application/json", "text/json"] });
      if (result.canceled) return;
      const asset = result.result;
      const raw = await asset.text();
      const subjects = parseSubjectsFile(JSON.parse(raw));
      setImportedSubjects(subjects);
      setSubjectFileName(asset.name || "syllabus.json");
    } catch (error) {
      setImportedSubjects([]); setSubjectFileName("");
      setSubjectImportError(error instanceof Error ? error.message : "Choose a valid syllabus JSON file.");
    }
  };
  useEffect(() => {
    if (!profileSettings) setProfileReady(true);
    if (!user) return;
    return watchTrackerTests(user, (tests) => setMockTests(tests.map((test) => ({ ...test, type: test.type === "Mains" ? "Mains" : test.type === "Pre" ? "Pre" : "Sectional", subject: test.subjectId || "General", score: Number(test.score ?? 0), total: Number(test.total ?? 0), accuracy: Number(test.accuracy ?? 0) }))));
  }, [user?.uid]);
  useEffect(() => {
    if (!user) { setSyllabusSubjects([]); setTrackerData({ subjects: [], revision: {} }); return; }
    return watchTrackerSections(user, (sections) => {
      setTrackerData(sections);
      setSyllabusSubjects(Array.isArray(sections.subjects) ? sections.subjects.map((subject: any) => String(subject.name ?? "")).filter(Boolean) : []);
    });
  }, [user?.uid]);
  useEffect(() => {
    if (!user) { setPracticeRecords([]); return; }
    return watchPracticeEntities(user, "practiceAttempts", (items) => setPracticeRecords(items
      .filter((item) => typeof item.date === "string")
      .map((item) => ({ id: String(item.id), date: String(item.date), subject: typeof item.subject === "string" ? item.subject : "", chapter: typeof item.chapter === "string" ? item.chapter : "" }))));
  }, [user?.uid]);
  useEffect(() => {
    if (!profileSettings) return;
    setProfileName(profileSettings.name); setExamName(profileSettings.examName ?? ""); setGoal(String(profileSettings.questionGoal)); setManifestation(profileSettings.manifestation ?? "");
    setAvatarFile(profileSettings.avatar && avatarAssets[profileSettings.avatar] ? profileSettings.avatar : defaultAvatarFor(profileSettings.name || user?.displayName || user?.email || "Student"));
    setProfileReady(true);
  }, [profileSettings]);
  const saveMockTest = (entry: MockTestLog) => {
    if (!user) return;
    void appendTrackerTest(user, { id: entry.id, date: entry.date, createdAt: entry.createdAt, subjectId: "", type: entry.type, score: entry.score, total: entry.total, accuracy: entry.accuracy, notes: "" }, entry.subject);
  };
  const filteredTasks = tasks.filter((task) => withinRange(task.date, range));
  const filteredSummary = summarizeTasks(filteredTasks);
  const practiceSessions = filteredTasks.filter((task) => task.type === "Practice Session").length;
  // Match the web profile exactly: tracker figures represent completed
  // activity within the selected date range, not the syllabus totals.
  const trackerActivities = Array.isArray(trackerData.activity) ? trackerData.activity : [];
  const trackerTotalFor = (type: "lecture" | "revision" | "mock-test") => trackerActivities
    .filter((entry: any) => entry?.type === type && typeof entry?.date === "string" && withinRange(entry.date, range))
    .reduce((sum: number, entry: any) => sum + Math.max(0, Number(entry.count) || 0), 0);
  const trackerLectures = trackerTotalFor("lecture");
  const trackerRevisions = trackerTotalFor("revision");
  const loggedMocks = trackerTotalFor("mock-test") + mockTests.filter((test) => withinRange(test.date, range)).length;
  const activeRangeLabel = ranges.find((item) => item.key === range)?.label ?? "Today";
  const changeRange = (next: Range) => {
    if (next !== range) {
      rangeContent.setValue(0.55);
      Animated.timing(rangeContent, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
    setRange(next);
    setRangeOpen(false);
  };
  useEffect(() => {
    rangeMenuProgress.stopAnimation();
    if (rangeOpen) {
      setRangeMenuVisible(true);
      Animated.timing(rangeMenuProgress, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    if (!rangeMenuVisible) return;
    Animated.timing(rangeMenuProgress, { toValue: 0, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setRangeMenuVisible(false);
    });
  }, [rangeOpen, rangeMenuProgress, rangeMenuVisible]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: 16 }]} onScrollBeginDrag={() => setRangeOpen(false)}>
      <View style={styles.profileRow}>
        <View accessibilityLabel={`Practice streak: ${streak} days`} style={[styles.profileStreak, streak > 0 && styles.profileStreakActive]}><MaterialCommunityIcons name="fire" size={15} color={streak > 0 ? "#fcd34d" : "#a1a1aa"} /><Text style={[styles.profileStreakText, streak > 0 && styles.profileStreakTextActive]}>{streak}</Text></View>
        <View style={[styles.avatar, { width: 70, height: 70, borderRadius: 35 }]}><Pressable onPress={() => setViewingAvatar(true)}><Image source={avatarImage} style={[styles.avatarImage, { borderRadius: 35 }]} /></Pressable><Pressable style={[styles.avatarBadge, { width: 25, height: 25, borderRadius: 13 }]} accessibilityLabel="Change profile image" onPress={changeAvatar}><Animated.View style={{ transform: [{ rotate }] }}><MaterialCommunityIcons name="sync" size={12} color={colors.muted} /></Animated.View></Pressable></View>
        <View style={[styles.identity, { marginTop: 9 }]}>
          <Text style={styles.exam}>{examName}</Text>
          <View style={styles.nameLine}><Text style={styles.name} numberOfLines={1}>{name}</Text><View style={styles.profileActions}><Pressable accessibilityLabel="Edit profile" hitSlop={10} onPressIn={() => setEditing(true)}><MaterialCommunityIcons name="pencil-outline" size={17} color={colors.muted} /></Pressable><Pressable accessibilityLabel="Log out" hitSlop={10} onPress={() => setConfirmLogout(true)}><MaterialCommunityIcons name="logout" size={17} color={colors.muted} /></Pressable></View></View>
        </View>
      </View>

      <View style={[styles.actionRow, { marginTop: 11 }]}>
        <Pressable style={styles.action} onPress={() => setLoggingMockTest(true)}><MaterialCommunityIcons name="file-edit-outline" size={18} color={colors.text} /><Text style={styles.actionText}>Log mock test</Text></Pressable>
        <Pressable style={styles.action} onPress={onOpenVideo}><MaterialCommunityIcons name="play-outline" size={18} color={colors.text} /><Text style={styles.actionText}>Videos</Text></Pressable>
        <Pressable style={styles.action} onPress={onOpenMusic}><MaterialCommunityIcons name="music-note" size={18} color={colors.text} /><Text style={styles.actionText}>Music</Text></Pressable>
      </View>

      <View style={[styles.summaryCard, { position: "relative", marginTop: 16, paddingTop: 13 }]}>
        {rangeOpen && <Pressable accessibilityLabel="Close date range menu" style={{ position: "absolute", zIndex: 10, top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => setRangeOpen(false)} />}
        <View style={[styles.cardHeader, { elevation: 31 }]}><Text style={styles.cardEyebrow}>PRACTICE</Text><View style={[styles.rangeWrap, { elevation: 40 }]}><Pressable style={styles.rangeButton} onPress={() => setRangeOpen((value) => !value)}><Text style={styles.rangeText}>{activeRangeLabel}</Text><MaterialCommunityIcons name={rangeOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} /></Pressable>{rangeMenuVisible && <Animated.View pointerEvents={rangeOpen ? "auto" : "none"} style={[styles.rangeMenu, { opacity: rangeMenuProgress, transform: [{ translateY: rangeMenuProgress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }, { scale: rangeMenuProgress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>{ranges.map((item) => { const selected = item.key === range; return <Pressable key={item.key} style={[styles.rangeOption, selected && styles.rangeOptionActive]} onPress={() => changeRange(item.key)}><Text style={[styles.rangeOptionText, selected && styles.rangeOptionTextActive]}>{item.label}</Text>{selected && <MaterialCommunityIcons name="check" size={15} color="#171717" />}</Pressable>; })}</Animated.View>}</View></View>
        <Animated.View style={{ opacity: rangeContent, transform: [{ translateY: rangeContent.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }}>
        <View style={styles.practiceGrid}>
          <Stat columns={2} label="Question goal" value={goal || "0"} />
          <Stat columns={2} lastColumn label="Practice sessions" value={String(practiceSessions)} />
          <Stat columns={2} label="Questions done" value="0" />
          <Stat columns={2} lastColumn label="Correct" value="0" />
          <Stat columns={2} lastRow label="Wrong" value="0" />
        </View>
        <View style={styles.divider} />
        <Text style={[styles.cardEyebrow, styles.trackerEyebrow]}>STUDY TRACKER</Text>
        <View style={styles.trackerGrid}>
          <Stat label="Lectures" value={String(trackerLectures)} />
          <Stat label="Revisions" value={String(trackerRevisions)} />
          <Stat lastColumn label="Mock tests" value={String(loggedMocks)} />
          <Stat lastRow label="Study time" value={formatMinutes(filteredSummary.minutes)} />
          <Stat lastColumn lastRow label="Tasks completed" value={String(filteredSummary.done)} />
          <Stat lastRow label="Incomplete tasks" value={String(filteredSummary.total - filteredSummary.done)} />
        </View>
        </Animated.View>
      </View>
      <ActivityHeatmap user={user} mockTests={mockTests} practiceRecords={practiceRecords} />
      <StudyTrackerOverview tracker={trackerData} mockTests={mockTests} examName={examName || "Your tracker"} onOpen={onOpenTracker} />
      <MockTestLogDialog visible={loggingMockTest} subjects={syllabusSubjects} onClose={() => setLoggingMockTest(false)} onSave={saveMockTest} />
      <Modal transparent visible={viewingAvatar} animationType="fade" onRequestClose={() => setViewingAvatar(false)}><Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "rgba(0,0,0,.88)" }} onPress={() => setViewingAvatar(false)}><Pressable style={{ width: "100%", aspectRatio: 1, maxWidth: 330, overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: "#3f3f46", backgroundColor: "#1c1c1c" }} onPress={() => undefined}><Image source={avatarImage} style={{ width: "100%", height: "100%" }} /></Pressable></Pressable></Modal>
      <Modal transparent visible={confirmLogout} animationType="fade" onRequestClose={() => setConfirmLogout(false)}><Pressable style={styles.modalBackdrop} onPress={() => setConfirmLogout(false)}><Pressable style={styles.confirmDialog} onPress={() => undefined}><View style={styles.confirmHeader}><View style={styles.confirmIcon}><MaterialCommunityIcons name="logout" size={18} color="#fca5a5" /></View><Pressable hitSlop={10} onPress={() => setConfirmLogout(false)}><MaterialCommunityIcons name="close" size={20} color={colors.subdued} /></Pressable></View><Text style={styles.confirmTitle}>Sign out?</Text><Text style={styles.confirmCopy}>You can sign back in anytime.</Text><View style={styles.confirmActions}><Pressable style={styles.cancelButton} onPress={() => setConfirmLogout(false)}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable style={styles.logoutConfirm} onPress={onLogout}><Text style={styles.logoutConfirmText}>Sign out</Text></Pressable></View></Pressable></Pressable></Modal>
      <Modal transparent visible={editing} animationType="fade" onRequestClose={() => !savingProfile && setEditing(false)}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => !savingProfile && setEditing(false)} /><View style={styles.editDialog}><Text style={styles.editTitle}>Setup your profile</Text><EditField label="Your name" value={profileName} onChange={setProfileName} /><EditField label="Question goal" value={goal} onChange={(value) => setGoal(value.replace(/\D/g, ""))} numeric /><EditField label="Exam name" value={examName} onChange={setExamName} />{!syllabusSubjects.length && <View style={styles.subjectSetup}><Pressable disabled={savingProfile} onPress={() => setAddingSubjects((value) => !value)} style={styles.addSubjects}><MaterialCommunityIcons name="plus" size={16} color="#60a5fa" /><Text style={styles.addSubjectsText}>{addingSubjects ? "Hide subject import" : "Import syllabus JSON"}</Text></Pressable>{addingSubjects && <><Text style={[styles.editLabel, styles.subjectSetupLabel]}>SYLLABUS FILE</Text><Pressable disabled={savingProfile} onPress={() => void chooseSubjectsFile()} style={styles.chooseSubjectFile}><MaterialCommunityIcons name="file-upload-outline" size={16} color="#60a5fa" /><Text numberOfLines={1} style={styles.chooseSubjectFileText}>{subjectFileName || "Choose JSON file"}</Text></Pressable><Text style={styles.subjectHint}>{importedSubjects.length ? `${importedSubjects.length} subject${importedSubjects.length === 1 ? "" : "s"} ready to import.` : "Subjects, chapters, total and completed lectures are imported."}</Text>{subjectImportError ? <Text style={styles.subjectImportError}>{subjectImportError}</Text> : null}</>}</View>}<View style={styles.manifestationField}><Text style={[styles.editLabel, styles.manifestationLabel]}>DAILY MANIFESTATION (OPTIONAL)</Text><TextInput multiline value={manifestation} onChangeText={(value) => setManifestation(value.toUpperCase())} placeholder="Write the sentence you want to type daily" placeholderTextColor={colors.subdued} style={styles.manifestationInput} /></View><View style={styles.editActions}><Pressable disabled={savingProfile} onPress={() => setEditing(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable disabled={savingProfile} style={[styles.saveProfile, savingProfile && { opacity: .65 }]} onPress={async () => { setSavingProfile(true); try { onProfileSaved({ name: profileName, examName, questionGoal: Number(goal) || 100, manifestation, avatar: avatarFile }); const newSubjects = !syllabusSubjects.length ? importedSubjects : []; if (user && newSubjects.length) { const revision = { ...(trackerData.revision ?? {}), ...Object.fromEntries(newSubjects.map((subject) => [subject.id, { types: [], done: {}, targets: {} }])) }; const nextTracker = { ...trackerData, subjects: [...(Array.isArray(trackerData.subjects) ? trackerData.subjects : []), ...newSubjects], revision }; await syncTrackerSections(user, trackerData, nextTracker); setTrackerData(nextTracker); setSyllabusSubjects(newSubjects.map((subject) => subject.name)); setImportedSubjects([]); setSubjectFileName(""); setAddingSubjects(false); } await new Promise((resolve) => setTimeout(resolve, 220)); setEditing(false); } finally { setSavingProfile(false); } }}>{savingProfile ? <ActivityIndicator size="small" color={colors.accentDeep} /> : <Text style={styles.saveProfileText}>Save profile</Text>}</Pressable></View></View></KeyboardAvoidingView></Modal>
    </ScrollView>
  );
}

function Stat({ label, value, columns = 3, lastColumn, lastRow }: { label: string; value: string; columns?: 2 | 3; lastColumn?: boolean; lastRow?: boolean }) {
  return <View style={[styles.stat, { paddingVertical: 8 }, columns === 2 && styles.statHalf, lastColumn && styles.statLastColumn, lastRow && styles.statLastRow]}><AnimatedStatValue value={value} /><Text style={styles.statLabel}>{label}</Text></View>;
}

function AnimatedStatValue({ value }: { value: string }) {
  const isDuration = /[hm]/.test(value);
  const target = useMemo(() => {
    const hours = /^(\d+)h(?:\s+(\d+)m)?$/.exec(value);
    if (hours) return Number(hours[1]) * 60 + Number(hours[2] ?? 0);
    const minutes = /^(\d+)m$/.exec(value);
    return minutes ? Number(minutes[1]) : Number(value) || 0;
  }, [value]);
  const progress = useRef(new Animated.Value(target)).current;
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const listener = progress.addListener(({ value: next }) => setDisplay(Math.max(0, Math.round(next))));
    progress.stopAnimation((current) => {
      progress.setValue(current);
      Animated.timing(progress, { toValue: target, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    });
    return () => progress.removeListener(listener);
  }, [progress, target]);

  return <Text style={styles.statValue}>{isDuration ? formatMinutes(display) : String(display)}</Text>;
}

function ActivityHeatmap({ user, mockTests, practiceRecords }: { user: User | null; mockTests: MockTestLog[]; practiceRecords: Array<{ id: string; date: string; subject?: string; chapter?: string }> }) {
  const [selectedDay, setSelectedDay] = useState<string>(() => localDayKey(new Date()));
  const [trackerActivity, setTrackerActivity] = useState<Array<{ id: string; date: string; count: number; type?: string; subjectId?: string; chapterId?: string; revisionTypeId?: string }>>([]);
  const [trackerSubjects, setTrackerSubjects] = useState<Array<{ id: string; name: string; chapters?: Array<{ id: string; name: string }> }>>([]);
  const [trackerRevision, setTrackerRevision] = useState<Record<string, { types?: Array<{ id: string; name: string }> }>>({});
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [heatmapReady, setHeatmapReady] = useState(false);
  const [scrollbarVisible, setScrollbarVisible] = useState(false);
  const heatmapRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user) { setTrackerActivity([]); setTrackerRevision({}); return; }
    return watchTrackerSections(user, (sections) => {
      const entries = Array.isArray(sections.activity) ? sections.activity : [];
      setTrackerSubjects(Array.isArray(sections.subjects) ? sections.subjects : []);
      setTrackerRevision(sections.revision && typeof sections.revision === "object" ? sections.revision : {});
      setTrackerActivity(entries.filter((entry: any) => entry && typeof entry.date === "string").map((entry: any, index: number) => ({
        id: String(entry.id ?? `${entry.date}-${index}`), date: entry.date, count: Math.max(1, Math.abs(Number(entry.count) || 1)), type: entry.type,
        subjectId: entry.subjectId, chapterId: entry.chapterId, revisionTypeId: entry.revisionTypeId,
      })));
    });
  }, [user?.uid]);
  const { months, total, activeDays, streak, activity } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const counts = new Map<string, number>();
    // Match web: Daily Tasks are intentionally not heatmap activities.
    practiceRecords.forEach((record) => counts.set(record.date, (counts.get(record.date) ?? 0) + 1));
    mockTests.forEach((test) => counts.set(test.date, (counts.get(test.date) ?? 0) + 1));
    trackerActivity.forEach((entry) => counts.set(entry.date, (counts.get(entry.date) ?? 0) + entry.count));
    const days = Array.from({ length: 365 }, (_, index) => {
      const date = new Date(today); date.setDate(today.getDate() - (364 - index));
      const key = localDayKey(date);
      return { date, key, value: counts.get(key) ?? 0 };
    });
    let run = 0, longest = 0;
    days.forEach((day) => { run = day.value ? run + 1 : 0; longest = Math.max(longest, run); });
    const maximum = Math.max(1, ...days.map((day) => day.value));
    const grouped = days.reduce<Array<{ label: string; key: string; days: typeof days }>>((result, day) => {
      const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
      const last = result.at(-1);
      if (last?.key === monthKey) last.days.push(day);
      else result.push({ key: monthKey, label: day.date.toLocaleDateString(undefined, { month: "short" }), days: [day] });
      return result;
    }, []);
    return { months: grouped, total: [...counts.values()].reduce((sum, count) => sum + count, 0), activeDays: [...counts.values()].filter(Boolean).length, streak: longest, activity: counts, maximum };
  }, [mockTests, practiceRecords, trackerActivity]);
  const max = Math.max(1, ...[...activity.values()]);
  const selected = activity.get(selectedDay) ?? 0;
  const activityRows = useMemo(() => {
    const subjectName = (subjectId?: string) => trackerSubjects.find((subject) => subject.id === subjectId)?.name;
    const chapterName = (subjectId?: string, chapterId?: string) => trackerSubjects.find((subject) => subject.id === subjectId)?.chapters?.find((chapter) => chapter.id === chapterId)?.name;
    const grouped = new Map<string, { label: string; detail: string; count: number }>();
    const add = (label: string, detail: string, count = 1) => {
      const key = `${label}|${detail}`;
      const previous = grouped.get(key);
      if (previous) previous.count += count;
      else grouped.set(key, { label, detail, count });
    };
    practiceRecords.filter((record) => record.date === selectedDay).forEach((record) =>
      add("Practice session", [record.subject, record.chapter].filter(Boolean).join(" · ") || "Practice session"),
    );
    mockTests.filter((test) => test.date === selectedDay).forEach((test) =>
      add(`${test.type} mock test`, `${test.subject ? (subjectName(test.subject) ?? test.subject) : test.type} · ${test.score}/${test.total}`),
    );
    trackerActivity.filter((entry) => entry.date === selectedDay).forEach((entry) => {
      const subject = subjectName(entry.subjectId);
      const chapter = chapterName(entry.subjectId, entry.chapterId);
      const isRevision = entry.type === "revision";
      const isMock = entry.type === "mock-test";
      const revisionType = trackerRevision[entry.subjectId ?? ""]?.types?.find((item) => item.id === entry.revisionTypeId);
      const label = isRevision ? `Revision${revisionType ? ` · ${revisionType.name}` : ""}` : isMock ? "Mock test" : "Lecture";
      add(label, [subject, chapter].filter(Boolean).join(" · ") || "Earlier saved activity", entry.count);
    });
    return [...grouped.entries()].map(([id, row]) => ({ id, ...row }));
  }, [mockTests, practiceRecords, selectedDay, trackerActivity, trackerRevision, trackerSubjects]);
  const thumbWidth = viewportWidth && contentWidth ? Math.max(34, (viewportWidth * viewportWidth) / contentWidth) : 0;
  const scrollableWidth = Math.max(1, contentWidth - viewportWidth);
  const thumbLeft = scrollX.interpolate({ inputRange: [0, scrollableWidth], outputRange: [0, Math.max(0, viewportWidth - thumbWidth)], extrapolate: "clamp" });
  useEffect(() => {
    if (!viewportWidth) return;
    if (contentWidth <= viewportWidth) {
      setHeatmapReady(true);
      return;
    }
    const end = contentWidth - viewportWidth;
    const frame = requestAnimationFrame(() => {
      scrollX.setValue(end);
      heatmapRef.current?.scrollTo({ x: end, animated: false });
      requestAnimationFrame(() => setHeatmapReady(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [contentWidth, viewportWidth]);
  useEffect(() => () => { if (scrollbarTimer.current) clearTimeout(scrollbarTimer.current); }, []);
  const revealScrollbar = () => {
    if (scrollbarTimer.current) clearTimeout(scrollbarTimer.current);
    setScrollbarVisible(true);
  };
  const hideScrollbarSoon = () => {
    if (scrollbarTimer.current) clearTimeout(scrollbarTimer.current);
    scrollbarTimer.current = setTimeout(() => setScrollbarVisible(false), 900);
  };
  return <View style={[styles.heatmapSection, !heatmapReady && styles.heatmapPending]}>
    <View style={styles.heatmapHeading}><Text style={styles.heatmapMuted}>{total} activities · this year</Text><View style={styles.heatmapFacts}><Text style={styles.heatmapMuted}><Text style={styles.heatmapNumber}>{activeDays}</Text> active days</Text><Text style={styles.heatmapMuted}><Text style={styles.heatmapNumber}>{streak}</Text> max streak</Text></View></View>
    <Animated.ScrollView ref={heatmapRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months} style={styles.heatmapScroll} onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} onContentSizeChange={(width) => setContentWidth(width)} onScrollBeginDrag={revealScrollbar} onScrollEndDrag={hideScrollbarSoon} onMomentumScrollEnd={hideScrollbarSoon} onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })} scrollEventThrottle={16}>
      {months.map((month) => <View key={month.key} style={[styles.month, { width: 76 }]}><View style={[styles.monthGrid, { height: 74 }]}>{month.days.map((day) => { const level = day.value === 0 ? 0 : Math.min(4, Math.ceil((day.value / max) * 4)); return <Pressable key={day.key} accessibilityLabel={`${day.key}: ${day.value} activities`} onPress={() => setSelectedDay(day.key)} style={[styles.heatCell, { width: 9, height: 9, backgroundColor: ["#45454f", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981"][level] }, selectedDay === day.key && styles.heatSelected]} />; })}</View><Text style={styles.monthLabel}>{month.label}</Text></View>)}
    </Animated.ScrollView>
    {contentWidth > viewportWidth && scrollbarVisible && <View style={styles.heatScrollbar}><Animated.View style={[styles.heatScrollbarThumb, { width: thumbWidth, transform: [{ translateX: thumbLeft }] }]} /></View>}
    <View style={styles.heatDetail}><Text style={styles.heatDetailDate}>{new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text><Text style={styles.heatmapMuted}>{selected} activit{selected === 1 ? "y" : "ies"}</Text></View>
    <View style={styles.activityList}>
      {activityRows.length ? activityRows.map((row) => <View key={row.id} style={styles.activityRow}><View style={styles.activityDot} /><Text numberOfLines={1} style={styles.activityText}><Text style={styles.activityTitle}>{row.label}</Text> · {row.detail}</Text><Text style={styles.activityCount}>×{row.count}</Text></View>) : <Text style={styles.noActivity}>No activity recorded on this day.</Text>}
    </View>
  </View>;
}

function StudyTrackerOverview({ tracker, mockTests, examName, onOpen }: { tracker: Record<string, any>; mockTests: MockTestLog[]; examName: string; onOpen: (tab: "Syllabus" | "Revision" | "Mock Test") => void }) {
  const subjects = Array.isArray(tracker.subjects) ? tracker.subjects : [];
  const syllabus = subjects.map((subject: any) => ({ subject: String(subject.name ?? "Subject"), completed: (Array.isArray(subject.chapters) ? subject.chapters : []).reduce((sum: number, chapter: any) => sum + Math.max(0, Number(chapter.completed) || 0), 0), total: (Array.isArray(subject.chapters) ? subject.chapters : []).reduce((sum: number, chapter: any) => sum + Math.max(0, Number(chapter.total) || 0), 0) }));
  const revision = subjects.map((subject: any) => {
    const value = tracker.revision?.[subject.id] ?? {}; const types = Array.isArray(value.types) ? value.types : []; const chapters = Array.isArray(subject.chapters) ? subject.chapters : [];
    return { subject: String(subject.name ?? "Subject"), completed: chapters.reduce((sum: number, chapter: any) => sum + types.reduce((typeSum: number, item: any) => typeSum + Math.min(Math.max(0, Number(item.target) || 0), Math.max(0, Number(value.done?.[chapter.id]?.[item.id]) || 0)), 0), 0), total: chapters.length * types.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.target) || 0), 0) };
  });
  const mocks = subjects.map((subject: any) => ({ subject: String(subject.name ?? "Subject"), completed: mockTests.filter((test) => test.subject === subject.id).length, total: Math.max(0, Number(tracker.tests?.targets?.[subject.id]) || 0) }));
  const totalLectures = syllabus.reduce((sum, item) => sum + item.total, 0);
  const doneLectures = syllabus.reduce((sum, item) => sum + item.completed, 0);
  return <View style={styles.trackerOverview}>
    <View style={styles.trackerHeading}><View><Text style={styles.cardEyebrow}>STUDY TRACKER</Text><Text style={styles.trackerTitle}>{examName}</Text></View><Text style={styles.trackerCount}>{doneLectures}/{totalLectures} lectures</Text></View>
    <TrackerCard index={0} title="Syllabus" subtitle={`${totalLectures ? Math.round((doneLectures / totalLectures) * 100) : 0}% complete`} rows={syllabus} tone="#60a5fa" onPress={() => onOpen("Syllabus")} />
    <TrackerCard index={1} title="Revision" subtitle="By subject" rows={revision} tone="#34d399" onPress={() => onOpen("Revision")} />
    <TrackerCard index={2} title="Mock tests" subtitle="Practice progress" rows={mocks} tone="#a78bfa" onPress={() => onOpen("Mock Test")} />
  </View>;
}

function TrackerCard({ index, title, subtitle, rows, tone, onPress }: { index: number; title: string; subtitle: string; rows: Array<{ subject: string; completed: number; total: number }>; tone: string; onPress: () => void }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const [fillProgress, setFillProgress] = useState(0);
  const signature = rows.map((row) => `${row.subject}:${row.completed}:${row.total}`).join("|");
  useEffect(() => {
    entrance.setValue(0); setFillProgress(0);
    Animated.timing(entrance, { toValue: 1, duration: 320, delay: index * 85, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    let frame = 0;
    const startedAt = Date.now() + 100 + index * 85;
    const animateFill = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 0) { frame = requestAnimationFrame(animateFill); return; }
      const progress = Math.min(1, elapsed / 650);
      setFillProgress(1 - Math.pow(1 - progress, 3));
      if (progress < 1) frame = requestAnimationFrame(animateFill);
    };
    frame = requestAnimationFrame(animateFill);
    return () => cancelAnimationFrame(frame);
  }, [entrance, index, signature]);
  return <Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}><Pressable onPress={onPress} style={styles.trackerCard}><View style={styles.trackerCardTop}><View><Text style={styles.trackerCardLabel}>{title}</Text><Text style={styles.trackerCardTitle}>{subtitle}</Text></View><MaterialCommunityIcons name="chevron-right" size={19} color={colors.subdued} /></View>{rows.map((row) => { const target = row.total ? (row.completed / row.total) * 100 : 0; return <View key={row.subject} style={styles.trackerRow}><Text style={styles.trackerRowName} numberOfLines={1}>{row.subject}</Text><View style={styles.trackerBar}><View style={[styles.trackerBarFill, { backgroundColor: tone, width: `${target * fillProgress}%` }]} /></View><Text style={styles.trackerRowCount}>{row.completed}/{row.total}</Text></View>; })}</Pressable></Animated.View>;
}

function EditField({ label, value, onChange, numeric }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean }) { return <View><Text style={styles.editLabel}>{label.toUpperCase()}</Text><TextInput value={value} onChangeText={onChange} keyboardType={numeric ? "number-pad" : "default"} placeholderTextColor={colors.subdued} style={styles.editInput} /></View>; }

const styles: Record<string, any> = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 11, paddingTop: 24, paddingBottom: 18 },
  profileRow: { alignItems: "center", position: "relative" }, profileStreak: { position: "absolute", top: 0, right: 0, minWidth: 38, height: 30, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 15, backgroundColor: "#262626", borderWidth: 1, borderColor: "#333333" }, profileStreakActive: { backgroundColor: "rgba(251, 191, 36, .14)", borderColor: "rgba(251, 191, 36, .22)" }, profileStreakText: { color: "#d4d4d8", fontSize: 12, fontWeight: "800" }, profileStreakTextActive: { color: "#fef3c7" },
  avatar: { position: "relative", width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }, avatarImage: { width: "100%", height: "100%", borderRadius: 42 }, avatarBadge: { position: "absolute", right: -2, bottom: -2, width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#202020", borderWidth: 1, borderColor: colors.border },
  identity: { alignItems: "center", marginTop: 12 }, exam: { color: colors.subdued, fontSize: 10, fontWeight: "700", letterSpacing: 2.2 }, nameLine: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 }, profileActions: { flexDirection: "row", alignItems: "center", gap: 10 }, name: { color: colors.text, fontSize: 21, fontWeight: "700" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 19 }, action: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 8 }, actionText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  summaryCard: { marginTop: 27, overflow: "visible", borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingTop: 16 }, cardHeader: { zIndex: 30, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16 }, cardEyebrow: { color: "#a1a1aa", fontSize: 10, fontWeight: "700", letterSpacing: 1.6 }, trackerEyebrow: { paddingHorizontal: 16, paddingTop: 17 }, rangeWrap: { position: "relative", zIndex: 40 }, rangeButton: { height: 29, flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 9, paddingHorizontal: 8, backgroundColor: "#292929" }, rangeText: { color: colors.text, fontSize: 11, fontWeight: "700" }, rangeMenu: { position: "absolute", top: 34, right: 0, minWidth: 124, overflow: "hidden", borderRadius: 11, paddingVertical: 3, backgroundColor: "#292929", borderWidth: 1, borderColor: colors.border, elevation: 30, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }, rangeOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 11, paddingVertical: 8 }, rangeOptionActive: { backgroundColor: "#f4f4f5" }, rangeOptionText: { color: colors.muted, fontSize: 12 }, rangeOptionTextActive: { color: "#171717", fontWeight: "800" }, practiceGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 10 }, trackerGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 11 }, stat: { width: "33.333%", alignItems: "center", paddingVertical: 10, paddingHorizontal: 3, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border }, statHalf: { width: "50%" }, statLastColumn: { borderRightWidth: 0 }, statLastRow: { borderBottomWidth: 0 }, statValue: { color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" }, statLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 4, textAlign: "center" }, divider: { height: 1, backgroundColor: colors.border },
  heatmapSection: { marginTop: 20, paddingTop: 2 }, heatmapPending: { opacity: 0 }, heatmapHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }, heatmapFacts: { flexDirection: "row", gap: 12 }, heatmapMuted: { color: colors.muted, fontSize: 10 }, heatmapNumber: { color: colors.text, fontWeight: "800" }, heatmapScroll: { marginTop: 12 }, months: { gap: 10, paddingBottom: 4 }, month: { width: 58 }, monthGrid: { height: 63, flexDirection: "column", flexWrap: "wrap", alignContent: "flex-start", gap: 3 }, heatCell: { width: 8, height: 8, borderRadius: 2 }, heatSelected: { borderWidth: 1, borderColor: "#fff", transform: [{ scale: 1.15 }] }, monthLabel: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 7 }, heatScrollbar: { height: 3, overflow: "hidden", marginTop: 2, borderRadius: 2, backgroundColor: "#303030" }, heatScrollbarThumb: { height: "100%", borderRadius: 2, backgroundColor: "#777782" }, heatDetail: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingHorizontal: 1 }, heatDetailDate: { color: colors.text, fontSize: 11, fontWeight: "700" }, activityList: { marginTop: 2 }, activityRow: { minHeight: 25, flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 1 }, activityDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#6ee7b7" }, activityText: { flex: 1, color: colors.muted, fontSize: 10 }, activityTitle: { color: colors.text, fontWeight: "700" }, activityCount: { color: colors.muted, fontSize: 10, fontFamily: "monospace" }, noActivity: { paddingVertical: 7, color: colors.muted, fontSize: 11 },
  trackerOverview: { marginTop: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 13 }, trackerHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }, trackerTitle: { color: colors.text, fontSize: 19, fontWeight: "800", marginTop: 4 }, trackerCount: { color: colors.muted, fontSize: 11, fontFamily: "monospace" }, trackerCard: { marginTop: 9, borderRadius: 15, padding: 14, backgroundColor: "rgba(255,255,255,.025)", borderWidth: 1, borderColor: colors.border }, trackerCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }, trackerCardLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" }, trackerCardTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 3 }, trackerRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 8 }, trackerRowName: { width: 72, color: "#d4d4d8", fontSize: 11 }, trackerBar: { flex: 1, maxWidth: 190, height: 5, overflow: "hidden", borderRadius: 4, backgroundColor: "#303030" }, trackerBarFill: { height: "100%", borderRadius: 4 }, trackerRowCount: { width: 43, marginLeft: "auto", color: colors.muted, fontSize: 10, textAlign: "right", fontFamily: "monospace" },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,.70)" }, editDialog: { borderRadius: 19, padding: 17, gap: 10, backgroundColor: "#202020", borderWidth: 1, borderColor: colors.border }, editTitle: { color: colors.text, fontSize: 19, fontWeight: "800", marginBottom: 1 }, editLabel: { color: colors.subdued, fontSize: 9, letterSpacing: 1.2, fontWeight: "800", marginBottom: 5 }, editInput: { height: 42, borderRadius: 11, paddingHorizontal: 12, color: colors.text, backgroundColor: "#151515", borderWidth: 1, borderColor: "#3f3f46" }, subjectSetup: { marginTop: -2 }, addSubjects: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3 }, addSubjectsText: { color: "#60a5fa", fontSize: 12, fontWeight: "600" }, subjectSetupLabel: { marginTop: 5, marginBottom: 3 }, chooseSubjectFile: { height: 40, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 11, paddingHorizontal: 11, backgroundColor: "#151515", borderWidth: 1, borderColor: "#3f3f46" }, chooseSubjectFileText: { flex: 1, color: colors.text, fontSize: 12 }, subjectHint: { color: colors.subdued, fontSize: 9, marginTop: 3 }, subjectImportError: { color: "#fca5a5", fontSize: 9, marginTop: 3, lineHeight: 13 }, manifestationField: { marginTop: -3 }, manifestationLabel: { marginBottom: 2 }, manifestationInput: { minHeight: 48, maxHeight: 48, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8, color: colors.text, backgroundColor: "#151515", borderWidth: 1, borderColor: "#3f3f46", textAlignVertical: "top" }, editActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 15, marginTop: 1 }, cancel: { color: "#d4d4d8", fontWeight: "700" }, saveProfile: { borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: "#8fc5f0" }, saveProfileText: { color: "#10243a", fontWeight: "600" },
  confirmDialog: { borderRadius: 20, padding: 18, backgroundColor: "#1d1d1d", borderWidth: 1, borderColor: "#353535" }, confirmHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, confirmIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "rgba(244,63,94,.12)" }, confirmTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 15 }, confirmCopy: { color: colors.muted, fontSize: 13, marginTop: 5 }, confirmActions: { flexDirection: "row", gap: 9, marginTop: 20 }, cancelButton: { flex: 1, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#2b2b2b" }, cancelButtonText: { color: "#e4e4e7", fontSize: 13, fontWeight: "700" }, logoutConfirm: { flex: 1, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#e11d48" }, logoutConfirmText: { color: "#fff1f2", fontSize: 13, fontWeight: "800" },
});
