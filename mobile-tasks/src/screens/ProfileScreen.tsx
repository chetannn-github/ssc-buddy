// @ts-nocheck
import { StudyLock, controller as focusReader } from "../components/StudyLock";
import { FocusPulse } from "../components/FocusPulse";
import { PublicFocusTime } from "../components/PublicFocusTime";
import { useProfileFocusData } from "../../../shared/use-profile-focus";
import { profileTrackerVisibility } from "../../../shared/profile-tracker-visibility";
import { getFirebaseFirestore } from "../lib/firebase";
import { DestructiveDialog } from "../components/DestructiveDialog";
import { createThemedStyles, setAppAccent, useAppAccent } from "../theme";
import { type AppAccent } from "../domain/app-accent";
import { AccentPicker } from "../components/AccentPicker";
import { ConsistencyCard } from "../components/ConsistencyCard";
import { MedalsCard } from "../components/MedalsCard";
import { DropdownChevron } from "../components/DropdownChevron";
import { NumberFlow } from "number-flow-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { User } from "firebase/auth";

import { dateKey, formatMinutes, summarizeTasks, type Task } from "../domain/tasks";
import { LiquidProgressBar, ProfileXpBar } from "../components/ProfileXpBar";
import { LiquidHeatmapCell } from "../components/LiquidHeatmapCell";
import { HeatmapTooltip, type HeatmapTooltipData } from "../components/HeatmapTooltip";
import { HEATMAP_EMPTY_COLOR, nextProfileColorTheme, type HeatmapColorCycle } from "../domain/heatmap-colors";
import { useHeatmapLiquidMotion } from "../hooks/use-heatmap-liquid-motion";
import { useWeeklyMedalCounts } from "../hooks/use-weekly-results";
import { layoutHeatmapMonths } from "../domain/heatmap-layout";
import { colors } from "../theme";
import { getXpSummary, levelName, xpForLevel, xpSegmentProgress } from "../domain/xp";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
import type { PracticeProfile } from "../lib/profile-store";
import type { MockTestLog } from "./MockTestLogDialog";
import {
  checkUsernameAvailability,
  normalizeUsername,
  syncTrackerSections,
  usernameValidationMessage,
  watchPracticeEntities,
  watchTrackerSections,
  watchTrackerTests,
} from "../lib/firebase";

const ScrollView = (props: any) => (
  <NativeScrollView
    {...props}
    scrollEventThrottle={16}
    onScroll={(event) => {
      if (!props.horizontal) reportVerticalScroll(event.nativeEvent.contentOffset.y, event.nativeEvent);
      props.onScroll?.(event);
    }}
  />
);

function StreakFlame({ streak }: { streak: number }) {
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0);
  useEffect(() => {
    // The GIF is intentionally a one-shot: profile entry or a live streak
    // increase plays it once, then the supplied final flame frame remains.
    setPlaying(true);
    setRun((value) => value + 1);
    const timeout = setTimeout(() => setPlaying(false), 3530);
    return () => clearTimeout(timeout);
  }, [streak]);
  return <Image key={`${playing ? "play" : "final"}-${run}`} source={playing ? require("../../assets/streak-flame.gif") : require("../../assets/streak-flame-final.png")} resizeMode="contain" style={styles.profileStreakFlame} />;
}

type Range = "today" | "week" | "month" | "lastMonth" | "year" | "all";
const ranges: Array<{ key: Range; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];
const withinRange = (date: string, range: Range) => {
  if (range === "all") return true;
  const now = new Date();
  const from = (start: Date, end = now) => date >= dateKey(start) && date <= dateKey(end);
  if (range === "today") return date === dateKey(now);
  if (range === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return from(start);
  }
  if (range === "month") return from(new Date(now.getFullYear(), now.getMonth(), 1));
  if (range === "lastMonth") return from(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0));
  return from(new Date(now.getFullYear(), 0, 1));
};
const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Keep these exact filenames aligned with public/avatars/manifest.json in the
// web app. `avatar` is the filename in the shared cloud profile document.
import { avatarAssets } from "../lib/launch-images";
export { avatarAssets } from "../lib/launch-images";
const avatarFiles = Object.keys(avatarAssets);
const rankMedals = [require("../../assets/gold-medal.png"), require("../../assets/silver-medal.png"), require("../../assets/bronze-medal.png")];
const defaultAvatarFor = (name: string) => {
  const hash = Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0);
  return avatarFiles[hash % avatarFiles.length] ?? avatarFiles[0];
};

type Props = {
  user: User | null;
  tasks: Task[];
  profileSettings: PracticeProfile | null;
  onProfileSaved: (profile: PracticeProfile) => Promise<void> | void;
  onLogout: () => void;
  onOpenVideo: () => void;
  onOpenMusic: () => void;
  onOpenTracker: (tab: "Syllabus" | "Revision" | "Mock Test") => void;
  onOpenLeaderboard: () => void;
  streak: number;
  sharedPracticeRecords?: Record<string, any>[];
  sharedTracker?: Record<string, any>;
  sharedMockTests?: MockTestLog[];
  sharedActivityReady?: boolean;
  sharedRank?: number | null;
  /** Reuses this exact screen for another user's shared, read-only profile. */
  readOnly?: boolean;
  publicUid?: string;
  onBack?: () => void;
  publicDashboard?: { records?: Record<string, unknown>[]; dailyTasks?: Record<string, unknown>[]; tracker?: Record<string, any> | null };
  publicActivity?: Record<string, number>;
  publicRank?: number;
};

type ImportedSubject = {
  id: string;
  name: string;
  chapters: Array<{ id: string; name: string; total: number; completed: number }>;
};

const normalizePracticeRecords = (items: Record<string, any>[]) => items
  .filter((item) => typeof item.date === "string")
  .map((item) => ({
    id: String(item.id),
    date: String(item.date),
    subject: typeof item.subject === "string" ? item.subject : "",
    chapter: typeof item.chapter === "string" ? item.chapter : "",
    questionCount: Array.isArray(item.answers) ? item.answers.length : Math.max(0, Number(item.questionCount) || 0),
    correct: Math.max(0, Number(item.correct) || 0),
    wrong: Math.max(0, Number(item.wrong) || 0),
  }));

function parseSubjectsFile(value: unknown): ImportedSubject[] {
  const source = value as { subjects?: unknown };
  if (!Array.isArray(source?.subjects) || source.subjects.length === 0)
    throw new Error("JSON must include a non-empty subjects array.");
  const ids = new Set<string>();
  return source.subjects.map((item, subjectIndex) => {
    const subject = item as { id?: unknown; name?: unknown; chapters?: unknown };
    const id = typeof subject.id === "string" ? subject.id.trim() : "";
    const name = typeof subject.name === "string" ? subject.name.trim() : "";
    if (!id || !name || ids.has(id) || !Array.isArray(subject.chapters))
      throw new Error(`Subject ${subjectIndex + 1} needs a unique id, name, and chapters array.`);
    ids.add(id);
    const chapterIds = new Set<string>();
    const chapters = subject.chapters.map((chapterItem, chapterIndex) => {
      const chapter = chapterItem as {
        id?: unknown;
        name?: unknown;
        total?: unknown;
        completed?: unknown;
      };
      const chapterId = typeof chapter.id === "string" ? chapter.id.trim() : "";
      const chapterName = typeof chapter.name === "string" ? chapter.name.trim() : "";
      const total = Math.max(1, Number(chapter.total) || 0);
      if (!chapterId || !chapterName || chapterIds.has(chapterId))
        throw new Error(`${name}: chapter ${chapterIndex + 1} needs a unique id and name.`);
      chapterIds.add(chapterId);
      return {
        id: chapterId,
        name: chapterName,
        total,
        completed: Math.min(total, Math.max(0, Number(chapter.completed) || 0)),
      };
    });
    return { id, name, chapters };
  });
}

