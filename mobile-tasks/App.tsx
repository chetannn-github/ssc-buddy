import { DestructiveDialog } from "./src/components/DestructiveDialog";
import { DeviceFocusSync } from "./src/components/DeviceFocusSync";
import { FocusWidgetSync } from "./src/components/FocusWidgetSync";
import { AccentBackdrop } from "./src/components/AccentBackdrop";
import { launchImages } from "./src/lib/launch-images";
import { LaunchMotivation } from "./src/components/LaunchMotivation";
import { UppercaseTextInput as TextInput } from "./src/components/UppercaseTextInput";
import { setAppAccent, useAppAccent } from "./src/theme";
import { createThemedStyles } from "./src/theme";
import { TaskOverview } from "./src/components/TaskOverview";
import { DailyFocusReward } from "./src/components/DailyFocusReward";
import { StudyLock } from "./src/components/StudyLock";
import { DailySectionHeader } from "./src/components/DailySectionHeader";
import { colors, dailyTaskColors } from "./src/theme";
import { DropdownChevron } from "./src/components/DropdownChevron";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as ExpoSplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Animated,
  ActivityIndicator,
  AppState,
  Easing,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Keyboard,
  useWindowDimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NumberFlow } from "number-flow-react-native";
import {
  createTaskId,
  dateKey,
  dateKeyFromOffset,
  formatMinutes,
  summarizeTasks,
  TASK_TYPES,
  TASK_STORAGE_KEY,
  LEGACY_TASK_STORAGE_KEY,
  tasksInLastDays,
  type Task,
  type TaskType,
} from "./src/domain/tasks";
import { LiquidProgressBar } from "./src/components/ProfileXpBar";
import { TaskRow } from "./src/components/TaskRow";
import { AnimatedTimeChips } from "./src/components/AnimatedTimeChips";
import { canChangeTaskCompletion } from "./src/domain/tasks";
import { WeeklyAwardCelebration } from "./src/components/WeeklyAwardCelebration";
import { CelebrationFireworks } from "./src/components/CelebrationFireworks";
import { BottomNavigation } from "./src/components/BottomNavigation";
import { type TabKey, tabs } from "./src/navigation/tabs";
import { ComingSoonScreen } from "./src/screens/ComingSoonScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { isFirebaseConfigured, migrateTasksIfEmpty, observeSession, patchCloudProfile, publishLeaderboardEntry, readCloudProfile, saveProfileWithUsername, savePublicProfileActivity, syncTaskChanges, watchCloudProfile, watchPracticeEntities, watchTasks, watchTrackerSections, watchTrackerTests, watchWeeklyLeaderboardRank, writeQuestionLearning } from "./src/lib/firebase";
import { logout } from "./src/lib/firebase";
import { defaultProfile, loadProfile, normalizeProfile, saveProfile, type PracticeProfile } from "./src/lib/profile-store";
import { prepareMobileAccountCache } from "./src/lib/account-cache";
import { loadActiveTest } from "./src/lib/active-test";
import { avatarAssets, ProfileScreen } from "./src/screens/ProfileScreen";
import { LeaderboardScreen } from "./src/screens/LeaderboardScreen";
import { MediaOverlay, type MediaMode } from "./src/screens/MediaOverlay";
import { PracticeScreen } from "./src/screens/PracticeScreen";
import { TrackScreen } from "./src/screens/TrackScreen";
import { useHabitReminders } from "./src/hooks/use-habit-reminders";
import { getNativeNotifications } from "./src/lib/native-notifications";
import { HabitsScreen } from "./src/screens/HabitsScreen";
import { TimersScreen } from "./src/screens/TimersScreen";
import { ProgressScreen } from "./src/screens/ProgressScreen";
import { QuickRecallScreen } from "./src/screens/QuickRecallScreen";
import { reportVerticalTouch } from "./src/navigation/bottomNavigationVisibility";
import type { User } from "firebase/auth";
import { reportVerticalScroll, resetBottomNavigation } from "./src/navigation/bottomNavigationVisibility";
import { getUnlockQuiz, loadUnlockQuiz } from "./src/domain/unlock-quiz";
import { getXpSummary } from "./src/domain/xp";

// Keep the native layer visible until our branded React splash has mounted.
// Without this, Android briefly flashes Expo's default splash between launch
// and the custom SSC Buddy screen.
void ExpoSplashScreen.preventAutoHideAsync().catch(() => undefined);

const rankMedals = [require("./assets/gold-medal.png"), require("./assets/silver-medal.png"), require("./assets/bronze-medal.png")];

const MANIFESTATION_COMPLETION_PREFIX = "ssc-buddy:manifestation-completion";
const WIDGET_META_STORAGE_KEY = "ssc-buddy:widget-meta:v1";
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const weeklyTaskPointMap = (tasks: Task[]) => {
  const now = new Date(), start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const weekStart = localDateKey(start); const end = new Date(start); end.setDate(end.getDate() + 6); const weekEnd = localDateKey(end), today = localDateKey(now); let creditedMinutes = 0;
  return new Map(tasks.filter((task) => task.date >= weekStart && task.date <= weekEnd).map((task) => { if (!task.completed) return [task.id, task.date < today ? -5 : 0] as const; const before = Math.min(210, Math.floor(creditedMinutes / 10)); creditedMinutes += Math.max(0, Number(task.minutesSpent) || 0); return [task.id, 10 + Math.min(210, Math.floor(creditedMinutes / 10)) - before] as const; }));
};
const weeklyInactivityPenalty = (tasks: Task[]) => {
  const now = new Date(), start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const weekStart = localDateKey(start), end = new Date(start);
  end.setDate(end.getDate() + 6);
  const weekEnd = localDateKey(end), today = localDateKey(now);
  const weekTasks = tasks.filter((task) => task.date >= weekStart && task.date <= weekEnd);
  const firstTrackedDay = weekTasks.filter((task) => task.date < today).map((task) => task.date).sort()[0];
  let inactiveDays = 0;
  for (const cursor = new Date(`${firstTrackedDay ?? today}T00:00:00`); localDateKey(cursor) < today; cursor.setDate(cursor.getDate() + 1)) {
    if (!weekTasks.some((task) => task.date === localDateKey(cursor) && task.completed)) inactiveDays += 1;
  }
  return inactiveDays * 50;
};

function manifestationDayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function manifestationCompletionKey(userId?: string) {
  return `${MANIFESTATION_COMPLETION_PREFIX}:${userId ?? "local"}`;
}

const ScrollView = (props: any) => <NativeScrollView {...props} scrollEventThrottle={16} onScroll={(event) => { if (!props.horizontal) reportVerticalScroll(event.nativeEvent.contentOffset.y, event.nativeEvent); props.onScroll?.(event); }} />;

function AnimatedMetric({ value, format = (next: number) => String(next) }: { value: number; format?: (value: number) => string }) {
  const animated = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    animated.stopAnimation();
    const listener = animated.addListener(({ value: next }) => setDisplay(Math.round(next)));
    Animated.timing(animated, { toValue: value, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => animated.removeListener(listener);
  }, [animated, value]);

  return <>{format(display)}</>;
}

function RollingMetric({ value, prefix = "", suffix = "", color = "#86efac", fontSize = 11 }: { value: number; prefix?: string; suffix?: string; color?: string; fontSize?: number }) {
  return <NumberFlow
    value={value}
    prefix={prefix}
    suffix={suffix}
    style={{ color, fontSize, fontWeight: "800", fontVariant: ["tabular-nums"] }}
  />;
}

function RollingDuration({ minutes, color = "#fafafa", fontSize = 23 }: { minutes: number; color?: string; fontSize?: number }) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: hours > 0 && remainingMinutes > 0 ? 4 : 0 }}>
    {hours > 0 && <RollingMetric value={hours} suffix="h" color={color} fontSize={fontSize} />}
    {(hours === 0 || remainingMinutes > 0) && <RollingMetric value={remainingMinutes} suffix="m" color={color} fontSize={fontSize} />}
  </View>;
}

function PointsSpark({ points }: { points: number }) {
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0);
  useEffect(() => {
    // Native GIFs loop forever. Remount for each Tasks visit/points change,
    // then deliberately replace it with its exported final still frame.
    setPlaying(true);
    setRun((value) => value + 1);
    const timeout = setTimeout(() => setPlaying(false), 6010);
    return () => clearTimeout(timeout);
  }, [points]);
  return <Image key={`${playing ? "play" : "final"}-${run}`} source={playing ? require("./assets/points-spark.gif") : require("./assets/points-spark-final.png")} resizeMode="contain" style={styles.pointsSpark} />;
}