export function ProfileScreen({
  user,
  tasks,
  profileSettings,
  onProfileSaved,
  onLogout,
  onOpenVideo,
  onOpenMusic,
  onOpenTracker,
  onOpenLeaderboard,
  streak,
  sharedPracticeRecords = [],
  sharedTracker,
  sharedMockTests = [],
  sharedActivityReady = true,
  readOnly = false,
  publicUid,
  onBack,
  publicDashboard,
  publicActivity,
}: Props) {
  const [colorTheme] = useState(() => nextProfileColorTheme());
  const [profileName, setProfileName] = useState(profileSettings?.name ?? "");
  const [username, setUsername] = useState(profileSettings?.username ?? "");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [profileReady, setProfileReady] = useState(profileSettings !== null);
  const [examName, setExamName] = useState(profileSettings?.examName ?? "");
  const [goal, setGoal] = useState(String(profileSettings?.questionGoal ?? 100));
  const [manifestation, setManifestation] = useState(profileSettings?.manifestation ?? "");
  const [practiceSessionEnabled, setPracticeSessionEnabled] = useState(
    profileSettings?.practiceSessionEnabled !== false,
  );
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [consistencyOpen,setConsistencyOpen]=useState(false);
  const [medalsOpen, setMedalsOpen] = useState(false);
  const appAccent = useAppAccent();
  const [savingAccent, setSavingAccent] = useState(false);
  const [accentSaveError, setAccentSaveError] = useState("");
  const [trackProgressEnabled, setTrackProgressEnabled] = useState(
    profileSettings?.trackProgressEnabled !== false,
  );
  const [showTrackerOnProfile, setShowTrackerOnProfile] = useState(profileSettings?.showTrackerOnProfile !== false);
  const trackerVisibility=profileTrackerVisibility(trackProgressEnabled,showTrackerOnProfile);
  const profileTrackerVisible = trackerVisibility.details;
  const [timersEnabled, setTimersEnabled] = useState(profileSettings?.timersEnabled !== false);
  const [habitsEnabled, setHabitsEnabled] = useState(profileSettings?.habitsEnabled !== false);
  const [randomQuotesEnabled, setRandomQuotesEnabled] = useState(profileSettings?.randomQuotesEnabled !== false);
  const [savingFeature, setSavingFeature] = useState<"practice" | "track" | "profileTracker" | "timers" | "habits" | "quotes" | null>(null);
  const [editing, setEditing] = useState(() => !profileSettings?.username);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const name = profileReady
    ? profileName.trim() || user?.displayName?.trim() || user?.email?.split("@")[0] || "Student"
    : "";
  const [range, setRange] = useState<Range>("week");
  const focusData = useProfileFocusData(getFirebaseFirestore, focusReader, readOnly ? publicUid : user?.uid, readOnly ? profileSettings?.username : undefined, readOnly, date => withinRange(date, range));
  useEffect(() => { if (!focusData.canLogout) setConfirmLogout(false); }, [focusData.canLogout]);
  const xpSummary = useMemo(() => getXpSummary(tasks, focusData.totalPoints), [tasks, focusData.totalPoints]);
  const xpTimelineStart = Math.max(0, xpSummary.level - 3);
  const xpTimelineLevels = Array.from({ length: 6 }, (_, index) => xpTimelineStart + index);
  const isInitialProfileSetup = !profileSettings?.username;
  const [avatarFile, setAvatarFile] = useState(() =>
    profileSettings?.avatar && avatarAssets[profileSettings.avatar]
      ? profileSettings.avatar
      : defaultAvatarFor(profileSettings?.name || user?.displayName || user?.email || "Student"),
  );
  const [viewingAvatar, setViewingAvatar] = useState(false);
  const [xpTimelineOpen, setXpTimelineOpen] = useState(false);
  const [spin] = useState(() => new Animated.Value(0));
  // A public profile arrives as one complete dashboard object. Seed every
  // profile section from it on the very first render instead of filling each
  // section in an effect after the screen has painted.
  const initialPublicTracker = readOnly && publicDashboard?.tracker && typeof publicDashboard.tracker === "object"
    ? publicDashboard.tracker
    : undefined;
  const initialTracker = initialPublicTracker ?? sharedTracker;
  const [mockTests, setMockTests] = useState<MockTestLog[]>(() =>
    readOnly
      ? (Array.isArray(initialPublicTracker?.tests?.log) ? initialPublicTracker.tests.log : [])
      : sharedMockTests,
  );
  const [syllabusSubjects, setSyllabusSubjects] = useState<string[]>(() =>
    Array.isArray(initialTracker?.subjects)
      ? initialTracker.subjects.map((subject: any) => String(subject.name ?? "")).filter(Boolean)
      : [],
  );
  const [trackerData, setTrackerData] = useState<Record<string, any>>(() => initialTracker ?? { subjects: [], revision: {} });
  const [practiceRecords, setPracticeRecords] = useState<
    Array<{
      id: string;
      date: string;
      subject?: string;
      chapter?: string;
      questionCount: number;
      correct: number;
      wrong: number;
    }>
  >(() => readOnly
    ? normalizePracticeRecords(Array.isArray(publicDashboard?.records) ? publicDashboard.records as Record<string, any>[] : [])
    : normalizePracticeRecords(sharedPracticeRecords));
  const lastPublicDashboard = useRef(publicDashboard);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeMenuVisible, setRangeMenuVisible] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [addingSubjects, setAddingSubjects] = useState(false);
  const [importedSubjects, setImportedSubjects] = useState<ImportedSubject[]>([]);
  const [subjectFileName, setSubjectFileName] = useState("");
  const [subjectImportError, setSubjectImportError] = useState("");
  const rangeMenuProgress = useRef(new Animated.Value(0)).current;
  const avatarImage = avatarAssets[avatarFile] ?? avatarAssets[avatarFiles[0]];
  const medalCounts = useWeeklyMedalCounts(readOnly ? publicUid : user?.uid, tasks.map((task) => task.date));
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const changeAvatar = () => {
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 560, useNativeDriver: true }).start();
    const options = avatarFiles.filter((file) => file !== avatarFile);
    const nextAvatar = options[Math.floor(Math.random() * options.length)] ?? avatarFile;
    setAvatarFile(nextAvatar);
    onProfileSaved({
      ...profileSettings,
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
      setImportedSubjects([]);
      setSubjectFileName("");
      setSubjectImportError(
        error instanceof Error ? error.message : "Choose a valid syllabus JSON file.",
      );
    }
  };
  // Data subscriptions live in App, so opening Profile reads a warm cache instead
  // of starting three Firestore listeners and visibly reflowing the screen.
  useEffect(() => {
    if (readOnly) return;
    if (!profileSettings) setProfileReady(true);
    setMockTests(sharedMockTests);
    setTrackerData(sharedTracker ?? { subjects: [], revision: {} });
    setSyllabusSubjects(Array.isArray(sharedTracker?.subjects) ? sharedTracker.subjects.map((subject: any) => String(subject.name ?? "")).filter(Boolean) : []);
    setPracticeRecords(normalizePracticeRecords(sharedPracticeRecords));
  }, [profileSettings, readOnly, sharedMockTests, sharedPracticeRecords, sharedTracker]);
  useEffect(() => {
    if (!readOnly) return;
    // The mount already used this exact dashboard snapshot. Skipping this
    // duplicate state write prevents stats from disappearing then replaying
    // their number animation when opening a profile from the leaderboard.
    if (lastPublicDashboard.current === publicDashboard) return;
    lastPublicDashboard.current = publicDashboard;
    const records = Array.isArray(publicDashboard?.records) ? publicDashboard.records : [];
    setPracticeRecords(records.map((item: any, index) => ({
      id: String(item.id ?? index),
      date: String(item.date ?? ""),
      subject: typeof item.subject === "string" ? item.subject : "",
      chapter: typeof item.chapter === "string" ? item.chapter : "",
      questionCount: Array.isArray(item.answers) ? item.answers.length : Math.max(0, Number(item.questionCount) || 0),
      correct: Math.max(0, Number(item.correct) || 0),
      wrong: Math.max(0, Number(item.wrong) || 0),
    })).filter((item) => item.date));
    const tracker = publicDashboard?.tracker && typeof publicDashboard.tracker === "object"
      ? publicDashboard.tracker : { subjects: [], revision: {} };
    setTrackerData(tracker);
    setSyllabusSubjects(Array.isArray(tracker.subjects) ? tracker.subjects.map((subject: any) => String(subject.name ?? "")).filter(Boolean) : []);
    setMockTests(Array.isArray(tracker.tests?.log) ? tracker.tests.log : []);
    setProfileReady(true);
  }, [readOnly, publicDashboard]);
  useEffect(() => {
    const value = normalizeUsername(username);
    if (!usernameTouched) {
      setUsernameStatus(value ? "available" : "idle");
      setUsernameMessage("");
      return;
    }
    const validationError = usernameValidationMessage(value);
    if (validationError) {
      setUsernameStatus(value ? "invalid" : "idle");
      setUsernameMessage(value ? validationError : "");
      return;
    }
    if (!user) return;
    setUsernameStatus("checking");
    setUsernameMessage("Checking availability…");
    const timer = setTimeout(() => {
      void checkUsernameAvailability(user, value)
        .then((result) => {
          setUsernameStatus(result.available ? "available" : "taken");
          setUsernameMessage(result.available ? "Username is available." : result.reason);
        })
        .catch((error) => {
          const code =
            typeof error === "object" && error && "code" in error
              ? String((error as { code?: unknown }).code)
              : "";
          setUsernameStatus("idle");
          setUsernameMessage(
            code === "permission-denied"
              ? "Username checks need the latest Firestore rules."
              : "Could not check availability. Try again.",
          );
        });
    }, 360);
    return () => clearTimeout(timer);
  }, [username, usernameTouched, user?.uid]);
  useEffect(() => {
    if (!profileSettings) return;
    setProfileName(profileSettings.name);
    setUsername(profileSettings.username ?? "");
    setUsernameTouched(false);
    setExamName(profileSettings.examName ?? "");
    setGoal(String(profileSettings.questionGoal));
    setManifestation(profileSettings.manifestation ?? "");
    setAvatarFile(
      profileSettings.avatar && avatarAssets[profileSettings.avatar]
        ? profileSettings.avatar
        : defaultAvatarFor(profileSettings.name || user?.displayName || user?.email || "Student"),
    );
    setPracticeSessionEnabled(profileSettings.practiceSessionEnabled !== false);
    setTrackProgressEnabled(profileSettings.trackProgressEnabled !== false);
    setShowTrackerOnProfile(profileSettings.showTrackerOnProfile !== false);
    setTimersEnabled(profileSettings.timersEnabled !== false);
    setHabitsEnabled(profileSettings.habitsEnabled !== false);
    setRandomQuotesEnabled(profileSettings.randomQuotesEnabled !== false);
    setProfileReady(true);
  }, [profileSettings?.name, profileSettings?.username, profileSettings?.examName,
    profileSettings?.questionGoal, profileSettings?.manifestation, profileSettings?.avatar,
    profileSettings?.practiceSessionEnabled, profileSettings?.trackProgressEnabled, profileSettings?.showTrackerOnProfile,
    profileSettings?.timersEnabled, profileSettings?.habitsEnabled, profileSettings?.randomQuotesEnabled]);
  const filteredTasks = tasks.filter((task) => withinRange(task.date, range));
  const filteredSummary = summarizeTasks(filteredTasks);
  const filteredPracticeRecords = practiceRecords.filter((record) =>
    withinRange(record.date, range),
  );
  const practiceSessions = filteredPracticeRecords.length;
  const practiceQuestions = filteredPracticeRecords.reduce(
    (total, record) => total + record.questionCount,
    0,
  );
  const practiceCorrect = filteredPracticeRecords.reduce(
    (total, record) => total + record.correct,
    0,
  );
  const practiceWrong = filteredPracticeRecords.reduce((total, record) => total + record.wrong, 0);
  // Match the web profile exactly: tracker figures represent completed
  // activity within the selected date range, not the syllabus totals.
  const trackerActivities = Array.isArray(trackerData.activity) ? trackerData.activity : [];
  const trackerTotalFor = (type: "lecture" | "revision" | "mock-test") =>
    trackerActivities
      .filter(
        (entry: any) =>
          entry?.type === type && typeof entry?.date === "string" && withinRange(entry.date, range),
      )
      .reduce((sum: number, entry: any) => sum + Math.max(0, Number(entry.count) || 0), 0);
  const trackerLectures = trackerTotalFor("lecture");
  const trackerRevisions = trackerTotalFor("revision");
  const loggedMocks =
    trackerTotalFor("mock-test") + mockTests.filter((test) => withinRange(test.date, range)).length;
  const activeRangeLabel = ranges.find((item) => item.key === range)?.label ?? "This week";
  const changeRange = (next: Range) => {
    setRange(next);
    setRangeOpen(false);
  };
  const saveProfileChanges = async () => {
    if (savingProfile || usernameStatus !== "available") return;
    setSavingProfile(true);
    try {
      await onProfileSaved({
        ...profileSettings,
        accentColor: appAccent,
        name: profileName,
        username: normalizeUsername(username),
        examName,
        questionGoal: Number(goal) || 100,
        manifestation,
        avatar: avatarFile,
        practiceSessionEnabled,
        trackProgressEnabled,
        showTrackerOnProfile,
        timersEnabled,
        habitsEnabled,
        randomQuotesEnabled,
      });
      const newSubjects = !syllabusSubjects.length ? importedSubjects : [];
      if (user && newSubjects.length) {
        const revision = {
          ...(trackerData.revision ?? {}),
          ...Object.fromEntries(
            newSubjects.map((subject) => [subject.id, { types: [], done: {}, targets: {} }]),
          ),
        };
        const nextTracker = {
          ...trackerData,
          subjects: [
            ...(Array.isArray(trackerData.subjects) ? trackerData.subjects : []),
            ...newSubjects,
          ],
          revision,
        };
        await syncTrackerSections(user, trackerData, nextTracker);
        setTrackerData(nextTracker);
        setSyllabusSubjects(newSubjects.map((subject) => subject.name));
        setImportedSubjects([]);
        setSubjectFileName("");
        setAddingSubjects(false);
      }
      await new Promise((resolve) => setTimeout(resolve, 220));
      setEditing(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save your username. Try again.";
      setUsernameStatus(message.toLowerCase().includes("taken") ? "taken" : "idle");
      setUsernameMessage(message);
    } finally {
      setSavingProfile(false);
    }
  };
  const chooseAccent = async (next: AppAccent) => {
    if (savingAccent || savingFeature || next === appAccent) return;
    const previous = appAccent;
    setSavingAccent(true);
    setAccentSaveError("");
    setAppAccent(next);
    try {
      await onProfileSaved({ ...profileSettings, name: profileSettings?.name ?? profileName,
        questionGoal: profileSettings?.questionGoal ?? 100, accentColor: next });
    } catch {
      setAppAccent(previous);
      setAccentSaveError("Could not save accent. Please try again.");
    } finally { setSavingAccent(false); }
  };
  const saveFeature = async (feature: "practice" | "track" | "profileTracker" | "timers" | "habits" | "quotes") => {
    if (savingFeature || savingAccent) return;
    const nextPractice = feature === "practice" ? !practiceSessionEnabled : practiceSessionEnabled;
    const nextTrack = feature === "track" ? !trackProgressEnabled : trackProgressEnabled;
    const nextProfileTracker = feature === "profileTracker" ? !showTrackerOnProfile : showTrackerOnProfile;
    setShowTrackerOnProfile(nextProfileTracker);
    const nextHabits = feature === "habits" ? !habitsEnabled : habitsEnabled;
    const nextQuotes = feature === "quotes" ? !randomQuotesEnabled : randomQuotesEnabled;
    const nextTimers = feature === "timers" ? !timersEnabled : timersEnabled;
    setPracticeSessionEnabled(nextPractice); setTrackProgressEnabled(nextTrack); setTimersEnabled(nextTimers); setHabitsEnabled(nextHabits); setRandomQuotesEnabled(nextQuotes);
    setSavingFeature(feature);
    setAccentSaveError("");
    try { await onProfileSaved({ ...profileSettings, accentColor: appAccent, name: profileSettings?.name || "Student", questionGoal: profileSettings?.questionGoal || 100, practiceSessionEnabled: nextPractice, trackProgressEnabled: nextTrack, showTrackerOnProfile: nextProfileTracker, timersEnabled: nextTimers, habitsEnabled: nextHabits, randomQuotesEnabled: nextQuotes }); }
    catch { setShowTrackerOnProfile(showTrackerOnProfile); setPracticeSessionEnabled(practiceSessionEnabled); setTrackProgressEnabled(trackProgressEnabled); setTimersEnabled(timersEnabled); setHabitsEnabled(habitsEnabled); setRandomQuotesEnabled(randomQuotesEnabled); setAccentSaveError("Could not save this setting. Please try again."); }
    finally { setSavingFeature(null); }
  };
  useEffect(() => {
    rangeMenuProgress.stopAnimation();
    if (rangeOpen) {
      setRangeMenuVisible(true);
      Animated.timing(rangeMenuProgress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!rangeMenuVisible) return;
    Animated.timing(rangeMenuProgress, {
      toValue: 0,
      duration: 130,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRangeMenuVisible(false);
    });
  }, [rangeOpen, rangeMenuProgress, rangeMenuVisible]);
  return (
    <View style={styles.page}>
      <ConsistencyCard visible={consistencyOpen} streak={streak} onClose={()=>setConsistencyOpen(false)}/>
      <MedalsCard visible={medalsOpen} counts={medalCounts} onClose={() => setMedalsOpen(false)} />
      <View style={styles.profileTop}>
        <View style={styles.profileRow}>
          {readOnly && <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={onBack} style={styles.publicBackRow}>
            <MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} />
          </Pressable>}
          <View style={styles.profileTopActions}>

          <Pressable accessibilityRole="button" onPress={()=>setConsistencyOpen(true)}
            accessibilityLabel={`Practice streak: ${streak} days`}
            style={[styles.profileStreak, { position: "relative", top: undefined, right: undefined }, streak > 0 && styles.profileStreakActive]}
          >
            {streak > 0 ? <StreakFlame streak={streak} /> : <MaterialCommunityIcons name="fire" size={15} color="#a1a1aa" />}
            <ProfileNumber value={streak} style={[styles.profileStreakText, streak > 0 && styles.profileStreakTextActive]} />
          </Pressable>
          {!readOnly && <Pressable accessibilityRole="button" accessibilityLabel="Profile settings"
            hitSlop={6} style={styles.profileSettingsAction}
            onPress={() => {
              setUsernameTouched(false);
              setUsernameStatus(username ? "available" : "idle");
              setUsernameMessage("");
              setProfileSettingsOpen(false);
              setEditing(true);
            }}>
            <MaterialCommunityIcons name="cog-outline" size={20} color={colors.muted} />
          </Pressable>}
          </View>
          <View style={[styles.avatar, { width: 70, height: 70, borderRadius: 35 }]}>
            <Pressable style={{ width: 67, height: 67, margin: 0.5 }} onPress={() => setViewingAvatar(true)}>
              <Image source={avatarImage} style={[styles.avatarImage, { borderRadius: 33.5 }]} />
            </Pressable>
            {focusData.focusing && <FocusPulse label="Focusing" style={[styles.avatarFocusDot, { backgroundColor: appAccent }]} />}
            {!readOnly && <Pressable
              style={[styles.avatarBadge, { width: 25, height: 25, borderRadius: 13 }]}
              accessibilityLabel="Change profile image"
              onPress={changeAvatar}
            >
              <Animated.View style={{ transform: [{ rotate }] }}>
                <MaterialCommunityIcons name="sync" size={12} color={colors.muted} />
              </Animated.View>
            </Pressable>}
          </View>
          <View style={[styles.identity, { marginTop: 9 }]}>
            <Text style={styles.exam}>{examName}</Text>

            <View style={styles.nameLine}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>

            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="View weekly medals" hitSlop={8} onPress={() => setMedalsOpen(true)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginVertical: 4 }}>
              {(["gold", "silver", "bronze"] as const).map((medal, index) => (
                <View key={medal} accessibilityLabel={`${medal} medals: ${medalCounts[medal]}`} style={{ flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 12, borderWidth: 1, borderColor: "#383838", backgroundColor: "#242424", paddingHorizontal: 6, paddingVertical: 3 }}>
                  <Image source={rankMedals[index]} style={{ width: 17, height: 17, resizeMode: "contain" }} />
                  <ProfileNumber value={medalCounts[medal]} prefix="×" style={{ color: "#e4e4e7", fontSize: 10, fontWeight: "800" }} />
                </View>
              ))}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="View XP level roadmap" disabled={!focusData.ready} style={styles.xpBlock} onPress={() => setXpTimelineOpen(true)}>
              {focusData.ready ? <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 3 }}><Text style={styles.xpText}>Lv.</Text><ProfileNumber value={xpSummary.level} style={styles.xpText} /><Text style={styles.xpText}>· {levelName(xpSummary.level)} ·</Text><ProfileNumber value={xpSummary.xp} prefix={xpSummary.xp > 0 ? "+" : ""} suffix=" XP" style={[styles.xpText, xpSummary.xp < 0 && styles.xpNegative]} /></View>
              {xpSummary.level > 0 && <ProfileXpBar progress={xpSummary.progress} />}
              </> : <Text accessibilityLabel="Loading XP and level" style={styles.xpText}>—</Text>}
            </Pressable>
          </View>
        </View>

        <View style={[styles.actionRow, { marginTop: 7 }]}>
          <Pressable style={styles.action} onPress={onOpenLeaderboard}>
            <MaterialCommunityIcons name="trophy-outline" size={18} color={colors.text} />
            <Text style={styles.actionText}>{readOnly ? "Weekly stats" : "Leaderboard"}</Text>
          </Pressable>
          {!readOnly && <Pressable style={styles.action} onPress={onOpenVideo}>
            <MaterialCommunityIcons name="play-outline" size={18} color={colors.text} />
            <Text style={styles.actionText}>Videos</Text>
          </Pressable>}
          {!readOnly && <Pressable style={styles.action} onPress={onOpenMusic}>
            <MaterialCommunityIcons name="music-note" size={18} color={colors.text} />
            <Text style={styles.actionText}>Music</Text>
          </Pressable>}
        </View>
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.content}
        onScrollBeginDrag={() => setRangeOpen(false)}
      >
        {!readOnly && user && <StudyLock key={user.uid} uid={user.uid} />}
        {readOnly && publicUid && profileSettings?.username && <PublicFocusTime uid={publicUid} username={profileSettings.username} />}
        <View style={[styles.summaryCard, { position: "relative", marginTop: 10, paddingTop: 10 }]}>
          {rangeOpen && (
            <Pressable
              accessibilityLabel="Close date range menu"
              style={{ position: "absolute", zIndex: 10, top: 0, right: 0, bottom: 0, left: 0 }}
              onPress={() => setRangeOpen(false)}
            />
          )}
          <View style={[styles.cardHeader, { elevation: 31 }]}>
            <Text style={styles.cardEyebrow}>
              {practiceSessionEnabled ? "PRACTICE" : trackerVisibility.summary ? "STUDY TRACKER" : "TASKS"}
            </Text>
            <View style={[styles.rangeWrap, { elevation: 40 }]}>
              <Pressable style={styles.rangeButton} onPress={() => setRangeOpen((value) => !value)}>
                <Text style={styles.rangeText}>{activeRangeLabel}</Text>
                <DropdownChevron open={rangeOpen} size={14} color={colors.muted} />
              </Pressable>
              {rangeMenuVisible && (
                <Animated.View
                  pointerEvents={rangeOpen ? "auto" : "none"}
                  style={[
                    styles.rangeMenu,
                    {
                      opacity: rangeMenuProgress,
                      transform: [
                        {
                          translateY: rangeMenuProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-6, 0],
                          }),
                        },
                        {
                          scale: rangeMenuProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.98, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {ranges.map((item) => {
                    const selected = item.key === range;
                    return (
                      <Pressable
                        key={item.key}
                        style={[styles.rangeOption, selected && styles.rangeOptionActive]}
                        onPress={() => changeRange(item.key)}
                      >
                        <Text
                          style={[styles.rangeOptionText, selected && styles.rangeOptionTextActive]}
                        >
                          {item.label}
                        </Text>
                        {selected && (
                          <MaterialCommunityIcons name="check" size={15} color="#171717" />
                        )}
                      </Pressable>
                    );
                  })}
                </Animated.View>
              )}
            </View>
          </View>
          <View>
            {practiceSessionEnabled && (
              <View style={styles.practiceGrid}>
                <Stat columns={2} label="Question goal" value={goal || "0"} />
                <Stat
                  columns={2}
                  lastColumn
                  label="Practice sessions"
                  value={String(practiceSessions)}
                />
                <Stat columns={2} label="Questions done" value={String(practiceQuestions)} />
                <Stat columns={2} lastColumn label="Correct" value={String(practiceCorrect)} />
                <Stat columns={2} lastRow label="Wrong" value={String(practiceWrong)} />
              </View>
            )}
            {practiceSessionEnabled && trackerVisibility.summary && (
              <Text style={[styles.cardEyebrow, styles.trackerEyebrow]}>STUDY TRACKER</Text>
            )}
            {practiceSessionEnabled && trackerVisibility.summary ? (
              <View style={styles.trackerGrid}>
                <Stat label="Lectures" value={String(trackerLectures)} />
                <Stat label="Revisions" value={String(trackerRevisions)} />
                <Stat lastColumn label="Mock tests" value={String(loggedMocks)} />
                <Stat lastRow label="Study time" value={formatMinutes(filteredSummary.minutes)} />
                <Stat lastRow label="Tasks completed" value={`${filteredSummary.done}/${filteredSummary.total}`} />
                <Stat lastColumn lastRow label="Focus time" value={focusData.text} />
              </View>
            ) : (
              <>
                {trackerVisibility.summary && <View style={styles.trackerGrid}>
                  <Stat lastRow label="Lectures" value={String(trackerLectures)} />
                  <Stat lastRow label="Revisions" value={String(trackerRevisions)} />
                  <Stat lastColumn lastRow label="Mock tests" value={String(loggedMocks)} />
                </View>}
                <View style={styles.trackerGrid}>
                  <Stat lastRow label="Study time" value={formatMinutes(filteredSummary.minutes)} />
                  <Stat lastRow label="Tasks completed" value={`${filteredSummary.done}/${filteredSummary.total}`} />
                  <Stat lastColumn lastRow label="Focus time" value={focusData.text} />
                </View>
              </>
            )}
          </View>
        </View>
        <ActivityHeatmap
          colorTheme={colorTheme}
          user={user}
          mockTests={mockTests}
          practiceRecords={practiceRecords}
          tasks={tasks}
          activityEnabled={practiceSessionEnabled || trackProgressEnabled}
          // App already keeps the tracker subscription warm. Passing that snapshot
          // through for both profiles prevents the heatmap from briefly rendering
          // an empty state while it starts a second subscription on screen open.
          sharedTracker={trackerData}
          dataReady={readOnly || sharedActivityReady}
          sharedActivity={readOnly ? publicActivity : undefined}
        />
        {profileTrackerVisible && <StudyTrackerOverview
          tracker={trackerData}
          mockTests={mockTests}
          examName={examName || "Your tracker"}
          onOpen={onOpenTracker}
        />}
        <Modal
          transparent
          visible={viewingAvatar}
          animationType="fade"
          onRequestClose={() => setViewingAvatar(false)}
        >
          <Pressable
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 28,
              backgroundColor: "rgba(0,0,0,.88)",
            }}
            onPress={() => setViewingAvatar(false)}
          >
            <Pressable
              style={{
                width: "100%",
                aspectRatio: 1,
                maxWidth: 330,
                overflow: "hidden",
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "#3f3f46",
                backgroundColor: "#1c1c1c",
              }}
              onPress={() => undefined}
            >
              <Image source={avatarImage} style={{ width: "100%", height: "100%" }} />
            </Pressable>
          </Pressable>
        </Modal>
        <DestructiveDialog visible={confirmLogout && focusData.canLogout} title="Are you sure you want to sign out?" confirmLabel="Yes, sign out" onCancel={() => setConfirmLogout(false)} onConfirm={() => { if (focusData.canLogout) onLogout(); }} />
        <Modal
          transparent
          visible={editing}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => !savingProfile && !isInitialProfileSetup && setEditing(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBackdrop}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => !savingProfile && !isInitialProfileSetup && setEditing(false)}
            />
            <View style={styles.editDialog}>
              <View style={styles.editHeading}>
                <Text style={styles.editTitle}>{isInitialProfileSetup ? "Setup your profile" : "Edit your profile"}</Text>
                <View style={styles.editHeaderActions}>
                  <Pressable hitSlop={9} onPress={() => setProfileSettingsOpen((open) => !open)} style={styles.settingsButton}><MaterialCommunityIcons name="cog-outline" size={19} color={colors.muted} /></Pressable>
                  {focusData.canLogout && <Pressable accessibilityLabel="Log out" hitSlop={9} onPress={() => { setEditing(false); setConfirmLogout(true); }} style={styles.settingsButton}><MaterialCommunityIcons name="logout" size={18} color={colors.muted} /></Pressable>}
                </View>
              </View>
              {profileSettingsOpen && (
                <View style={styles.settingsPanel}>
                  <View style={styles.settingsPanelHeader}>
                    <Pressable
                      accessibilityLabel="Back to profile form"
                      onPress={() => setProfileSettingsOpen(false)}
                      style={styles.settingsBackButton}
                    >
                      <MaterialCommunityIcons name="arrow-left" size={18} color={colors.text} />
                    </Pressable>
                    <Text style={styles.settingsTitle}>Settings</Text>
                  </View>
                  <NativeScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 20 }}>
                  <View style={styles.settingsToggleGroup}>
                  <Pressable
                    accessibilityRole="switch" accessibilityState={{ checked: practiceSessionEnabled }}
                    disabled={savingFeature !== null || savingAccent}
                    onPress={() => void saveFeature("practice")}
                    style={[styles.featureToggle, styles.settingsToggleRow]}
                  >
                    <View style={styles.featureToggleContent}>
                      <Text style={styles.featureToggleTitle}>Practice session</Text>
                      <Text style={styles.featureToggleCopy}>Take practice tests, review answers and track your results.</Text>
                    </View>
                    {savingFeature === "practice" ? <ActivityIndicator size="small" color={colors.accent} /> : <View
                      style={[
                        styles.featureSwitch,
                        practiceSessionEnabled && styles.featureSwitchOn,
                      ]}
                    >
                      <View
                        style={[styles.featureKnob, practiceSessionEnabled && styles.featureKnobOn]}
                      />
                    </View>}
                  </Pressable>
                  <Pressable
                    accessibilityRole="switch" accessibilityState={{ checked: trackProgressEnabled }}
                    disabled={savingFeature !== null || savingAccent}
                    onPress={() => void saveFeature("track")}
                    style={[styles.featureToggle, styles.settingsToggleRow, styles.settingsToggleDivider]}
                  >
                    <View style={styles.featureToggleContent}>
                      <Text style={styles.featureToggleTitle}>Track</Text>
                      <Text style={styles.featureToggleCopy}>Track syllabus, revision and mock test progress.</Text>
                    </View>
                    {savingFeature === "track" ? <ActivityIndicator size="small" color={colors.accent} /> : <View style={[styles.featureSwitch, trackProgressEnabled && styles.featureSwitchOn]}><View style={[styles.featureKnob, trackProgressEnabled && styles.featureKnobOn]} /></View>}
                  </Pressable>
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: showTrackerOnProfile }} disabled={savingFeature !== null || savingAccent} onPress={() => void saveFeature("profileTracker")} style={[styles.featureToggle, styles.settingsToggleRow, styles.settingsToggleDivider]}>
                    <View style={styles.featureToggleContent}><Text style={styles.featureToggleTitle}>Show tracker on profile</Text><Text style={styles.featureToggleCopy}>Show detailed syllabus, revision and mock progress cards below.</Text></View>
                    {savingFeature === "profileTracker" ? <ActivityIndicator size="small" color={colors.accent} /> : <View style={[styles.featureSwitch, showTrackerOnProfile && styles.featureSwitchOn]}><View style={[styles.featureKnob, showTrackerOnProfile && styles.featureKnobOn]} /></View>}
                  </Pressable>
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: timersEnabled }} disabled={savingFeature !== null || savingAccent} onPress={() => void saveFeature("timers")} style={[styles.featureToggle, styles.settingsToggleRow, styles.settingsToggleDivider]}>
                    <View style={styles.featureToggleContent}><Text style={styles.featureToggleTitle}>Timers</Text><Text style={styles.featureToggleCopy}>Countdowns for important dates and deadlines.</Text></View>
                    {savingFeature === "timers" ? <ActivityIndicator size="small" color={colors.accent} /> : <View style={[styles.featureSwitch, timersEnabled && styles.featureSwitchOn]}><View style={[styles.featureKnob, timersEnabled && styles.featureKnobOn]} /></View>}
                  </Pressable>
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: habitsEnabled }} disabled={savingFeature !== null || savingAccent} onPress={() => void saveFeature("habits")} style={[styles.featureToggle, styles.settingsToggleRow, styles.settingsToggleDivider]}>
                    <View style={styles.featureToggleContent}><Text style={styles.featureToggleTitle}>Habits</Text><Text style={styles.featureToggleCopy}>Daily heatmaps, streaks and personal challenges.</Text></View>
                    {savingFeature === "habits" ? <ActivityIndicator size="small" color={colors.accent} /> : <View style={[styles.featureSwitch, habitsEnabled && styles.featureSwitchOn]}><View style={[styles.featureKnob, habitsEnabled && styles.featureKnobOn]} /></View>}
                  </Pressable>
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: randomQuotesEnabled }} disabled={savingFeature !== null || savingAccent} onPress={() => void saveFeature("quotes")} style={[styles.featureToggle, styles.settingsToggleRow, styles.settingsToggleDivider]}>
                    <View style={styles.featureToggleContent}><Text style={styles.featureToggleTitle}>Random quotes</Text><Text style={styles.featureToggleCopy}>Show a random motivational image on normal app launch.</Text></View>
                    {savingFeature === "quotes" ? <ActivityIndicator size="small" color={colors.accent} /> : <View style={[styles.featureSwitch, randomQuotesEnabled && styles.featureSwitchOn]}><View style={[styles.featureKnob, randomQuotesEnabled && styles.featureKnobOn]} /></View>}
                  </Pressable>
                  </View>
                  <View style={styles.accentPanel}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={styles.featureToggleTitle}>App accent</Text>
                      {savingAccent && <ActivityIndicator size="small" color={colors.accent} />}
                    </View>
                    <Text style={styles.featureToggleCopy}>Choose a color for buttons and selected controls.</Text>
                    <AccentPicker value={appAccent} disabled={savingAccent || savingFeature !== null} onChange={value=>void chooseAccent(value)}/>
                    {!!accentSaveError && <Text style={{ color: "#fca5a5", fontSize: 11 }}>{accentSaveError}</Text>}
                  </View>
                  </NativeScrollView>
                </View>
              )}
              <EditField label="Your name" value={profileName} onChange={setProfileName} />
              <View>
                <Text style={styles.editLabel}>USERNAME</Text>
                <View style={styles.usernameInputWrap}>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={username}
                    onChangeText={(value) => {
                      setUsernameTouched(true);
                      setUsername(value);
                    }}
                    placeholder="e.g. ssc_aspirant"
                    placeholderTextColor={colors.subdued}
                    style={styles.usernameInput}
                  />
                  {usernameStatus === "checking" && (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                  {usernameStatus === "available" && (
                    <MaterialCommunityIcons name="check-circle" size={18} color="#4ade80" />
                  )}
                  {usernameStatus === "taken" && (
                    <MaterialCommunityIcons name="close-circle" size={18} color="#f87171" />
                  )}
                </View>
                {usernameMessage ? (
                  <Text
                    style={[
                      styles.usernameHint,
                      usernameStatus === "available"
                        ? styles.usernameHintAvailable
                        : styles.usernameHintError,
                    ]}
                  >
                    {usernameMessage}
                  </Text>
                ) : null}
              </View>
              <EditField
                label="Question goal"
                value={goal}
                onChange={(value) => setGoal(value.replace(/\D/g, ""))}
                numeric
              />
              <EditField label="Exam name" value={examName} onChange={setExamName} />
              {false && (
                <Pressable
                  onPress={() => setPracticeSessionEnabled((value) => !value)}
                  style={styles.featureToggle}
                >
                  <View>
                    <Text style={styles.featureToggleTitle}>Practice session</Text>
                    <Text style={styles.featureToggleCopy}>Take practice tests, review answers and track your results.</Text>
                  </View>
                  <View
                    style={[styles.featureSwitch, practiceSessionEnabled && styles.featureSwitchOn]}
                  >
                    <View
                      style={[styles.featureKnob, practiceSessionEnabled && styles.featureKnobOn]}
                    />
                  </View>
                </Pressable>
              )}
              <View style={styles.manifestationField}>
                <Text style={[styles.editLabel, styles.manifestationLabel]}>
                  DAILY MANIFESTATION (OPTIONAL)
                </Text>
                <TextInput
                  multiline
                  value={manifestation}
                  onChangeText={(value) => setManifestation(value.toUpperCase())}
                  placeholder="Write the sentence you want to type daily"
                  placeholderTextColor={colors.subdued}
                  style={styles.manifestationInput}
                />
              </View>
              <View style={styles.editActions}>
                {!isInitialProfileSetup && <Pressable disabled={savingProfile} onPress={() => setEditing(false)}>
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>}
                <Pressable
                  disabled={savingProfile || usernameStatus !== "available"}
                  style={[
                    styles.saveProfile,
                    (savingProfile || usernameStatus !== "available") && { opacity: 0.65 },
                  ]}
                  onPress={() => void saveProfileChanges()}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color={colors.buttonInk} />
                  ) : (
                    <Text style={styles.saveProfileText}>Save profile</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
      <Modal transparent visible={xpTimelineOpen && focusData.ready} animationType="fade" statusBarTranslucent onRequestClose={() => setXpTimelineOpen(false)}>
        <Pressable style={styles.xpDialogBackdrop} onPress={() => setXpTimelineOpen(false)}>
          <Pressable style={styles.xpDialog} onPress={() => undefined}>
            <View style={styles.xpDialogHeader}><View><Text style={styles.xpDialogEyebrow}>YOUR XP PATH</Text><Text style={styles.xpDialogTitle}>Level {xpSummary.level} · {levelName(xpSummary.level)}</Text></View><Pressable hitSlop={10} onPress={() => setXpTimelineOpen(false)}><MaterialCommunityIcons name="close" size={20} color={colors.muted} /></Pressable></View>
            {xpTimelineOpen && <View style={styles.xpTimeline}>{xpTimelineLevels.map((level) => { const reached = xpSummary.level >= level; const current = xpSummary.level === level; const required = current ? `${xpSummary.xp > 0 ? "+" : ""}${xpSummary.xp} XP · ${Math.max(0, xpSummary.nextLevelXp - xpSummary.xp)} XP to Level ${xpSummary.level + 1}` : level === 0 ? "Below 0 XP" : `${xpForLevel(level)} XP`; return <View key={level} style={styles.xpTimelineRow}>{level < xpTimelineStart + 5 && <View style={styles.xpTimelineSegment}><LiquidProgressBar vertical progress={xpSegmentProgress(xpSummary.xp, level)} height={6} color="#a78bfa" label={`Level ${level} to ${level + 1} progress`} /></View>}<View style={[styles.xpTimelineDot, reached && styles.xpTimelineDotReached, current && styles.xpTimelineDotCurrent]} /><View style={[styles.xpTimelineCopy, current && styles.xpTimelineCopyCurrent]}><Text style={[styles.xpTimelineName, current && styles.xpTimelineNameCurrent]}>Lv. {level} · {levelName(level)}</Text><Text style={styles.xpTimelineRequirement}>{required}</Text></View></View>; })}</View>}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Stat({
  label,
  value,
  columns = 3,
  lastColumn,
  lastRow,
}: {
  label: string;
  value: string;
  columns?: 2 | 3;
  lastColumn?: boolean;
  lastRow?: boolean;
}) {
  return (
    <View
      style={[
        styles.stat,
        { paddingVertical: 8 },
        columns === 2 && styles.statHalf,
        lastColumn && styles.statLastColumn,
        lastRow && styles.statLastRow,
      ]}
    >
      <ProfileStatValue value={value} />
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ProfileStatValue({ value }: { value: string }) {
  return <Text style={styles.statValue}>{value}</Text>;
}

function ProfileNumber({ value, prefix = "", suffix = "", style = styles.statValue }: { value: number; prefix?: string; suffix?: string; style?: any }) {
  return <NumberFlow value={value} prefix={prefix} suffix={suffix} style={{ ...StyleSheet.flatten(style), fontVariant: ["tabular-nums"] }} />;
}

type HeatmapTrackerActivity = {
  id: string;
  date: string;
  count: number;
  type?: string;
  subjectId?: string;
  chapterId?: string;
  revisionTypeId?: string;
};

const heatmapActivityFromTracker = (tracker?: Record<string, any>): HeatmapTrackerActivity[] =>
  (Array.isArray(tracker?.activity) ? tracker.activity : [])
    .filter((entry: any) => entry && typeof entry.date === "string")
    .map((entry: any, index: number) => ({
      id: String(entry.id ?? `${entry.date}-${index}`),
      date: entry.date,
      count: Math.max(1, Math.abs(Number(entry.count) || 1)),
      type: entry.type,
      subjectId: entry.subjectId,
      chapterId: entry.chapterId,
      revisionTypeId: entry.revisionTypeId,
    }));

function activityDotColor(label: string) {
  const value = label.toLowerCase();
  if (value === "lecture") return "#38bdf8";
  if (value.startsWith("revision")) return "#34d399";
  if (value.includes("mock")) return "#a78bfa";
  if (value === "quick recall") return "#fbbf24";
  if (value.includes("task")) return "#fb7185";
  return "#60a5fa";
}

function ActivityHeatmap({
  colorTheme,
  user,
  mockTests,
  practiceRecords,
  tasks,
  activityEnabled = true,
  sharedTracker,
  dataReady = true,
  sharedActivity,
}: {
  colorTheme: HeatmapColorCycle;
  user: User | null;
  mockTests: MockTestLog[];
  practiceRecords: Array<{
    id: string;
    date: string;
    subject?: string;
    chapter?: string;
    questionCount: number;
    correct: number;
    wrong: number;
  }>;
  tasks: Task[];
  activityEnabled?: boolean;
  sharedTracker?: Record<string, any>;
  dataReady?: boolean;
  sharedActivity?: Record<string, number>;
}) {
  const todayKey = localDayKey(new Date());
  const hasTodayTask = tasks.some((task) => task.completed && task.date === todayKey);
  const hasTodayActivity = Boolean(
    sharedActivity?.[todayKey]
    || practiceRecords.some((record) => record.date === todayKey)
    || mockTests.some((test) => test.date === todayKey)
    || heatmapActivityFromTracker(sharedTracker).some((entry) => entry.date === todayKey),
  );
  // If exactly one source has activity today, open that one. Activity is the
  // stable fallback whenever both (or neither) have an entry.
  const defaultMode: "activity" | "tasks" = !activityEnabled ? "tasks" : (!hasTodayActivity && hasTodayTask ? "tasks" : "activity");
  const [mode, setMode] = useState<"activity" | "tasks">(defaultMode);
  const hasAppliedDefaultMode = useRef(false);
  useEffect(() => {
    if (!activityEnabled) { setMode("tasks"); return; }
    if (!dataReady || hasAppliedDefaultMode.current) return;
    hasAppliedDefaultMode.current = true;
    setMode(defaultMode);
  }, [activityEnabled, dataReady, defaultMode]);
  const [toggleWidth, setToggleWidth] = useState(0);
  const toggleIndicator = useRef(new Animated.Value(mode === "tasks" ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(toggleIndicator, {
      toValue: mode === "tasks" ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.65,
      useNativeDriver: true,
    }).start();
  }, [mode, toggleIndicator]);
  const [selectedDay, setSelectedDay] = useState<string>(() => localDayKey(new Date()));
  const heatmapSectionRef = useRef<View>(null);
  const tooltipRequest = useRef(0);
  const [tooltip, setTooltip] = useState<HeatmapTooltipData | null>(null);
  const dismissTooltip = () => { tooltipRequest.current += 1; setTooltip(null); };
  useEffect(() => { dismissTooltip(); }, [mode]);
  useEffect(() => {
    if (!tooltip) return;
    const timer = setTimeout(dismissTooltip, 3000);
    return () => clearTimeout(timer);
  }, [tooltip]);
  const [trackerActivity, setTrackerActivity] = useState<HeatmapTrackerActivity[]>(
    () => heatmapActivityFromTracker(sharedTracker),
  );
  const [trackerSubjects, setTrackerSubjects] = useState<
    Array<{ id: string; name: string; chapters?: Array<{ id: string; name: string }> }>
  >(() => Array.isArray(sharedTracker?.subjects) ? sharedTracker.subjects : []);
  const [trackerRevision, setTrackerRevision] = useState<
    Record<string, { types?: Array<{ id: string; name: string }> }>
  >(() => sharedTracker?.revision && typeof sharedTracker.revision === "object" ? sharedTracker.revision : {});
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [heatmapReady, setHeatmapReady] = useState(true);
  const heatmapRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollbarOpacity = useRef(new Animated.Value(0)).current;
  const scrollbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initiallyPositionedFor = useRef<string | null>(null);
  useEffect(() => {
    // The app-level snapshot is subscribed before this screen opens. Do not
    // race it with another listener, which used to reset the heatmap/activity
    // list to empty for one frame.
    if (!user || sharedTracker) {
      return;
    }
    return watchTrackerSections(user, (sections) => {
      setTrackerSubjects(Array.isArray(sections.subjects) ? sections.subjects : []);
      setTrackerRevision(
        sections.revision && typeof sections.revision === "object" ? sections.revision : {},
      );
      setTrackerActivity(heatmapActivityFromTracker(sections));
    });
  }, [user, sharedTracker]);
  useEffect(() => {
    if (!sharedTracker) return;
    setTrackerSubjects(Array.isArray(sharedTracker.subjects) ? sharedTracker.subjects : []);
    setTrackerRevision(sharedTracker.revision && typeof sharedTracker.revision === "object" ? sharedTracker.revision : {});
    setTrackerActivity(heatmapActivityFromTracker(sharedTracker));
  }, [sharedTracker]);
  const { months, total, activeDays, streak, activity } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const counts = new Map<string, number>();
    const taskCounts = new Map<string, number>();
    tasks.filter((task) => task.completed).forEach((task) => taskCounts.set(task.date, (taskCounts.get(task.date) ?? 0) + 1));
    // Match web: Daily Tasks are intentionally not heatmap activities.
    practiceRecords.forEach((record) =>
      counts.set(record.date, (counts.get(record.date) ?? 0) + 1),
    );
    mockTests.forEach((test) => counts.set(test.date, (counts.get(test.date) ?? 0) + 1));
    trackerActivity.forEach((entry) =>
      counts.set(entry.date, (counts.get(entry.date) ?? 0) + entry.count),
    );
    if (sharedActivity) {
      Object.entries(sharedActivity).forEach(([date, value]) =>
        counts.set(date, Math.max(0, Number(value) || 0)),
      );
    }
    const days = Array.from({ length: 365 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (364 - index));
      const key = localDayKey(date);
      return { date, key, value: (mode === "tasks" ? taskCounts : counts).get(key) ?? 0 };
    });
    let run = 0,
      longest = 0;
    days.forEach((day) => {
      run = day.value ? run + 1 : 0;
      longest = Math.max(longest, run);
    });
    const maximum = Math.max(1, ...days.map((day) => day.value));
    const grouped = layoutHeatmapMonths(days);
    return {
      months: grouped,
      total: [...(mode === "tasks" ? taskCounts : counts).values()].reduce((sum, count) => sum + count, 0),
      activeDays: [...(mode === "tasks" ? taskCounts : counts).values()].filter(Boolean).length,
      streak: longest,
      activity: mode === "tasks" ? taskCounts : counts,
      maximum,
    };
  }, [mockTests, mode, practiceRecords, tasks, trackerActivity, sharedActivity]);
  const max = Math.max(1, ...[...activity.values()]);
  const liquidMotion = useHeatmapLiquidMotion(colorTheme, 1200, mode);
  const selected = activity.get(selectedDay) ?? 0;
  const activityRows = useMemo(() => {
    if (mode === "tasks") return tasks.filter((task) => task.completed && task.date === selectedDay).map((task) => ({ id: task.id, label: task.type, detail: [task.subject, task.name, task.minutesSpent ? `${task.minutesSpent}m` : ""].filter(Boolean).join(" · "), count: 1 }));
    const subjectName = (subjectId?: string) =>
      trackerSubjects.find((subject) => subject.id === subjectId)?.name;
    const chapterName = (subjectId?: string, chapterId?: string) =>
      trackerSubjects
        .find((subject) => subject.id === subjectId)
        ?.chapters?.find((chapter) => chapter.id === chapterId)?.name;
    const grouped = new Map<string, { label: string; detail: string; count: number }>();
    const add = (label: string, detail: string, count = 1) => {
      const key = `${label}|${detail}`;
      const previous = grouped.get(key);
      if (previous) previous.count += count;
      else grouped.set(key, { label, detail, count });
    };
    practiceRecords
      .filter((record) => record.date === selectedDay)
      .forEach((record) =>
        add(
          record.subject === "Quick Recall" ? "Quick recall" : "Practice session",
          record.subject === "Quick Recall"
            ? `${record.questionCount} questions`
            : [record.subject, record.chapter, `${record.questionCount} question${record.questionCount === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
        ),
      );
    mockTests
      .filter((test) => test.date === selectedDay)
      .forEach((test) =>
        add(
          `${test.type} mock test`,
          `${test.subject ? (subjectName(test.subject) ?? test.subject) : test.type} · ${test.score}/${test.total}`,
        ),
      );
    trackerActivity
      .filter((entry) => entry.date === selectedDay)
      .forEach((entry) => {
        const subject = subjectName(entry.subjectId);
        const chapter = chapterName(entry.subjectId, entry.chapterId);
        const isRevision = entry.type === "revision";
        const isMock = entry.type === "mock-test";
        const revisionType = trackerRevision[entry.subjectId ?? ""]?.types?.find(
          (item) => item.id === entry.revisionTypeId,
        );
        const label = isRevision
          ? `Revision${revisionType ? ` · ${revisionType.name}` : ""}`
          : isMock
            ? "Mock test"
            : "Lecture";
        add(
          label,
          [subject, chapter].filter(Boolean).join(" · ") || "Earlier saved activity",
          entry.count,
        );
      });
    return [...grouped.entries()].map(([id, row]) => ({ id, ...row }));
  }, [mockTests, mode, practiceRecords, selectedDay, tasks, trackerActivity, trackerRevision, trackerSubjects]);
  const thumbWidth =
    viewportWidth && contentWidth
      ? Math.max(34, (viewportWidth * viewportWidth) / contentWidth)
      : 0;
  const scrollableWidth = Math.max(1, contentWidth - viewportWidth);
  const thumbLeft = scrollX.interpolate({
    inputRange: [0, scrollableWidth],
    outputRange: [0, Math.max(0, viewportWidth - thumbWidth)],
    extrapolate: "clamp",
  });
  useEffect(() => {
    if (!viewportWidth) return;
    if (contentWidth <= viewportWidth) {
      setHeatmapReady(true);
      return;
    }
    const positionKey = user?.uid ?? "guest";
    if (initiallyPositionedFor.current === positionKey) {
      setHeatmapReady(true);
      return;
    }
    initiallyPositionedFor.current = positionKey;
    const end = contentWidth - viewportWidth;
    scrollX.setValue(end);
    heatmapRef.current?.scrollTo({ x: end, animated: false });
  }, [contentWidth, viewportWidth, user?.uid]);
  useEffect(
    () => () => {
      if (scrollbarTimer.current) clearTimeout(scrollbarTimer.current);
    },
    [],
  );
  const revealScrollbar = () => {
    if (scrollbarTimer.current) clearTimeout(scrollbarTimer.current);
    Animated.timing(scrollbarOpacity, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  const hideScrollbarSoon = () => {
    if (scrollbarTimer.current) clearTimeout(scrollbarTimer.current);
    scrollbarTimer.current = setTimeout(() => {
      Animated.timing(scrollbarOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 900);
  };
  return (
    <View ref={heatmapSectionRef} collapsable={false} style={styles.heatmapSection} onTouchStart={dismissTooltip}>
      <View style={styles.heatmapHeading}>
        {activityEnabled ? <>
          <View style={styles.heatmapFacts}>
            <View style={styles.heatmapFact}><ProfileNumber value={activeDays} style={styles.heatmapNumber} /><Text style={styles.heatmapMuted}> active days</Text></View>
            <Text style={styles.heatmapMuted}>·</Text>
            <View style={styles.heatmapFact}><ProfileNumber value={streak} style={styles.heatmapNumber} /><Text style={styles.heatmapMuted}> max streak</Text></View>
          </View>
          <View style={styles.heatmapToggle} onLayout={(event) => setToggleWidth(event.nativeEvent.layout.width - 4)}>
            {toggleWidth > 0 ? (
              <Animated.View pointerEvents="none" style={[styles.heatmapToggleIndicator, { width: toggleWidth / 2, transform: [{ translateX: toggleIndicator.interpolate({ inputRange: [0, 1], outputRange: [0, toggleWidth / 2] }) }] }]} />
            ) : (
              <View pointerEvents="none" style={[styles.heatmapToggleIndicator, mode === "tasks" ? { left: "50%", right: 2 } : { left: 2, right: "50%" }]} />
            )}
            {(["activity", "tasks"] as const).map((option) => <Pressable key={option} onPress={() => setMode(option)} style={styles.heatmapToggleOption}><Text style={[styles.heatmapToggleText, mode === option && styles.heatmapToggleTextActive]}>{option === "activity" ? "Activity" : "Tasks"}</Text></Pressable>)}
          </View>
        </> : <>
          <View style={styles.heatmapFact}><ProfileNumber value={total} style={styles.heatmapNumber} /><Text style={styles.heatmapMuted}> tasks completed</Text></View>
          <View style={styles.heatmapFacts}>
            <View style={styles.heatmapFact}><ProfileNumber value={activeDays} style={styles.heatmapNumber} /><Text style={styles.heatmapMuted}> active days</Text></View>
            <Text style={styles.heatmapMuted}>·</Text>
            <View style={styles.heatmapFact}><ProfileNumber value={streak} style={styles.heatmapNumber} /><Text style={styles.heatmapMuted}> max streak</Text></View>
          </View>
        </>}
      </View>
      <Animated.ScrollView
        ref={heatmapRef}
        horizontal
        contentOffset={{ x: 10000, y: 0 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.months}
        style={styles.heatmapScroll}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}
        onScrollBeginDrag={() => { dismissTooltip(); revealScrollbar(); }}
        onScrollEndDrag={hideScrollbarSoon}
        onMomentumScrollEnd={hideScrollbarSoon}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
      >
        {months.map((month) => (
          <View key={month.key} style={[styles.month, { width: month.columns * 13 + (month.columns - 1) * 3 }]}>
            <View style={styles.monthGrid}>
              {month.days.map((day) => {
                const level = day.value === 0 ? 0 : Math.min(4, Math.ceil((day.value / max) * 4));
                return (
                  <Pressable
                    key={day.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.key}: ${day.value} ${mode === "tasks" ? "tasks completed" : "activities"}`}
                    onPress={(event) => {
                      setSelectedDay(day.key);
                      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
                      const request = ++tooltipRequest.current;
                      const date = day.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
                      const count = mode === "tasks" ? `task${day.value === 1 ? "" : "s"} completed` : `activit${day.value === 1 ? "y" : "ies"}`;
                      heatmapSectionRef.current?.measureInWindow((x, y, width) => {
                        if (tooltipRequest.current === request) setTooltip({ text: `${day.value} ${count} on ${date}`, x: pageX - locationX + 6.5 - x, y: pageY - locationY - y, containerWidth: width });
                      });
                    }}
                    style={[
                      styles.heatCell,
                      {
                        width: 13,
                        height: 13,
                        position: "absolute",
                        left: day.column * 16,
                        top: day.row * 16,
                        backgroundColor: HEATMAP_EMPTY_COLOR,
                      },
                      selectedDay === day.key && styles.heatSelected,
                    ]}
                  >
                    <LiquidHeatmapCell level={level} dayKey={day.key} motion={liquidMotion} mode={mode} />
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.monthLabel}>{month.label}</Text>
          </View>
        ))}
      </Animated.ScrollView>
      <Animated.View style={[styles.heatScrollbar, { opacity: contentWidth > viewportWidth ? scrollbarOpacity : 0 }]}>
        {contentWidth > viewportWidth && (
          <Animated.View
            style={[
              styles.heatScrollbarThumb,
              { width: thumbWidth, transform: [{ translateX: thumbLeft }] },
            ]}
          />
        )}
      </Animated.View>
      <View style={styles.heatDetail}>
        <Text style={styles.heatDetailDate}>
          {new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </Text>
        <View style={styles.heatmapFact}>
          <ProfileNumber value={selected} style={styles.heatmapMuted} />
          <Text style={styles.heatmapMuted}> {mode === "tasks" ? `task${selected === 1 ? "" : "s"} completed` : `activit${selected === 1 ? "y" : "ies"}`}</Text>
        </View>
      </View>
      <NativeScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.activityList} contentContainerStyle={styles.activityListContent}>
        {!dataReady && mode === "activity" ? (
          <Text style={styles.noActivity}>Loading activity…</Text>
        ) : activityRows.length ? (
          activityRows.map((row) => (
            <View key={row.id} style={styles.activityRow}>
              <View style={[styles.activityDot, { backgroundColor: activityDotColor(row.label) }]} />
              <Text numberOfLines={1} style={styles.activityText}>
                <Text style={styles.activityTitle}>{row.label}</Text> · {row.detail}
              </Text>
              <ProfileNumber value={row.count} prefix="×" style={styles.activityCount} />
            </View>
          ))
        ) : (
          <Text style={styles.noActivity}>No activity recorded on this day.</Text>
        )}
      </NativeScrollView>
      {tooltip && <HeatmapTooltip tooltip={tooltip} />}
    </View>
  );
}

function StudyTrackerOverview({
  tracker,
  mockTests,
  examName,
  onOpen,
}: {
  tracker: Record<string, any>;
  mockTests: MockTestLog[];
  examName: string;
  onOpen: (tab: "Syllabus" | "Revision" | "Mock Test") => void;
}) {
  const subjects = Array.isArray(tracker.subjects) ? tracker.subjects : [];
  const syllabus = subjects.map((subject: any) => ({
    subject: String(subject.name ?? "Subject"),
    completed: (Array.isArray(subject.chapters) ? subject.chapters : []).reduce(
      (sum: number, chapter: any) => sum + Math.max(0, Number(chapter.completed) || 0),
      0,
    ),
    total: (Array.isArray(subject.chapters) ? subject.chapters : []).reduce(
      (sum: number, chapter: any) => sum + Math.max(0, Number(chapter.total) || 0),
      0,
    ),
  }));
  const revision = subjects.map((subject: any) => {
    const value = tracker.revision?.[subject.id] ?? {};
    const types = Array.isArray(value.types) ? value.types : [];
    const chapters = Array.isArray(subject.chapters) ? subject.chapters : [];
    return {
      subject: String(subject.name ?? "Subject"),
      completed: chapters.reduce(
        (sum: number, chapter: any) =>
          sum +
          types.reduce(
            (typeSum: number, item: any) =>
              typeSum +
              Math.min(
                Math.max(0, Number(item.target) || 0),
                Math.max(0, Number(value.done?.[chapter.id]?.[item.id]) || 0),
              ),
            0,
          ),
        0,
      ),
      total:
        chapters.length *
        types.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.target) || 0), 0),
    };
  });
  const mocks = [
    ...subjects.map((subject: any) => ({
      subject: String(subject.name ?? "Subject"),
      completed: mockTests.filter(
        (test) => test.subject === subject.id && test.type === "Sectional",
      ).length,
      total: Math.max(0, Number(tracker.tests?.targets?.[subject.id]) || 0),
    })),
    {
      subject: "Pre",
      completed: mockTests.filter((test) => test.type === "Pre").length,
      total: Math.max(0, Number(tracker.tests?.mocks?.pre?.target) || 0),
    },
    {
      subject: "Mains",
      completed: mockTests.filter((test) => test.type === "Mains").length,
      total: Math.max(0, Number(tracker.tests?.mocks?.mains?.target) || 0),
    },
  ];
  const totalLectures = syllabus.reduce((sum, item) => sum + item.total, 0);
  const doneLectures = syllabus.reduce((sum, item) => sum + item.completed, 0);
  return (
    <View style={styles.trackerOverview}>
      <View style={styles.trackerHeading}>
        <View>
          <Text style={styles.cardEyebrow}>STUDY TRACKER</Text>
          <Text style={styles.trackerTitle}>{examName}</Text>
        </View>
        <Text style={styles.trackerCount}>
          {doneLectures}/{totalLectures} lectures
        </Text>
      </View>
      {subjects.length > 0 && (
        <TrackerCard
          index={0}
          title="Syllabus"
          subtitle={`${totalLectures ? Math.round((doneLectures / totalLectures) * 100) : 0}% complete`}
          rows={syllabus}
          tone={colors.accent}
          onPress={() => onOpen("Syllabus")}
        />
      )}
      {subjects.length > 0 && (
        <TrackerCard
          index={1}
          title="Revision"
          subtitle="By subject"
          rows={revision}
          tone="#34d399"
          onPress={() => onOpen("Revision")}
        />
      )}
      <TrackerCard
        index={subjects.length ? 2 : 0}
        title="Mock tests"
        subtitle="Practice progress"
        rows={mocks}
        tone="#a78bfa"
        onPress={() => onOpen("Mock Test")}
      />
    </View>
  );
}