function StreakCelebration({ streak, onClose }: { streak: number; onClose: () => void }) {
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.streakCelebrationBackdrop} onPress={onClose}>
        <CelebrationFireworks />
        <Pressable style={styles.streakCelebrationDialog} onPress={() => undefined}>
          <Pressable accessibilityLabel="Close streak celebration" hitSlop={10} onPress={onClose} style={styles.streakCelebrationClose}>
            <MaterialCommunityIcons name="close" size={19} color="#a1a1aa" />
          </Pressable>
          <View style={styles.streakCelebrationIcon}>
            <ExpoImage
              source={require("./assets/consistency-firework.webp")}
              autoplay
              contentFit="contain"
              transition={0}
              style={styles.streakCelebrationFirework}
            />
          </View>
          <Text style={styles.streakCelebrationEyebrow}>STREAK INCREASED</Text>
          <Text style={styles.streakCelebrationTitle}>{streak}-day streak</Text>
          <Text style={styles.streakCelebrationCopy}>Keep showing up.</Text>
          <Pressable style={styles.streakCelebrationButton} onPress={onClose}>
            <Text style={styles.streakCelebrationButtonText}>Continue</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LevelCelebration({ level, onClose }: { level: number; onClose: () => void }) {
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.streakCelebrationBackdrop} onPress={onClose}>
        <Pressable style={styles.streakCelebrationDialog} onPress={() => undefined}>
          <Pressable accessibilityLabel="Close level celebration" hitSlop={10} onPress={onClose} style={styles.streakCelebrationClose}><MaterialCommunityIcons name="close" size={19} color="#a1a1aa" /></Pressable>
          <View style={styles.streakCelebrationIcon}><ExpoImage source={require("./assets/consistency-firework.webp")} autoplay contentFit="contain" transition={0} style={styles.streakCelebrationFirework} /></View>
          <Text style={styles.streakCelebrationEyebrow}>LEVEL UP</Text>
          <Text style={styles.streakCelebrationTitle}>Level {level}</Text>
          <Text style={styles.streakCelebrationCopy}>Your effort is paying off.</Text>
          <Pressable style={styles.streakCelebrationButton} onPress={onClose}><Text style={styles.streakCelebrationButtonText}>Continue</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [showSplash, setShowSplash] = useState(true);
  const [uiSettingsReady, setUiSettingsReady] = useState(false);
  const nativeSplashHidden = useRef(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [focusSetupRequest, setFocusSetupRequest] = useState(0);
  const [mediaMode, setMediaMode] = useState<MediaMode>(null);
  const [quickRecallOpen, setQuickRecallOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [musicOpenRequest, setMusicOpenRequest] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const currentTasks = useRef(tasks);
  currentTasks.current = tasks;
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [calendarDay, setCalendarDay] = useState(() => dateKey());
  const [widgetRank, setWidgetRank] = useState<number | null>(null);
  const [practiceActivityDates, setPracticeActivityDates] = useState<string[]>([]);
  const [trackerActivityDates, setTrackerActivityDates] = useState<string[]>([]);
  const [publicPracticeRecords, setPublicPracticeRecords] = useState<Record<string, any>[]>([]);
  const [publicTracker, setPublicTracker] = useState<Record<string, any>>({ subjects: [], revision: {}, activity: [], tests: { log: [] } });
  const [profileMockTests, setProfileMockTests] = useState<any[]>([]);
  const [profileActivityReady, setProfileActivityReady] = useState(false);
  const [publicActivityOwner, setPublicActivityOwner] = useState<string | null>(null);
  const [publicTasksOwner, setPublicTasksOwner] = useState<string | null>(null);
  const [publicProfileOwner, setPublicProfileOwner] = useState<string | null>(null);
  const [celebratedStreak, setCelebratedStreak] = useState<number | null>(null);
  const [celebratedLevel, setCelebratedLevel] = useState<number | null>(null);
  const [profileSettings, setProfileSettings] = useState<PracticeProfile | null>(null);
  const launchQuotesEnabled = useRef(true);
  launchQuotesEnabled.current = profileSettings?.randomQuotesEnabled !== false;
  useEffect(() => { if (profileSettings?.randomQuotesEnabled === false) setShowLaunchMotivation(false); }, [profileSettings?.randomQuotesEnabled]);
  const widgetAppearance = useRef({ rank: widgetRank, accent: profileSettings?.accentColor });
  widgetAppearance.current = { rank: widgetRank, accent: profileSettings?.accentColor };
  useAppAccent();
  useEffect(() => { setAppAccent(profileSettings?.accentColor); }, [profileSettings?.accentColor]);
  const [appTab, setAppTab] = useState<TabKey>("tasks");
  const taskSection = useRef<"tasks" | "habits">("tasks");
  useEffect(() => { if (appTab === "tasks" || appTab === "habits") taskSection.current = appTab; }, [appTab]);
  const [timerWidgetRequest, setTimerWidgetRequest] = useState(0);
  const [habitWidgetRequest, setHabitWidgetRequest] = useState<{ id: string; uid?: string } | null>(null);
  const initialWidgetUrlRead = useRef(false);
  const externalLaunch = useRef(false);
  const [showLaunchMotivation, setShowLaunchMotivation] = useState(false);
  const [launchImage] = useState(() => {
    return launchImages[Math.floor(Math.random() * launchImages.length)];
  });
  const [trackTab, setTrackTab] = useState<"Syllabus" | "Revision" | "Mock Test">("Syllabus");
  const [dailyManifestation, setDailyManifestation] = useState("");
  const [manifestationEntry, setManifestationEntry] = useState("");
  const [manifestationRepeats, setManifestationRepeats] = useState(0);
  const [manifestationError, setManifestationError] = useState("");
  const learningFingerprint = useRef("");
  const authChangeVersion = useRef(0);
  const taskCacheVersion = useRef(0);
  const profileCacheVersion = useRef(0);
  const previousStreak = useRef<number | null>(null);
  const previousXpLevel = useRef<number | null>(null);
  const [taskDay, setTaskDayMode] = useState<"today" | "tomorrow">("today");
  const [taskDueOnly, setTaskDueOnly] = useState(false);
  const [taskHistoryDate, setTaskHistoryDate] = useState<string | null>(null);
  const [dailyWeekEnd, setDailyWeekEnd] = useState<string | undefined>();
  const setTaskDay = (value: "today" | "tomorrow" | ((current: "today" | "tomorrow") => "today" | "tomorrow")) => { setTaskHistoryDate(null); setTaskDayMode(value); };
  useEffect(() => {setTaskHistoryDate(null);setTaskDayMode("today");}, [user?.uid]);
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Other");
  const [type, setType] = useState<TaskType>("Practice Session");
  const [schedule, setSchedule] = useState<"today" | "tomorrow">("today");
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  useEffect(() => { setSubjectMenuOpen(false); setTypeMenuOpen(false); }, [editor]);
  const [customSubject, setCustomSubject] = useState("");
  const [addSubjectDialog, setAddSubjectDialog] = useState(false);
  const [completion, setCompletion] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [spent, setSpent] = useState("60");
  const [taskActionLoading, setTaskActionLoading] = useState(false);
  const taskRowInteractionBlockedUntil = useRef(0);
  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshCalendarDay = () => setCalendarDay((previous) => {
      const next = dateKey();
      return previous === next ? previous : next;
    });
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 1, 0);
      midnightTimer = setTimeout(() => {
        refreshCalendarDay();
        scheduleMidnightRefresh();
      }, Math.max(1_000, nextMidnight.getTime() - now.getTime()));
    };
    scheduleMidnightRefresh();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshCalendarDay();
    });
    return () => { if (midnightTimer) clearTimeout(midnightTimer); appStateSubscription.remove(); };
  }, []);
  useHabitReminders(user?.uid, profileSettings?.habitsEnabled !== false, authReady && uiSettingsReady);
  const activeAppTab = tabs.find((item) => item.key === appTab) ?? tabs[0];
  // Task-only users can build their own subject list without creating a syllabus.
  const subjectOptions = [...new Set(tasks.map((task) => task.subject).filter(Boolean))];
  if (!subjectOptions.length) subjectOptions.push("Other");
  const refreshDailyTasksWidget = (next: Task[]) => {
    if (Platform.OS !== "android") return;
    try {
      const { requestWidgetUpdate } = require("react-native-android-widget");
      const { renderDailyTasksWidget } = require("./src/widgets/DailyTasksWidget");
      const { loadDailyTaskWidgetOptions } = require("./src/widgets/daily-task-widget-store");
      void requestWidgetUpdate({
        widgetName: "DailyTasksWidget",
        renderWidget: async (info: { widgetId: number; height: number }) => renderDailyTasksWidget(next, widgetAppearance.current.rank, widgetAppearance.current.accent, { ...await loadDailyTaskWidgetOptions(info.widgetId, user?.uid), height: info.height }),
      });
      const { renderQuickRecallWidget } = require("./src/widgets/QuickRecallWidget");
      void requestWidgetUpdate({
        widgetName: "QuickRecallWidget",
        renderWidget: async () => renderQuickRecallWidget(await getUnlockQuiz()),
      });
    } catch {}
  };
  useEffect(() => {
    if (!user) { setWidgetRank(null); return; }
    return watchWeeklyLeaderboardRank(user, (rank) => setWidgetRank(rank));
  }, [calendarDay, user?.uid]);
  useEffect(() => {
    void AsyncStorage.setItem(WIDGET_META_STORAGE_KEY, JSON.stringify({ rank: widgetRank }));
    if (tasksLoaded) refreshDailyTasksWidget(tasks);
  }, [widgetRank, profileSettings?.accentColor, user?.uid]);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return observeSession((nextUser) => {
      const version = ++authChangeVersion.current;
      if (!nextUser) {
        setAuthenticated(false);
        setUiSettingsReady(true);
        setUser(null);
        setAuthReady(true);
        return;
      }
      setAuthReady(false);
      setUiSettingsReady(false);
      profileCacheVersion.current += 1;
      void prepareMobileAccountCache(nextUser.uid).then(async (switchedAccount) => {
        const activeTest = await loadActiveTest().catch(() => null);
        if (version !== authChangeVersion.current) return;
        if (activeTest) setAppTab("practice");
        if (switchedAccount) {
          taskCacheVersion.current += 1;
          profileCacheVersion.current += 1;
          setTasks([]);
          learningFingerprint.current = "";
        }
        const cachedProfile = await loadProfile();
        if (version !== authChangeVersion.current) return;
        setAppAccent(cachedProfile.accentColor);
        setProfileSettings(cachedProfile);
        setUiSettingsReady(Boolean(cachedProfile.name?.trim()));
        setUser(nextUser);
        setAuthenticated(true);
        setAuthReady(true);
      }).catch(() => {
        if (version !== authChangeVersion.current) return;
        setAppAccent(undefined);
        setProfileSettings(defaultProfile());
        setUiSettingsReady(true);
        setUser(nextUser);
        setAuthenticated(true);
        setAuthReady(true);
      });
    });
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1150);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const version = profileCacheVersion.current;
    void loadProfile().catch(() => defaultProfile()).then((profile) => {
      if (version === profileCacheVersion.current) {
        setAppAccent(profile.accentColor);
        setProfileSettings(profile);
        setUiSettingsReady(true);
      }
    });
  }, []);
  useEffect(() => {
    if (!authenticated || !profileSettings) return;
    const phrase = profileSettings?.manifestation?.trim().toUpperCase() ?? "";
    if (!phrase) {
      setDailyManifestation("");
      return;
    }
    let cancelled = false;
    const expectedCompletion = `${manifestationDayKey()}|${phrase}`;
    void AsyncStorage.getItem(manifestationCompletionKey(user?.uid)).then((savedCompletion) => {
      if (!cancelled && savedCompletion !== expectedCompletion) setDailyManifestation(phrase);
    });
    return () => { cancelled = true; };
  }, [authenticated, profileSettings?.manifestation, user?.uid]);
  useEffect(() => {
    if (authenticated) return;
    setDailyManifestation("");
    setManifestationEntry("");
    setManifestationRepeats(0);
  }, [authenticated]);
  useEffect(() => {
    if (!user) return;
    let disposed = false;
    const syncLearning = async () => {
      const state = await loadUnlockQuiz();
      if (disposed || !state) return;
      const payload = { stats: state.stats, lastSubject: state.subject };
      const fingerprint = JSON.stringify(payload);
      if (fingerprint === learningFingerprint.current) return;
      learningFingerprint.current = fingerprint;
      try { await writeQuestionLearning(user, payload); } catch { learningFingerprint.current = ""; }
    };
    void syncLearning();
    const timer = setInterval(() => { void syncLearning(); }, 5_000);
    return () => { disposed = true; clearInterval(timer); };
  }, [user?.uid]);

  useEffect(() => {
    if (!authenticated || !user || !profileSettings) return;
    let cancelled = false;
    let applyingRemote = false;
    let unsubscribe: (() => void) | undefined;
    const apply = async (raw: Record<string, unknown>) => {
      try {
        const next = await saveProfile(normalizeProfile(raw));
        if (!cancelled) { setAppAccent(next.accentColor); setProfileSettings(next); }
      } catch {}
    };
    const start = async () => {
      setPublicProfileOwner(null);
      try {
        const remote = await readCloudProfile(user);
        if (cancelled) return;
        if (remote) { applyingRemote = true; await apply(remote); applyingRemote = false; }
        else await patchCloudProfile(user, profileSettings);
        if (cancelled) return;
        setPublicProfileOwner(user.uid);
        unsubscribe = watchCloudProfile(user, (value) => {
          if (value && !applyingRemote) void apply(value);
        });
      } catch {}
      finally { if (!cancelled) setUiSettingsReady(true); }
    };
    void start();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [authenticated, user?.uid]);

  const saveSharedProfile = async (next: PracticeProfile) => {
    const normalized = normalizeProfile(next);
    const previous: Partial<PracticeProfile> = profileSettings ?? {};
    const changed = Object.fromEntries(
      Object.entries(normalized).filter(([key, value]) => previous[key as keyof PracticeProfile] !== value),
    );
    if (user && normalized.username) await saveProfileWithUsername(user, normalized);
    setProfileSettings(normalized);
    await saveProfile(normalized);
    if (user && Object.keys(changed).length && !normalized.username) void patchCloudProfile(user, changed);
  };

  const avatarRepair = useRef("");
  useEffect(() => {
    if (!authenticated || !profileSettings?.avatar || avatarAssets[profileSettings.avatar]) return;
    const key = `${user?.uid ?? "local"}:${profileSettings.avatar}`;
    if (avatarRepair.current === key) return;
    const files = Object.keys(avatarAssets).filter(file => file !== "__default");
    if (!files.length) return;
    avatarRepair.current = key;
    const next = { ...profileSettings, avatar: files[Math.floor(Math.random() * files.length)] };
    // Persist the repair, including the shared cloud profile, rather than only rendering a fallback.
    void saveSharedProfile(next).catch(() => { avatarRepair.current = ""; });
  }, [authenticated, user?.uid, profileSettings]);

  useEffect(() => {
    if (authenticated && profileSettings && !profileSettings.username) setAppTab("profile");
  }, [authenticated, profileSettings?.username]);
  const resumedTestOwner = useRef<string | null>(null);
  useEffect(() => {
    if (!authenticated || !user || !profileSettings?.username || profileSettings.practiceSessionEnabled === false) return;
    if (resumedTestOwner.current === user.uid) return;
    let stopped = false;
    void loadActiveTest().then((saved) => {
      if (stopped) return;
      resumedTestOwner.current = user.uid;
      if (saved) setAppTab("practice");
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, [authenticated, user?.uid, profileSettings?.username, profileSettings?.practiceSessionEnabled]);
  useEffect(() => {
    if (profileSettings?.practiceSessionEnabled === false && appTab === "practice") setAppTab("profile");
  }, [appTab, profileSettings?.practiceSessionEnabled]);
  useEffect(() => {
    if (profileSettings?.trackProgressEnabled === false && (appTab === "track" || appTab === "progress")) setAppTab("profile");
  }, [appTab, profileSettings?.trackProgressEnabled]);
  useEffect(() => { if (profileSettings?.habitsEnabled === false && appTab === "habits") setAppTab("tasks"); }, [appTab, profileSettings?.habitsEnabled]);
  useEffect(() => { if (profileSettings?.timersEnabled === false && appTab === "timers") setAppTab("profile"); }, [appTab, profileSettings?.timersEnabled]);

  useEffect(() => {
    void (async () => {
      const version = taskCacheVersion.current;
      const current = await AsyncStorage.getItem(TASK_STORAGE_KEY);
      const raw = current ?? await AsyncStorage.getItem(LEGACY_TASK_STORAGE_KEY);
      if (version !== taskCacheVersion.current) return;
      const stored = raw ? (JSON.parse(raw) as Task[]) : [];
      const normalized = stored.map((storedTask) => {
        const { targetMinutes: _legacyTarget, ...task } = storedTask as Task & { targetMinutes?: number };
        return task;
      }).filter((task) => !task.id.startsWith("demo-"));
      if (version !== taskCacheVersion.current) return;
      setTasks(normalized);
      await AsyncStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(normalized));
      if (!current && raw) await AsyncStorage.removeItem(LEGACY_TASK_STORAGE_KEY);
      setTasksLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!tasksLoaded) return;
    const openCompletionFromWidget = (url: string | null) => {
      if (url) { externalLaunch.current = true; setShowLaunchMotivation(false); }
      if (url && /^sscbuddy:\/\/focus-lock(?:[/?#]|$)/.test(url)) {
        setLeaderboardOpen(false); setQuickRecallOpen(false); setAppTab("tasks");
        setFocusSetupRequest(value => value + 1);
        return;
      }
      if (url?.startsWith("sscbuddy://habits")) {
        setAppTab("habits");
        if (url.startsWith("sscbuddy://habits/checklist?")) {
          try {
            const id = /[?&]habitId=([^&]+)/.exec(url)?.[1];
            const owner = /[?&]uid=([^&]+)/.exec(url)?.[1];
            if (id) setHabitWidgetRequest({ id: decodeURIComponent(id), uid: owner ? decodeURIComponent(owner) : undefined });
          } catch { /* Ignore malformed external links. */ }
        }
        return;
      }
      if (url?.startsWith("sscbuddy://music")) { setMediaMode("music"); setMusicOpenRequest((value) => value + 1); return; }
      if (url?.startsWith("sscbuddy://timers")) {
        setAppTab("timers");
        if (url.startsWith("sscbuddy://timers/widget")) setTimerWidgetRequest(value => value + 1);
        return;
      }
      if (!url?.startsWith("sscbuddy://tasks")) return;
      if (!url.startsWith("sscbuddy://tasks/complete")) {
        setAppTab("tasks");
        setTaskDay("today");
        const requestedDate = /[?&]date=(\d{4}-\d{2}-\d{2})(?:&|$)/.exec(url)?.[1];
        if (requestedDate && requestedDate < dateKey()) setTaskHistoryDate(requestedDate);
        else if (requestedDate === dateKeyFromOffset(1)) setTaskDay("tomorrow");
        if (url.startsWith("sscbuddy://tasks/new")) { openNew(); setSchedule("today"); }
        return;
      }
      const taskId = /[?&]taskId=([^&]+)/.exec(url)?.[1];
      const task = taskId ? tasks.find((item) => item.id === decodeURIComponent(taskId)) : undefined;
      if (!task || task.completed) return;
      setAppTab("tasks");
      setTaskDay("today");
      setSpent(String(task.minutesSpent ?? 60));
      setCompletion(task);
    };
    const HabitNotifications = getNativeNotifications();
    const notification = HabitNotifications?.addNotificationResponseReceivedListener(response => {
      externalLaunch.current = true;
      setShowLaunchMotivation(false);
      const url = response.notification.request.content.data?.["url"];
      if (typeof url === "string") openCompletionFromWidget(url);
      void HabitNotifications?.clearLastNotificationResponseAsync().catch(() => undefined);
    });
    if (!initialWidgetUrlRead.current) {
      initialWidgetUrlRead.current = true;
      // Decide only after both launch sources settle, avoiding a motivational
      // image flashing over widget and media-notification destinations.
      void Promise.all([
        Linking.getInitialURL().catch(() => null),
        HabitNotifications?.getLastNotificationResponseAsync().catch(() => null) ?? Promise.resolve(null),
      ]).then(([url, response]) => {
        if (url || response) {
          externalLaunch.current = true;
          setShowLaunchMotivation(false);
          if (url) openCompletionFromWidget(url);
          else {
            const notificationUrl = response?.notification.request.content.data?.["url"];
            if (typeof notificationUrl === "string") openCompletionFromWidget(notificationUrl);
          }
          if (response) void HabitNotifications?.clearLastNotificationResponseAsync().catch(() => undefined);
        } else if (!externalLaunch.current && launchQuotesEnabled.current) setShowLaunchMotivation(true);
      });
    }
    const subscription = Linking.addEventListener("url", ({ url }) => openCompletionFromWidget(url));
    return () => { subscription.remove(); notification?.remove(); };
  }, [tasks, tasksLoaded]);
  useEffect(() => {
    if (!authenticated || !user || !tasksLoaded) return;
    setPublicTasksOwner(null);
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        await migrateTasksIfEmpty(user, tasks);
        if (cancelled) return;
        unsubscribe = watchTasks(user, (remote) => {
          if (cancelled) return;
          const next = remote as Task[];
          setTasks(next);
          void AsyncStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(next));
          refreshDailyTasksWidget(next);
        }, () => { if (!cancelled) setPublicTasksOwner(user.uid); });
      } catch {}
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  // Initial migration must only run once per authenticated account.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user?.uid, tasksLoaded]);
  // Matches the web consistency count: practice, tracker, and completed tasks.
  useEffect(() => {
    setPublicActivityOwner(null);
    if (!user) { setPracticeActivityDates([]); setTrackerActivityDates([]); setProfileActivityReady(false); return; }
    let active = true;
    let attemptsReady = false;
    let trackerReady = false;
    let testsReady = false;
    const markReady = () => {
      if (active && attemptsReady && trackerReady && testsReady) { setProfileActivityReady(true); setPublicActivityOwner(user.uid); }
    };
    setProfileActivityReady(false);
    const stopAttempts = watchPracticeEntities(user, "practiceAttempts", (items) => {
      if (!active) return;
      setPracticeActivityDates(items.map((item) => typeof item.date === "string" ? item.date : "").filter(Boolean));
      setPublicPracticeRecords(items.map((item) => ({ ...item, answers: Array.isArray(item.answers) ? item.answers.map((answer) => answer ? "A" : null) : [] })));
    }, () => { attemptsReady = true; markReady(); });
    const stopTracker = watchTrackerSections(user, (sections) => {
      if (!active) return;
      setTrackerActivityDates(Array.isArray(sections.activity) ? sections.activity.map((entry: any) => typeof entry?.date === "string" ? entry.date : "").filter(Boolean) : []);
      setPublicTracker(sections);
    }, () => { trackerReady = true; markReady(); });
    const stopTests = watchTrackerTests(user, (tests) => {
      if (!active) return;
      setProfileMockTests(tests);
    }, () => { testsReady = true; markReady(); });
    return () => { active = false; stopAttempts?.(); stopTracker?.(); stopTests?.(); };
  }, [user?.uid]);
  useEffect(() => {
    if (!user || !profileSettings?.username || !tasksLoaded || !profileActivityReady || publicActivityOwner !== user.uid || publicTasksOwner !== user.uid || publicProfileOwner !== user.uid) return;
    const activity: Record<string, number> = {};
    const add = (value: unknown, count = 1) => {
      const date = typeof value === "string" ? value.slice(0, 10) : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      activity[date] = (activity[date] ?? 0) + Math.max(1, Math.round(count));
    };
    publicPracticeRecords.forEach((record) => add(record.date));
    (Array.isArray(publicTracker.activity) ? publicTracker.activity : []).forEach((entry: any) => add(entry.date, Math.abs(Number(entry.count) || 1)));
    (Array.isArray(publicTracker.tests?.log) ? publicTracker.tests.log : []).forEach((test: any) => add(test.date));
    tasks.filter((task) => task.completed).forEach((task) => add(task.completedAt ?? task.date));
    void savePublicProfileActivity(user, profileSettings as any, activity, {
      records: publicPracticeRecords,
      tracker: publicTracker,
      dailyTasks: tasks as any,
    }).catch(() => undefined);
  }, [profileSettings, publicPracticeRecords, publicTracker, tasks, user, tasksLoaded, profileActivityReady, publicActivityOwner, publicTasksOwner, publicProfileOwner]);
  const persist = (next: Task[]) => {
    const previous = tasks;
    setTasks(next);
    void AsyncStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(next));
    refreshDailyTasksWidget(next);
    if (user) void syncTaskChanges(user, previous, next);
    if (user && profileSettings?.username) void publishLeaderboardEntry(user, profileSettings, next).catch(() => undefined);
  };
  useEffect(() => {
    if (!tasksLoaded) return;
    // A task that crossed into yesterday now carries its overdue penalty even
    // if the user has not tapped a task yet. Refresh the widget and its cloud
    // leaderboard snapshot on both the midnight timer and app resume.
    refreshDailyTasksWidget(tasks);
    if (user && profileSettings?.username) {
      void publishLeaderboardEntry(user, profileSettings, tasks).catch(() => undefined);
    }
  }, [calendarDay, profileSettings?.username, tasksLoaded, user?.uid]);
  const today = calendarDay;
  const tomorrow = dateKeyFromOffset(1);
  const activeTaskDate = taskHistoryDate ?? (taskDay === "today" ? today : tomorrow);
  const isTaskHistory = activeTaskDate < today;
  const todayTasks = tasks.filter((task) => task.date === activeTaskDate);
  const todaySummary = summarizeTasks(todayTasks);
  const dueTasks = todayTasks.filter((task) => !task.completed);
  const visibleTasks = taskDueOnly ? dueTasks : todayTasks;
  const taskPoints = useMemo(() => weeklyTaskPointMap(tasks), [tasks, calendarDay]);
  const weeklyPoints = useMemo(() => [...taskPoints.values()].reduce((total, points) => total + points, 0) - weeklyInactivityPenalty(tasks), [taskPoints, tasks]);
  const tomorrowTaskCount = tasks.filter((task) => task.date === tomorrow).length;
  const thirty = tasksInLastDays(tasks, 30);
  const thirtySummary = summarizeTasks(thirty.flat());
  const streak = useMemo(() => {
    const completedTaskDays = tasks.filter((task) => task.completed).map((task) => task.completedAt ?? task.date);
    const activeDays = new Set([...practiceActivityDates, ...trackerActivityDates, ...completedTaskDays].map((value) => localDateKey(new Date(value))));
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!activeDays.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let days = 0;
    while (activeDays.has(localDateKey(cursor))) { days += 1; cursor.setDate(cursor.getDate() - 1); }
    return days;
  }, [practiceActivityDates, tasks, trackerActivityDates]);
  const xpSummary = useMemo(() => getXpSummary(tasks), [calendarDay, tasks]);
  useEffect(() => {
    // Like the web shell, never celebrate the first hydrated value. Only a
    // real, live increase after all three activity sources have loaded earns it.
    if (!authenticated || !tasksLoaded || !profileActivityReady) return;
    if (previousStreak.current === null) {
      previousStreak.current = streak;
      return;
    }
    if (streak <= previousStreak.current) {
      previousStreak.current = streak;
      return;
    }
    previousStreak.current = streak;
    setCelebratedStreak(streak);
  }, [authenticated, profileActivityReady, streak, tasksLoaded]);
  useEffect(() => {
    if (!authenticated || !tasksLoaded) return;
    if (previousXpLevel.current === null) { previousXpLevel.current = xpSummary.level; return; }
    if (xpSummary.level > previousXpLevel.current) setCelebratedLevel(xpSummary.level);
    previousXpLevel.current = xpSummary.level;
  }, [authenticated, tasksLoaded, xpSummary.level]);
  useEffect(() => {
    previousStreak.current = null;
    previousXpLevel.current = null;
    setCelebratedStreak(null);
    setCelebratedLevel(null);
  }, [user?.uid]);
  const highest = useMemo(
    () =>
      tasksInLastDays(tasks, 365)
        .map((day, index) => ({
          minutes: summarizeTasks(day).minutes,
          date: dateKey(new Date(Date.now() - (364 - index) * 86_400_000)),
        }))
        .sort((a, b) => b.minutes - a.minutes)[0],
    [tasks],
  );
  const bestCompletion = useMemo(
    () =>
      tasksInLastDays(tasks, 365)
        .map((day, index) => ({
          percent: summarizeTasks(day).percent,
          total: day.length,
          date: dateKey(new Date(Date.now() - (364 - index) * 86_400_000)),
        }))
        .filter((day) => day.total > 0)
        .sort((a, b) => b.percent - a.percent)[0],
    [tasks],
  );

  const openNew = () => {
    setName("");
    setSubject(subjectOptions[0] ?? "Other");
    setCustomSubject("");
    setAddSubjectDialog(false);
    setType("Practice Session");
    setSchedule(isTaskHistory ? "today" : taskDay);
    setEditor("new");
  };
  const openEdit = (task: Task) => {
    setName(task.name);
    setSubject(subjectOptions.includes(task.subject) ? task.subject : (subjectOptions[0] ?? "Other"));
    setCustomSubject("");
    setAddSubjectDialog(false);
    setType(task.type);
    setEditor(task);
  };
  const saveTask = async () => {
    if (!name.trim() || taskActionLoading) return;
    setTaskActionLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    const draft = {
      name: name.trim(),
      subject: customSubject.trim() || subject.trim() || "Other",
      type,
      date:
        editor === "new"
          ? dateKeyFromOffset(schedule === "tomorrow" ? 1 : 0)
          : (editor?.date ?? today),
    };
    if (editor === "new")
      persist([
        {
          id: createTaskId(),
          ...draft,
          createdAt: new Date().toISOString(),
          completed: false,
          completedAt: null,
          minutesSpent: null,
        },
        ...tasks,
      ]);
    else if (editor)
      persist(tasks.map((task) => (task.id === editor.id ? { ...task, ...draft } : task)));
    setEditor(null); setTaskActionLoading(false);
  };
  const markDone = async () => {
    if (!completion || taskActionLoading) return;
    const source = currentTasks.current.find(task => task.id === completion.id);
    if (!source || !canChangeTaskCompletion(source)) { setCompletion(null); return; }
    // Android can pass the finishing modal's touch to the row now occupying
    // that screen position after the completed task reorders. Briefly ignore
    // row actions while the completion dialog disappears.
    taskRowInteractionBlockedUntil.current = Date.now() + 800;
    setTaskActionLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    const latest = currentTasks.current.find(task => task.id === completion.id);
    if (!latest || !canChangeTaskCompletion(latest)) { setCompletion(null); setTaskActionLoading(false); return; }
    persist(
      currentTasks.current.map((task) =>
        task.id === completion.id
          ? {
              ...task,
              completed: true,
              completedAt: new Date().toISOString(),
              minutesSpent: Math.min(180, Math.max(0, Number(spent) || 0)),
            }
          : task,
      ),
    );
    setCompletion(null); setTaskActionLoading(false);
  };
  const reopen = (id: string) => {
    const source = currentTasks.current.find(task => task.id === id);
    if (!source || !canChangeTaskCompletion(source)) return;
    // Unmarking updates the row and can otherwise send a
    // delayed Android touch to its first visible row.
    taskRowInteractionBlockedUntil.current = Date.now() + 800;
    persist(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: false, completedAt: null, minutesSpent: null }
          : task,
      ),
    );
  };
  const remove = (id: string) => setDeletingTask(tasks.find((task) => task.id === id && task.date === dateKeyFromOffset(1)) ?? null);
  const canUseTaskRow = () => Date.now() >= taskRowInteractionBlockedUntil.current;
  const addPastTask = (task: Task, offset: 0 | 1) => {
    const source = tasks.find(item => item.id === task.id);
    if (!source || source.date >= dateKey()) {
      return;
    }
    persist([{
      ...source,
      id: createTaskId(),
      date: dateKeyFromOffset(offset),
      createdAt: new Date().toISOString(),
      completed: false,
      completedAt: null,
      minutesSpent: null,
    }, ...tasks]);
    taskRowInteractionBlockedUntil.current = Date.now() + 800;
    setTaskHistoryDate(null);
    setTaskDay(offset ? "tomorrow" : "today");
  };
  const confirmDelete = async () => {
    if (!deletingTask) return;
    if (deletingTask.date !== dateKeyFromOffset(1)) { setDeletingTask(null); return; }
    setTaskActionLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    if (deletingTask.date !== dateKeyFromOffset(1)) { setDeletingTask(null); setTaskActionLoading(false); return; }
    persist(tasks.filter((task) => task.id !== deletingTask.id));
    setDeletingTask(null); setTaskActionLoading(false);
  };

  if (showSplash || !authReady || !uiSettingsReady) {
    return (
      <SafeAreaProvider
        onLayout={() => {
          if (nativeSplashHidden.current) return;
          nativeSplashHidden.current = true;
          void ExpoSplashScreen.hideAsync().catch(() => undefined);
        }}
      >
        <StatusBar hidden style="light" />
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  if (!authenticated) {
    if (!nativeSplashHidden.current) {
      nativeSplashHidden.current = true;
      void ExpoSplashScreen.hideAsync().catch(() => undefined);
    }
    return (
      <SafeAreaProvider>
        <StatusBar hidden style="light" />
        <View style={{ flex: 1, backgroundColor: colors.background }}><AccentBackdrop /><SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top", "left", "right"]}><AuthScreen onAuthenticated={() => undefined} /></SafeAreaView></View>
      </SafeAreaProvider>
    );
  }

  if (!nativeSplashHidden.current) {
    nativeSplashHidden.current = true;
    void ExpoSplashScreen.hideAsync().catch(() => undefined);
  }

  const selectDailyDate = (day: string) => { if (day === tomorrow) setTaskDay("tomorrow"); else if (day === today) setTaskDay("today"); else setTaskHistoryDate(day); };
  const dailyRankAction = widgetRank !== null && <Pressable accessibilityRole="button" accessibilityLabel="Open weekly leaderboard" onPress={() => setLeaderboardOpen(true)} style={styles.taskRank}>{widgetRank <= 3 ? <Image source={rankMedals[widgetRank - 1]} style={styles.taskRankMedal} /> : <MaterialCommunityIcons name="trophy" size={15} color="#fcd34d" />}<RollingMetric value={widgetRank} prefix="#" color="#e4e4e7" fontSize={12} /></Pressable>;
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}><AccentBackdrop />
      <SafeAreaView style={[styles.safe, { backgroundColor: "transparent" }]} edges={["top", "left", "right"]} onTouchStart={() => resetBottomNavigation()}>
      <StatusBar hidden style="light" />
      {leaderboardOpen ? <LeaderboardScreen user={user} tasks={tasks} onClose={() => setLeaderboardOpen(false)} /> : quickRecallOpen ? <QuickRecallScreen user={user} onClose={() => setQuickRecallOpen(false)} onGoProfile={() => { setQuickRecallOpen(false); setAppTab("profile"); }} /> : appTab === "profile" ? (
        <ProfileScreen
          user={user}
          tasks={tasks}
          profileSettings={profileSettings}
          onProfileSaved={saveSharedProfile}
          onOpenVideo={() => setMediaMode("video")}
          onOpenMusic={() => { setMediaMode("music"); setMusicOpenRequest((value) => value + 1); }}
          onOpenTracker={(tab) => {
            setTrackTab(tab);
            setAppTab("track");
          }}
            onOpenLeaderboard={() => setLeaderboardOpen(true)}
          streak={streak}
          sharedPracticeRecords={publicPracticeRecords}
          sharedTracker={publicTracker}
          sharedMockTests={profileMockTests}
          sharedActivityReady={profileActivityReady}
          sharedRank={widgetRank}
          onLogout={() => {
            void logout();
          }}
        />
      ) : appTab === "track" ? (
        <TrackScreen initialTab={trackTab} user={user} examName={profileSettings?.examName} onOpenAnalysis={() => { setTrackTab("Mock Test"); setAppTab("progress"); }} />
      ) : appTab === "practice" ? (
        <PracticeScreen user={user} onOpenQuickRecall={() => setQuickRecallOpen(true)} />
      ) : appTab === "habits" ? (
        <HabitsScreen user={user} widgetRequest={habitWidgetRequest} onWidgetRequestHandled={() => setHabitWidgetRequest(null)} onSwitchToTasks={() => setAppTab("tasks")}
          selectedDate={activeTaskDate} onSelectDate={selectDailyDate} dateTasks={tasks}
          visibleWeekEnd={dailyWeekEnd} onWeekEndChange={setDailyWeekEnd} rankAction={dailyRankAction}
          dueOnly={taskDueOnly} onFilterChange={setTaskDueOnly} />
      ) : appTab === "timers" ? (
        <TimersScreen user={user} widgetRequest={timerWidgetRequest} />
      ) : appTab === "progress" ? (
        <ProgressScreen user={user} onBack={() => { setTrackTab("Mock Test"); setAppTab("track"); }} />
      ) : appTab === "tasks" ? (
        <>
      <View style={styles.tasksSticky}>
            <View>
            <DailySectionHeader section="tasks" today={today} selected={activeTaskDate} tasks={tasks}
              weekEnd={dailyWeekEnd} onWeekEndChange={setDailyWeekEnd} onSelect={selectDailyDate}
              onSwitch={profileSettings?.habitsEnabled !== false ? () => setAppTab("habits") : undefined}
              onAdd={openNew} rankAction={dailyRankAction} />
            </View>
            <TaskOverview total={todaySummary.total} due={dueTasks.length} percent={todaySummary.percent}
              dueOnly={taskDueOnly} onFilterChange={setTaskDueOnly}
              studyTime={<RollingDuration minutes={todaySummary.minutes} fontSize={12} />} />
            <DailyFocusReward uid={user?.uid} date={activeTaskDate} />
            </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, styles.tasksContent]}>
            <View style={styles.tasksList}>
            {visibleTasks.length === 0 ? (
                taskDueOnly && todayTasks.length > 0 ? <View style={{padding:22}}><Text style={styles.muted}>All tasks complete for this day.</Text></View> : isTaskHistory ? <View style={{padding:22}}><Text style={styles.muted}>No tasks recorded for this day.</Text></View> : <Empty onPress={openNew} />
            ) : (
              visibleTasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  compact={isTaskHistory}
                  onReschedule={isTaskHistory ? offset => { if (canUseTaskRow()) addPastTask(task, offset); } : undefined}
                  yellow
                  last={index === visibleTasks.length - 1}
                  points={taskPoints.get(task.id) ?? 0}
                  onDone={() => {
                    if (!canUseTaskRow() || !canChangeTaskCompletion(task)) return;
                    setSpent(String(task.minutesSpent ?? 30));
                    setCompletion(task);
                  }}
                  onReopen={() => { if (canUseTaskRow()) reopen(task.id); }}
                  onEdit={() => { if (canUseTaskRow()) openEdit(task); }}
                  onDelete={() => { if (canUseTaskRow()) remove(task.id); }}
                />
              ))
            )}
            </View>
      </ScrollView>
      {user && <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 }}><StudyLock uid={user.uid} taskButton openRequest={focusSetupRequest} onRequestOpened={() => setFocusSetupRequest(0)} /></View>}
      <Modal transparent visible={editor !== null} animationType="fade" onRequestClose={() => { if (!taskActionLoading) { setSubjectMenuOpen(false); setTypeMenuOpen(false); setEditor(null); } }}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable accessibilityLabel="Close task dialog" style={StyleSheet.absoluteFill} onPress={() => { if (!taskActionLoading) { setSubjectMenuOpen(false); setEditor(null); } }} />
          <View accessibilityViewIsModal style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.taskDialogContent}>
            <Text style={styles.sheetTitle}>{editor === "new" ? "Add Task" : "Edit Task"}</Text>
            <Field
              label="Task name"
              value={name}
              placeholder="Lecture 5 of Polity"
              onChangeText={setName}
            />
            <View style={styles.selectWrap}>
              <Text style={styles.fieldLabel}>SUBJECT</Text>
              <TaskDropdown label={subject} open={subjectMenuOpen} popup onToggle={() => { setTypeMenuOpen(false); setSubjectMenuOpen((open) => !open); }} options={[...subjectOptions, "__custom__"].map((value) => ({ value, label: value === "__custom__" ? "+ Add subject" : value }))} onSelect={(value) => { if (value === "__custom__") { setCustomSubject(""); setAddSubjectDialog(true); } else { setSubject(value); } setSubjectMenuOpen(false); }} />
            </View>
            <View style={styles.selectWrap}>
              <Text style={styles.fieldLabel}>TYPE</Text>
              <TaskDropdown popup label={type} open={typeMenuOpen} onToggle={() => { setSubjectMenuOpen(false); setTypeMenuOpen(value => !value); }} options={["Practice Session", "Lecture", ...TASK_TYPES.filter(value => value !== "Practice Session" && value !== "Lecture")].map(value => ({ value, label: value }))} onSelect={value => { setType(value as TaskType); setTypeMenuOpen(false); }} />
            </View>
            {editor === "new" && (
              <View>
                <Text style={styles.fieldLabel}>SCHEDULE FOR</Text>
                <AnimatedTimeChips options={[0, 1]} labels={["Today", "Tomorrow"]} value={schedule === "today" ? 0 : 1} onChange={value => setSchedule(value === 0 ? "today" : "tomorrow")} disabled={taskActionLoading} color={colors.button} ink={colors.buttonInk} muted="#a1a1aa" background="#151515" borderColor="#3f3f46" radius={12} height={40} textStyle={styles.scheduleText} />
              </View>
            )}
            <View style={styles.sheetActions}>
              <Pressable disabled={taskActionLoading} onPress={() => setEditor(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable disabled={taskActionLoading || !name.trim()} onPress={() => void saveTask()} style={[styles.primary, (taskActionLoading || !name.trim()) && styles.actionDisabled]}>
                {taskActionLoading ? <View style={{flexDirection: "row", alignItems: "center", gap: 8}}><ActivityIndicator size="small" color={colors.buttonInk} /><Text style={styles.primaryText}>Saving…</Text></View> : <Text style={styles.primaryText}>Save task</Text>}
              </Pressable>
            </View>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal transparent visible={addSubjectDialog} animationType="fade" onRequestClose={() => setAddSubjectDialog(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddSubjectDialog(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Add subject</Text>
            <Text style={styles.muted}>Create a subject just for your tasks.</Text>
            <Field label="SUBJECT NAME" value={customSubject} placeholder="e.g. Polity" onChangeText={setCustomSubject} />
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setAddSubjectDialog(false)}><Text style={styles.cancel}>Cancel</Text></Pressable>
              <Pressable disabled={!customSubject.trim()} onPress={() => { setSubject(customSubject.trim()); setAddSubjectDialog(false); }} style={[styles.primary, !customSubject.trim() && styles.actionDisabled]}><Text style={styles.primaryText}>Add subject</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal transparent visible={completion !== null} animationType="fade" onRequestClose={() => { if (!taskActionLoading) setCompletion(null); }}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}>
          <Pressable accessibilityLabel="Close completion dialog" style={StyleSheet.absoluteFill} onPress={() => { if (!taskActionLoading) setCompletion(null); }} />
          <View accessibilityViewIsModal style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.taskDialogContent}>
            <Text style={styles.sheetTitle}>Complete Task</Text>
            <Text style={styles.muted}>{completion?.name}</Text>
            <Field
              label="Actual study minutes"
              value={spent}
              onChangeText={(value) => {
                const digits = value.replace(/[^0-9]/g, "");
                setSpent(digits === "" ? "" : String(Math.min(180, Number(digits))));
              }}
              keyboardType="numeric"
            />
            <AnimatedTimeChips options={[30, 45, 60, 90, 120]} labels={[30, 45, 60, 90, 120].map(formatMinutes)} value={Number(spent)} onChange={minutes => setSpent(String(minutes))} disabled={taskActionLoading} color={colors.button} ink={colors.buttonInk} muted="#a1a1aa" background="#151515" borderColor="#303030" radius={10} gap={7} height={34} textStyle={styles.timeChipText} style={styles.timeChips} />
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setCompletion(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable disabled={taskActionLoading} onPress={() => void markDone()} style={[styles.primary, taskActionLoading && styles.actionDisabled]}>
                {taskActionLoading ? <ActivityIndicator size="small" color={colors.buttonInk} /> : <Text style={styles.primaryText}>Mark complete</Text>}
              </Pressable>
            </View>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DestructiveDialog visible={deletingTask !== null} title="Are you sure you want to delete this task?" busy={taskActionLoading} confirmLabel="Yes, delete" onCancel={() => setDeletingTask(null)} onConfirm={confirmDelete} />
        </>
      ) : (
        <ComingSoonScreen title={activeAppTab.label} />
      )}
      {!quickRecallOpen && <BottomNavigation activeTab={appTab === "progress" ? "track" : appTab === "habits" ? "tasks" : appTab} onChange={(tab) => { setLeaderboardOpen(false); setAppTab(tab === "tasks" && profileSettings?.habitsEnabled !== false ? taskSection.current : tab); }} practiceSessionEnabled={profileSettings?.practiceSessionEnabled !== false} trackProgressEnabled={profileSettings?.trackProgressEnabled !== false} timersEnabled={profileSettings?.timersEnabled !== false} habitsEnabled={profileSettings?.habitsEnabled !== false} profileAvatar={profileSettings?.avatar ? avatarAssets[profileSettings.avatar] : undefined} />}
      <MediaOverlay user={user} mode={mediaMode} musicOpenRequest={musicOpenRequest} onClose={() => setMediaMode(null)} />
      <DeviceFocusSync user={user} />
      <FocusWidgetSync user={user} />
      {celebratedStreak !== null && <StreakCelebration streak={celebratedStreak} onClose={() => setCelebratedStreak(null)} />}
      {celebratedLevel !== null && <LevelCelebration level={celebratedLevel} onClose={() => setCelebratedLevel(null)} />}
      {user && <WeeklyAwardCelebration uid={user.uid} enabled={(!showLaunchMotivation || profileSettings?.randomQuotesEnabled === false) && !dailyManifestation && celebratedStreak === null && celebratedLevel === null} />}
      {showLaunchMotivation && profileSettings?.randomQuotesEnabled !== false && !dailyManifestation && celebratedStreak === null && celebratedLevel === null && <LaunchMotivation source={launchImage} onClose={() => setShowLaunchMotivation(false)} />}
      <DailyManifestationDialog
        phrase={dailyManifestation}
        entry={manifestationEntry}
        repeats={manifestationRepeats}
        error={manifestationError}
        onChange={(value) => { setManifestationEntry(value.toUpperCase()); setManifestationError(""); }}
        onContinue={() => {
          if (manifestationEntry.trim().replace(/\s+/g, " ").toLowerCase() !== dailyManifestation.trim().replace(/\s+/g, " ").toLowerCase()) { setManifestationError("Type the sentence exactly to continue."); return; }
          if (manifestationRepeats === 2) {
            void AsyncStorage.setItem(manifestationCompletionKey(user?.uid), `${manifestationDayKey()}|${dailyManifestation}`);
            setDailyManifestation("");
            setManifestationEntry("");
            setManifestationRepeats(0);
            return;
          }
          setManifestationRepeats((value) => value + 1);
          setManifestationEntry("");
        }}
      />
      </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

function SplashScreen() {
  return <ImageBackground source={require("./assets/auth.jpg")} style={styles.splash} imageStyle={styles.splashImage}><View style={styles.splashOverlay}><Image source={require("./assets/auth.jpg")} style={styles.splashMark} /><Text style={styles.splashTitle}>SSC Buddy</Text><Text style={styles.splashCopy}>Focused preparation workspace</Text></View></ImageBackground>;
}

function DailyManifestationDialog({ phrase, entry, repeats, error, onChange, onContinue }: { phrase: string; entry: string; repeats: number; error: string; onChange: (value: string) => void; onContinue: () => void }) {
  return <Modal transparent visible={Boolean(phrase)} animationType="fade"><View style={styles.manifestationBackdrop}><View style={styles.manifestationDialog}><View style={styles.manifestationHeading}><Text style={styles.manifestationTitle}>Daily manifestation</Text><Text accessibilityLiveRegion="polite" accessibilityLabel={`Repetition ${repeats + 1} of 3`} style={styles.manifestationCounter}>{repeats + 1}/3</Text></View><View style={styles.manifestationPhrase}><Text style={styles.manifestationPhraseText}>“{phrase}”</Text></View><TextInput autoFocus value={entry} onChangeText={onChange} autoCapitalize="characters" placeholder="Type here" placeholderTextColor="#71717a" style={styles.manifestationInput} onSubmitEditing={onContinue} /><Text style={styles.manifestationError}>{error || " "}</Text><Pressable style={styles.manifestationButton} onPress={onContinue}><Text style={styles.manifestationButtonText}>{repeats === 2 ? "Done" : "Continue"}</Text></Pressable></View></View></Modal>;
}

function Field(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{props.label.toUpperCase()}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType}
        placeholder={props.placeholder}
        placeholderTextColor="#71717a"
      />
    </View>
  );
}
function TaskDropdown({ label, open, onToggle, options, onSelect, compact = false, popup = false }: { label: string; open: boolean; onToggle: () => void; options: Array<{ value: string; label: string }>; onSelect: (value: string) => void; compact?: boolean; popup?: boolean }) {
  const visibility = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [renderMenu, setRenderMenu] = useState(open);
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (!open || !popup) { setAnchor(null); return; }
    let active = true;
    trigger.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      if (!active) return;
      const menuHeight = Math.min(224, Math.max(48, height - 48));
      const below = y + measuredHeight + 5;
      const top = below + menuHeight <= height - 16 ? below : Math.max(16, y - menuHeight - 5);
      setAnchor({ top, left: Math.max(12, Math.min(width - measuredWidth - 12, x)), width: Math.min(measuredWidth, width - 24), maxHeight: menuHeight });
    });
    return () => { active = false; };
  }, [open, popup, width, height]);
  useEffect(() => {
    visibility.stopAnimation();
    if (open) {
      setRenderMenu(true);
      Animated.timing(visibility, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    if (!renderMenu) return;
    Animated.timing(visibility, { toValue: 0, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setRenderMenu(false);
    });
  }, [open, renderMenu, visibility]);
  const choices = <NativeScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: anchor?.maxHeight ?? 224 }}>{options.map(option => {
    const selected = option.value === label || option.label === label;
    return <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={option.value} style={[styles.dropdownOption, selected && styles.dropdownOptionSelected]} onPress={() => onSelect(option.value)}><Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextSelected]}>{option.label}</Text>{selected && <MaterialCommunityIcons name="check" size={16} color="#171717" />}</Pressable>;
  })}</NativeScrollView>;
  return <View ref={trigger} collapsable={false} style={[styles.dropdownWrap, compact && styles.dropdownWrapCompact, open && styles.dropdownWrapOpen]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} style={[styles.dropdownTrigger, open && styles.dropdownTriggerOpen]} onPress={() => { if (popup && !open) Keyboard.dismiss(); onToggle(); }}><Text numberOfLines={1} style={styles.dropdownValue}>{label}</Text><View style={styles.dropdownChevronButton}><DropdownChevron open={open} size={18} color="#a1a1aa" /></View></Pressable>
    {popup ? <Modal transparent visible={open && anchor !== null} animationType="fade" onRequestClose={onToggle}>
      <View style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close dropdown" onPress={onToggle} style={StyleSheet.absoluteFill} />
        {anchor && <View accessibilityViewIsModal style={[styles.dropdownMenu, { top: anchor.top, left: anchor.left, right: undefined, width: anchor.width, maxHeight: anchor.maxHeight }]}>{choices}</View>}
      </View>
    </Modal> : renderMenu && <Animated.View pointerEvents={open ? "auto" : "none"} style={[styles.dropdownMenu, { opacity: visibility, transform: [{ translateY: visibility.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }, { scale: visibility.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>{choices}</Animated.View>}
  </View>;
}

function Empty({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.muted}>Nothing planned for today.</Text>
      <Pressable onPress={onPress}>
        <Text style={styles.link}>Add your first task</Text>
      </Pressable>
    </View>
  );
}
function Metric({ label, value, note }: { label: string; value: ReactNode; note: ReactNode }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <View style={styles.metricValue}>{value}</View>
      {typeof note === "string" ? <Text style={styles.muted}>{note}</Text> : note}
    </View>
  );
}
function Breakdown({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<[string, { count: number; minutes: number }]>;
  tone: "mint" | "blue";
}) {
  const leadingMinutes = Math.max(1, items[0]?.[1].minutes ?? 1);
  return (
    <View style={styles.breakdown}>
      <Text style={styles.breakdownTitle}>{title}</Text>
      {items.length ? items.map(([name, data]) => (
        <View key={name} style={styles.breakdownRow}>
          <View style={styles.breakdownLabel}><Text style={styles.breakdownName}>{name}</Text><View style={styles.analyticsNumbers}><RollingMetric value={data.count} suffix=" tasks · " color="#a1a1aa" fontSize={12} /><RollingDuration minutes={data.minutes} color="#a1a1aa" fontSize={12} /></View></View>
          <LiquidProgressBar progress={data.minutes > 0 ? Math.max(0.04, data.minutes / leadingMinutes) : 0} color={tone === "blue" ? colors.accent : "#5eead4"} height={7} style={styles.breakdownTrack} label={`${title}: ${name}`} />
        </View>
      )) : <Text style={styles.emptyAnalytics}>Complete tasks to see analytics.</Text>}
    </View>
  );
}
const styles = createThemedStyles({
  safe: { flex: 1, backgroundColor: colors.background },
  authLoading: { flex: 1, backgroundColor: "#000000" },
  splash: { flex: 1, backgroundColor: "#000000" },
  splashImage: { opacity: 0.18 },
  splashOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,10,10,.78)" },
  splashMark: { width: 76, height: 76, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,.15)" },
  splashTitle: { color: "#fafafa", fontSize: 30, fontWeight: "800", marginTop: 14, letterSpacing: -0.6 },
  splashCopy: { color: "#a1a1aa", fontSize: 12, marginTop: 6 },
  streakCelebrationBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,.78)" },
  streakCelebrationDialog: { width: "100%", maxWidth: 340, alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,.10)", backgroundColor: "#171717", paddingHorizontal: 24, paddingTop: 27, paddingBottom: 22, shadowColor: "#000", shadowOpacity: .45, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 18 },
  streakCelebrationClose: { position: "absolute", top: 10, right: 10, width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  streakCelebrationIcon: { width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: "rgba(252,211,77,.18)", backgroundColor: "rgba(251,191,36,.10)" },
  streakCelebrationFirework: { width: 47, height: 47, tintColor: "#fcd34d" },
  streakCelebrationEyebrow: { marginTop: 16, color: "#a1a1aa", fontSize: 10, fontWeight: "700", letterSpacing: 1.8 },
  streakCelebrationTitle: { marginTop: 6, color: "#fafafa", fontSize: 24, fontWeight: "700", letterSpacing: -.3 },
  streakCelebrationCopy: { marginTop: 7, color: "#a1a1aa", fontSize: 14 },
  streakCelebrationButton: { width: "100%", marginTop: 21, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#f4f4f5", paddingVertical: 11 },
  streakCelebrationButtonText: { color: "#18181b", fontSize: 14, fontWeight: "700" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  taskRank: { height: 38, minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 12, paddingHorizontal: 8, backgroundColor: "#1b1b1b", borderWidth: 1, borderColor: "#343434" },
  taskRankMedal: { width: 17, height: 17, resizeMode: "contain" },
  taskRankText: { color: "#e4e4e7", fontSize: 12, fontWeight: "800" },
  streakPill: { minWidth: 42, height: 40, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 20, backgroundColor: "#262626", borderWidth: 1, borderColor: "#333333" },
  streakPillActive: { backgroundColor: "rgba(251, 191, 36, .14)", borderColor: "rgba(251, 191, 36, .22)" },
  streakText: { color: "#d4d4d8", fontSize: 13, fontWeight: "800" },
  streakTextActive: { color: "#fef3c7" },
  eyebrow: { color: "#818cf8", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  title: { color: "#fafafa", fontSize: 25, fontWeight: "700", marginTop: 3 },
  headerCopy: { color: "#a1a1aa", fontSize: 12, marginTop: 3 },
  add: { backgroundColor: colors.button, borderRadius: 10, width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  addText: { color: colors.buttonInk, fontWeight: "600" },
  actionDisabled: { opacity: 0.68 },
  tabs: {
    position: "relative",
    flexDirection: "row",
    marginHorizontal: 20,
    padding: 4,
    borderRadius: 13,
    backgroundColor: "#1c1c1c",
  },
  tabIndicator: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: 10, backgroundColor: "#303030" },
  tab: { zIndex: 1, flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  tabText: { color: "#71717a", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fafafa" },
  content: { position: "relative", padding: 20, gap: 12, paddingBottom: 60 },
  tasksContent: { paddingTop: 12 },
  tasksSticky: { backgroundColor: "transparent", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  tasksList: { backgroundColor: "#141414", borderWidth: 1, borderColor: "#292929", borderRadius: 14, overflow: "hidden" },
  heroHeadingActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  livePoints: { flexDirection: "row", alignItems: "center", gap: 3 },
  pointsSpark: { width: 16, height: 16 },
  livePointsText: { minWidth: 38 },
  hero: {
    borderRadius: 17,
    padding: 12,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  heroHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  date: { color: "#fafafa", fontSize: 16, fontWeight: "700" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 10, marginBottom: 0 },
  ring: {
    height: 112,
    width: 112,
    borderRadius: 56,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ringSvg: { position: "absolute", top: 0, left: 0 },
  ringText: { color: "#fafafa", fontSize: 25, fontWeight: "800" },
  statColumn: { gap: 1 },
  statLabel: { color: "#a1a1aa", fontSize: 10, letterSpacing: 1.4 },
  statMetric: { height: 24, flexDirection: "row", alignItems: "center", marginBottom: 2 },
  statSlash: { color: "#fafafa", fontSize: 23, fontWeight: "700", marginHorizontal: 6 },
  muted: { color: "#a1a1aa", fontSize: 13, marginTop: 9 },
  sectionTitle: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.7,
    marginTop: 12,
    marginBottom: 2,
  },
  task: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 17,
    padding: 14,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  taskDone: { backgroundColor: "#162c45", borderColor: "#285f94" },
  compact: { marginTop: 9, minHeight: 58 },
  check: {
    width: 29,
    height: 29,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#71717a",
    alignItems: "center",
    justifyContent: "center",
  },
  checkDone: { borderColor: dailyTaskColors.accent, backgroundColor: dailyTaskColors.accent },
  checkText: { color: dailyTaskColors.ink, fontWeight: "900" },
  taskMain: { flex: 1 },
  taskName: { color: "#fafafa", fontSize: 15, fontWeight: "700" },
  taskMeta: { color: "#a1a1aa", fontSize: 12, marginTop: 4 },
  strike: { textDecorationLine: "line-through", color: "#a1a1aa" },
  delete: { fontSize: 27, color: "#a1a1aa", paddingHorizontal: 4 },
  empty: {
    alignItems: "center",
    borderRadius: 17,
    padding: 30,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  link: { color: dailyTaskColors.accent, fontWeight: "700", marginTop: 10 },
  metric: {
    width: "48.8%",
    minHeight: 92,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  metricValue: { marginTop: 5 },
  analyticsNumbers: { flexDirection: "row", alignItems: "center" },
  analyticsSlash: { color: "#fafafa", fontSize: 20, fontWeight: "800" },
  analyticsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rangeControl: { flexDirection: "row", gap: 3, padding: 3, borderRadius: 11, backgroundColor: "#1c1c1c" },
  analyticsFilters: { flexDirection: "row", gap: 8, zIndex: 900, elevation: 900 },
  rangeButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  rangeButtonActive: { backgroundColor: "#303030" },
  rangeText: { color: "#71717a", fontSize: 11, fontWeight: "700" },
  rangeTextActive: { color: dailyTaskColors.accent },
  dayToggle: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 11, borderWidth: 1, borderColor: "#414141", paddingLeft: 10, paddingRight: 7, paddingVertical: 7, backgroundColor: "#242424" },
  dayToggleText: { color: "#e4e4e7", fontSize: 12, fontWeight: "700" },
  subjectFilters: { gap: 7, paddingVertical: 2 },
  subjectFilter: { borderRadius: 11, borderWidth: 1, borderColor: "#3d3d3d", paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#1b1b1b" },
  subjectFilterActive: { borderColor: dailyTaskColors.accent, backgroundColor: "#16345c" },
  subjectFilterText: { color: "#a1a1aa", fontSize: 11, fontWeight: "700" },
  subjectFilterTextActive: { color: "#dbeafe" },
  dropdownWrap: { position: "relative", zIndex: 900, elevation: 900, flex: 1, alignSelf: "stretch" },
  dropdownWrapOpen: { zIndex: 1200, elevation: 1200 },
  dropdownDismiss: { position: "absolute", zIndex: 700, elevation: 700, top: 0, right: 0, bottom: 0, left: 0 },
  dropdownWrapCompact: { minWidth: 142, alignSelf: "auto" },
  dropdownTrigger: { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: 13, borderWidth: 1, borderColor: "#4b5563", paddingHorizontal: 13, backgroundColor: "#1b1b1b" },
  dropdownTriggerOpen: { borderColor: "#4b5563", backgroundColor: "#1b1b1b" },
  dropdownValue: { flex: 1, color: "#f4f4f5", fontSize: 13, fontWeight: "700" },
  dropdownChevronButton: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#303030" },
  dropdownMenu: { position: "absolute", zIndex: 999, elevation: 999, top: 51, left: 0, right: 0, maxHeight: 224, overflow: "hidden", borderRadius: 13, borderWidth: 1, borderColor: "#505050", backgroundColor: "#282828", shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } },
  dropdownOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderColor: "#363636" },
  dropdownOptionSelected: { backgroundColor: "#f4f4f5" },
  dropdownOptionText: { color: "#e4e4e7", fontSize: 12, fontWeight: "600" },
  dropdownOptionTextSelected: { color: "#171717", fontWeight: "700" },
  metricGrid: { flexDirection: "row", gap: 6 },
  breakdown: { borderRadius: 17, padding: 16, backgroundColor: "#1b1b1b", borderWidth: 1, borderColor: "#303030" },
  breakdownTitle: { color: "#fafafa", fontSize: 15, fontWeight: "700" },
  breakdownRow: { marginTop: 16 },
  breakdownLabel: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  breakdownName: { flex: 1, color: "#e4e4e7", fontSize: 13, fontWeight: "600" },
  breakdownMeta: { color: "#a1a1aa", fontSize: 12 },
  breakdownTrack: { height: 7, overflow: "hidden", marginTop: 8, borderRadius: 5, backgroundColor: "#303030" },
  emptyAnalytics: { color: "#71717a", marginTop: 12, fontSize: 13 },
  chart: {
    height: 150,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderRadius: 17,
    padding: 16,
    backgroundColor: "#1b1b1b",
  },
  chartItem: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
  chartBar: { width: 16, maxHeight: 95, borderRadius: 6, backgroundColor: dailyTaskColors.accent },
  chartLabel: { color: "#71717a", fontSize: 10 },
  history: {
    borderRadius: 17,
    padding: 14,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  historyDate: { color: "#fafafa", fontWeight: "700" },
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inactiveHistoryPoints: { color: "#fca5a5", fontSize: 12, fontWeight: "800" },
  historyTaskList: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#303030" },
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 22, backgroundColor: "rgba(0,0,0,.72)" },
  sheet: {
    backgroundColor: "#202020",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#383838",
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    padding: 22,
    gap: 14,
  },
  taskDialogContent: { gap: 14 },
  sheetTitle: { color: "#fafafa", fontSize: 21, fontWeight: "800" },
  timeChips: { flexDirection: "row", gap: 7, marginTop: -5 },
  timeChip: { borderRadius: 10, borderWidth: 1, borderColor: "#303030", paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#151515" },
  timeChipActive: { borderColor: colors.button, backgroundColor: colors.button },
  timeChipText: { color: "#a1a1aa", fontSize: 11, fontWeight: "800" },
  timeChipTextActive: { color: colors.buttonInk },
  fieldLabel: {
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
    marginBottom: 7,
  },
  input: {
    height: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#3f3f46",
    color: "#fafafa",
    backgroundColor: "#151515",
    paddingHorizontal: 14,
  },
  selectWrap: { zIndex: 10 },
  selectControl: {
    height: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#151515",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectValue: { color: "#fafafa", fontSize: 14 },
  selectChevron: { color: "#a1a1aa", fontSize: 20, marginTop: -5 },
  subjectDropdown: {
    position: "absolute",
    top: 66,
    left: 0,
    right: 0,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#191919",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
  },
  scheduleRow: { flexDirection: "row", gap: 8 },
  scheduleChip: {
    minWidth: 88,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#151515",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  scheduleChipActive: { borderColor: colors.button, backgroundColor: colors.button },
  scheduleText: { color: "#a1a1aa", fontSize: 13, fontWeight: "600" },
  scheduleTextActive: { color: colors.buttonInk },
  subjectOption: { paddingHorizontal: 14, paddingVertical: 12 },
  subjectOptionActive: { backgroundColor: "#162c45" },
  subjectOptionText: { color: "#d4d4d8", fontSize: 15 },
  subjectOptionTextActive: { color: "#dbeafe", fontWeight: "700" },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 22,
    marginTop: 8,
  },
  cancel: { color: "#d4d4d8", fontWeight: "700" },
  primary: {
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.button,
  },
  primaryText: { color: colors.buttonInk, fontWeight: "600" },
  deleteBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 26, backgroundColor: "rgba(0,0,0,.76)" },
  deleteDialog: { width: "100%", maxWidth: 370, borderRadius: 22, padding: 21, backgroundColor: "#1c1c1c", borderWidth: 1, borderColor: "#3a3a3a" },
  deleteIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(244,63,94,.14)", borderWidth: 1, borderColor: "rgba(253,164,175,.16)" },
  deleteTitle: { color: "#fafafa", fontSize: 19, fontWeight: "800", marginTop: 15 },
  deleteCopy: { color: "#a1a1aa", fontSize: 13, lineHeight: 19, marginTop: 6 },
  deleteActions: { flexDirection: "row", gap: 9, marginTop: 21 },
  deleteCancel: { flex: 1, minHeight: 45, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#292929", borderWidth: 1, borderColor: "#414141" },
  deleteCancelText: { color: "#f4f4f5", fontSize: 13, fontWeight: "800" },
  deleteConfirm: { flex: 1, minHeight: 45, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#e11d48" },
  deleteConfirmText: { color: "#fff1f2", fontSize: 13, fontWeight: "800" },
  manifestationBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#000000" },
  manifestationDialog: { borderRadius: 22, padding: 21, backgroundColor: "#1d1d1d", borderWidth: 1, borderColor: "#383838" },
  manifestationIcon: { width: 49, height: 49, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#203040" },
  manifestationIconText: { color: colors.accent, fontSize: 29, fontWeight: "800" },
  manifestationTitle: { color: "#fafafa", fontSize: 18, fontWeight: "700" },
  manifestationHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  manifestationCounter: { color: "#e4e4e7", fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"], backgroundColor: "rgba(255,255,255,.10)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  manifestationPhrase: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, alignItems: "center", marginTop: 16, backgroundColor: "rgba(0,0,0,.20)", borderWidth: 1, borderColor: "#383838" },
  manifestationPhraseText: { color: "#f4f4f5", fontSize: 16, fontWeight: "600", lineHeight: 24, textAlign: "center" },
  manifestationInput: { height: 44, borderRadius: 10, paddingHorizontal: 13, color: "#fafafa", backgroundColor: "rgba(0,0,0,.30)", borderWidth: 1, borderColor: "#383838", fontSize: 14, fontWeight: "600", marginTop: 16 },
  manifestationError: { minHeight: 18, color: "#fcd34d", fontSize: 12, marginTop: 7 },
  manifestationButton: { height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#f4f4f5", marginTop: 2 },
  manifestationButtonText: { color: "#18181b", fontSize: 14, fontWeight: "800" },
});