function TrackerCard({
  index,
  title,
  subtitle,
  rows,
  tone,
  onPress,
}: {
  index: number;
  title: string;
  subtitle: string;
  rows: Array<{ subject: string; completed: number; total: number }>;
  tone: string;
  onPress: () => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(entrance, { toValue: 1, duration: 320, delay: index * 85, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [entrance, index]);
  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [
          { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        ],
      }}
    >
      <Pressable onPress={onPress} style={styles.trackerCard}>
        <View style={styles.trackerCardTop}>
          <View>
            <Text style={styles.trackerCardLabel}>{title}</Text>
            <Text style={styles.trackerCardTitle}>{subtitle}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={19} color={colors.subdued} />
        </View>
        {rows.map((row) => {
          const target = row.total ? (row.completed / row.total) * 100 : 0;
          return (
            <View key={row.subject} style={styles.trackerRow}>
              <Text style={styles.trackerRowName} numberOfLines={1}>
                {row.subject}
              </Text>
              <LiquidProgressBar progress={target / 100} color={tone} height={6} style={[styles.trackerBar, { height: 6 }]} />
              <Text style={styles.trackerRowCount}>
                {row.completed}/{row.total}
              </Text>
            </View>
          );
        })}
      </Pressable>
    </Animated.View>
  );
}

function EditField({
  label,
  value,
  onChange,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <View>
      <Text style={styles.editLabel}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        autoCapitalize="characters"
        onChangeText={(value) => onChange(numeric ? value : value.toUpperCase())}
        keyboardType={numeric ? "number-pad" : "default"}
        placeholderTextColor={colors.subdued}
        style={styles.editInput}
      />
    </View>
  );
}

const styles: Record<string, any> = createThemedStyles({
  page: { flex: 1, backgroundColor: "transparent" },
  publicBackRow: { position: "absolute", left: 4, top: 0, height: 70, width: 40, justifyContent: "center", alignItems: "flex-start", zIndex: 2 },
  profileTop: {
    zIndex: 5,
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: "transparent",
  },
  bodyScroll: { flex: 1 },
  content: { paddingHorizontal: 11, paddingTop: 10, paddingBottom: 112 },
  profileTopActions: { position: "absolute", top: 0, right: 0, zIndex: 2, flexDirection: "row", alignItems: "center", gap: 7 },
  profileSettingsAction: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  profileRow: { alignItems: "center", position: "relative" },
  profileStreak: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 38,
    height: 30,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 15,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#333333",
  },
  profileStreakActive: {
    backgroundColor: "rgba(251, 191, 36, .14)",
    borderColor: "rgba(251, 191, 36, .22)",
  },
  profileStreakText: { color: "#d4d4d8", fontSize: 12, fontWeight: "800" },
  profileStreakTextActive: { color: "#fef3c7" },
  // The source artwork carries a little extra transparent space below the flame.
  profileStreakFlame: { width: 18, height: 18, transform: [{ translateY: -3 }] },
  avatar: {
    position: "relative",
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarImage: { width: "100%", height: "100%", borderRadius: 42 },
  avatarFocusDot: { position: "absolute", top: 0, right: 0, zIndex: 2, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.background },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#202020",
    borderWidth: 1,
    borderColor: colors.border,
  },
  identity: { alignItems: "center", marginTop: 12 },
  exam: { color: colors.subdued, fontSize: 10, fontWeight: "700", letterSpacing: 2.2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  profileActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: colors.text, fontSize: 21, fontWeight: "700" },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 14,
    rowGap: 2,
    marginTop: 19,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 8 },
  actionText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  summaryCard: {
    marginTop: 27,
    overflow: "visible",
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 16,
  },
  cardHeader: {
    zIndex: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  cardEyebrow: { color: "#a1a1aa", fontSize: 10, fontWeight: "700", letterSpacing: 1.6 },
  trackerEyebrow: { paddingHorizontal: 14, paddingTop: 11 },
  rangeWrap: { position: "relative", zIndex: 40 },
  rangeButton: {
    height: 29,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 9,
    paddingHorizontal: 8,
    backgroundColor: "#292929",
  },
  rangeText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  rangeMenu: {
    position: "absolute",
    top: 34,
    right: 0,
    minWidth: 124,
    overflow: "hidden",
    borderRadius: 11,
    paddingVertical: 3,
    backgroundColor: "#292929",
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 30,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  rangeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  rangeOptionActive: { backgroundColor: "#f4f4f5" },
  rangeOptionText: { color: colors.muted, fontSize: 12 },
  rangeOptionTextActive: { color: "#171717", fontWeight: "800" },
  practiceGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 6 },
  trackerGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 7 },
  stat: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 3,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  statHalf: { width: "50%" },
  statLastColumn: { borderRightWidth: 0 },
  statLastRow: { borderBottomWidth: 0 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 12,
    marginTop: 2,
    textAlign: "center",
  },
  divider: { height: 1, backgroundColor: colors.border },
  heatmapSection: { marginTop: 12, paddingTop: 0 },
  heatmapPending: { opacity: 0 },
  heatmapHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  heatmapSummaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 4 },
  heatmapFacts: { flexDirection: "row", gap: 12 },
  heatmapFact: { flexDirection: "row", alignItems: "center" },
  heatmapMuted: { color: colors.muted, fontSize: 10 },
  heatmapNumber: { color: colors.text, fontSize: 10, fontWeight: "800" },
  heatmapToggle: { position: "relative", width: 128, flexShrink: 0, flexDirection: "row", padding: 2, borderRadius: 7, backgroundColor: "#282828" },
  heatmapToggleIndicator: { position: "absolute", top: 2, bottom: 2, left: 2, borderRadius: 5, backgroundColor: "#f4f4f5" },
  heatmapToggleOption: { zIndex: 1, flex: 1, paddingHorizontal: 6, paddingVertical: 3, alignItems: "center" },
  heatmapToggleText: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  heatmapToggleTextActive: { color: "#171717" },
  heatmapScroll: { marginTop: 9, marginRight: 6 },
  months: { gap: 10, paddingBottom: 4, paddingRight: 18 },
  month: { width: 58 },
  monthGrid: {
    height: 109,
    position: "relative",
  },
  heatCell: { width: 13, height: 13, borderRadius: 2 },
  heatSelected: { borderWidth: 1, borderColor: "#fff", transform: [{ scale: 1.15 }] },
  monthLabel: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 7 },
  heatScrollbar: {
    height: 3,
    overflow: "hidden",
    marginTop: 2,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  heatScrollbarHidden: { opacity: 0 },
  heatScrollbarThumb: { height: "100%", borderRadius: 2, backgroundColor: "#777782" },
  heatDetail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 1,
  },
  heatDetailDate: { color: colors.text, fontSize: 11, fontWeight: "700" },
  activityList: { maxHeight: 132, marginTop: 2 },
  activityListContent: { paddingRight: 2 },
  activityRow: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 1,
  },
  activityDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#6ee7b7" },
  activityText: { flex: 1, color: colors.muted, fontSize: 10 },
  activityTitle: { color: colors.text, fontWeight: "700" },
  activityCount: { color: colors.muted, fontSize: 10, fontFamily: "monospace" },
  noActivity: { paddingVertical: 7, color: colors.muted, fontSize: 11 },
  trackerOverview: { marginTop: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 13 },
  trackerHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  trackerTitle: { color: colors.text, fontSize: 19, fontWeight: "800", marginTop: 4 },
  trackerCount: { color: colors.muted, fontSize: 11, fontFamily: "monospace" },
  trackerCard: {
    marginTop: 9,
    borderRadius: 15,
    padding: 14,
    backgroundColor: "rgba(255,255,255,.025)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackerCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  trackerCardLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  trackerCardTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 3 },
  trackerRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 8 },
  trackerRowName: { width: 72, color: "#d4d4d8", fontSize: 11 },
  trackerBar: {
    flex: 1,
    maxWidth: 190,
    height: 5,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "#303030",
  },
  trackerBarFill: { height: "100%", borderRadius: 4 },
  trackerRowCount: {
    width: 43,
    marginLeft: "auto",
    color: colors.muted,
    fontSize: 10,
    textAlign: "right",
    fontFamily: "monospace",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,.70)",
  },
  editDialog: {
    position: "relative",
    borderRadius: 19,
    padding: 17,
    gap: 10,
    backgroundColor: "#202020",
    borderWidth: 1,
    borderColor: colors.border,
  },
  editTitle: { color: colors.text, fontSize: 19, fontWeight: "800", marginBottom: 1 },
  editHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editHeaderActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  settingsButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#292929",
  },
  settingsPanel: {
    position: "absolute",
    zIndex: 10,
    elevation: 10,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 19,
    padding: 17,
    backgroundColor: "#202020",
  },
  settingsToggleGroup: { borderRadius: 14, backgroundColor: "#151515", borderWidth: 1, borderColor: "#363636", overflow: "hidden" },
  settingsToggleRow: { borderWidth: 0, borderRadius: 0, backgroundColor: "transparent", paddingVertical: 12 },
  settingsToggleDivider: { borderTopWidth: 1, borderColor: "#303030" },
  accentPanel: { borderRadius: 14, backgroundColor: "#151515", borderWidth: 1, borderColor: "#363636", padding: 12 },
  accentChoices: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3, paddingHorizontal: 2 },
  accentChoice: { flexShrink: 0, width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  accentSwatch: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  settingsPanelHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  settingsBack: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  settingsTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  settingsScreen: {
    flex: 1,
    paddingTop: 58,
    paddingHorizontal: 20,
    backgroundColor: colors.background,
  },
  settingsScreenHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22 },
  settingsBackButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#252525",
  },
  settingsScreenTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  editLabel: {
    color: colors.subdued,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: "800",
    marginBottom: 5,
  },
  editInput: {
    height: 42,
    borderRadius: 11,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  usernameInputWrap: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 11,
    paddingLeft: 12,
    paddingRight: 11,
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  usernameInput: { flex: 1, height: "100%", color: colors.text },
  usernameHint: { marginTop: 4, fontSize: 10 },
  usernameHintAvailable: { color: "#86efac" },
  usernameHintError: { color: "#fca5a5" },
  subjectSetup: { marginTop: -2 },
  addSubjects: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
  },
  addSubjectsText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  subjectSetupLabel: { marginTop: 5, marginBottom: 3 },
  chooseSubjectFile: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 11,
    paddingHorizontal: 11,
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  chooseSubjectFileText: { flex: 1, color: colors.text, fontSize: 12 },
  subjectHint: { color: colors.subdued, fontSize: 9, marginTop: 3 },
  subjectImportError: { color: "#fca5a5", fontSize: 9, marginTop: 3, lineHeight: 13 },
  manifestationField: { marginTop: -3 },
  featureToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 11,
    padding: 11,
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  featureToggleTitle: { color: colors.text, fontSize: 12, fontWeight: "700" },
  featureToggleContent: { flex: 1, minWidth: 0, paddingRight: 10 },
  featureToggleSpacing: { marginTop: 10 },
  featureToggleCopy: { flexShrink: 1, color: colors.subdued, fontSize: 10, lineHeight: 14, marginTop: 2 },
  featureSwitch: {
    width: 32,
    height: 18,
    justifyContent: "center",
    borderRadius: 9,
    padding: 2,
    borderWidth: 1,
    borderColor: "#71717a",
    backgroundColor: "transparent",
  },
  featureSwitchOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  featureKnob: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#a1a1aa" },
  featureKnobOn: { alignSelf: "flex-end", backgroundColor: colors.accentDeep },
  manifestationLabel: { marginBottom: 2 },
  manifestationInput: {
    minHeight: 48,
    maxHeight: 48,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
    textAlignVertical: "top",
  },
  editActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 15,
    marginTop: 1,
  },
  cancel: { color: "#d4d4d8", fontWeight: "700" },
  saveProfile: {
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: colors.button,
  },
  saveProfileText: { color: colors.buttonInk, fontWeight: "600" },
  weeklyScore: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  weeklyScorePositive: { backgroundColor: "rgba(74,222,128,.12)" },
  weeklyScoreNegative: { backgroundColor: "rgba(248,113,113,.12)" },
  weeklyScoreNeutral: { backgroundColor: "rgba(255,255,255,.10)" },
  weeklyScoreText: { fontSize: 10, fontWeight: "800" },
  weeklyScoreTextPositive: { color: "#86efac" },
  weeklyScoreTextNegative: { color: "#fca5a5" },
  weeklyScoreTextNeutral: { color: "#a1a1aa" },
  weeklyRank: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: "rgba(255,255,255,.10)" },
  weeklyRankText: { color: "#d4d4d8", fontSize: 10, fontWeight: "800" },
  weeklyRankMedal: { width: 12, height: 12, resizeMode: "contain" },
  xpBlock: { marginTop: 4, gap: 4, width: 240, maxWidth: "100%" },
  xpText: { color: "#a1a1aa", fontSize: 10, fontWeight: "700" },
  xpNegative: { color: "#fca5a5" },
  xpTrack: { height: 4, overflow: "hidden", borderRadius: 4, backgroundColor: "#303030" },
  xpFill: { height: "100%", borderRadius: 4, backgroundColor: "#a78bfa" },
  xpDialogBackdrop: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,.76)" },
  xpDialog: { borderRadius: 20, borderWidth: 1, borderColor: "#343434", backgroundColor: "#1a1a1a", padding: 20 },
  xpDialogHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  xpDialogEyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  xpDialogTitle: { marginTop: 5, color: colors.text, fontSize: 19, fontWeight: "800" },
  xpDialogHero: { marginTop: 16, borderWidth: 1, borderColor: "rgba(167,139,250,.20)", borderRadius: 14, backgroundColor: "rgba(139,92,246,.08)", padding: 13 },
  xpDialogPoints: { color: "#86efac", fontSize: 18, fontWeight: "900" },
  xpDialogHint: { marginTop: 3, color: "#a1a1aa", fontSize: 11 },
  xpDialogTrack: { height: 5, overflow: "hidden", borderRadius: 5, backgroundColor: "#303030", marginTop: 10 },
  xpTimeline: { position: "relative", marginTop: 20, gap: 10 },
  xpTimelineSegment: { position: "absolute", top: 13, bottom: -23, left: 2, width: 6 },
  xpTimelineRow: { position: "relative", minHeight: 42, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  xpTimelineDot: { zIndex: 1, width: 11, height: 11, marginTop: 8, borderRadius: 6, borderWidth: 2, borderColor: "#1a1a1a", backgroundColor: "#454545" },
  xpTimelineDotReached: { backgroundColor: "#a78bfa" },
  xpTimelineDotCurrent: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#c4b5fd" },
  xpTimelineCopy: { flex: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "rgba(255,255,255,.025)" },
  xpTimelineCopyCurrent: { borderWidth: 1, borderColor: "rgba(167,139,250,.25)", backgroundColor: "rgba(139,92,246,.10)" },
  xpTimelineName: { color: "#d4d4d8", fontSize: 13, fontWeight: "700" },
  xpTimelineNameCurrent: { color: "#f5f3ff" },
  xpTimelineRequirement: { marginTop: 1, color: colors.muted, fontSize: 10 },
  xpTimelineCurrent: { marginLeft: -4, borderRadius: 8, backgroundColor: "rgba(139,92,246,.14)", paddingHorizontal: 7, paddingVertical: 4, color: "#c4b5fd", fontSize: 9, fontWeight: "900" },
  confirmDialog: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: "#1d1d1d",
    borderWidth: 1,
    borderColor: "#353535",
  },
  confirmHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  confirmIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "rgba(244,63,94,.12)",
  },
  confirmTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 15 },
  confirmCopy: { color: colors.muted, fontSize: 13, marginTop: 5 },
  confirmActions: { flexDirection: "row", gap: 9, marginTop: 20 },
  cancelButton: {
    flex: 1,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#2b2b2b",
  },
  cancelButtonText: { color: "#e4e4e7", fontSize: 13, fontWeight: "700" },
  logoutConfirm: {
    flex: 1,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#e11d48",
  },
  logoutConfirmText: { color: "#fff1f2", fontSize: 13, fontWeight: "800" },
});
