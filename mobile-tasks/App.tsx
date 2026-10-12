import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Animated,
  ActivityIndicator,
  Easing,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
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
import { TaskRow } from "./src/components/TaskRow";
import { BottomNavigation } from "./src/components/BottomNavigation";
import { type TabKey, tabs } from "./src/navigation/tabs";
import { ComingSoonScreen } from "./src/screens/ComingSoonScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { isFirebaseConfigured, migrateTasksIfEmpty, observeSession, patchCloudProfile, readCloudProfile, syncTaskChanges, watchCloudProfile, watchPracticeEntities, watchTasks, watchTrackerSections, writeQuestionLearning } from "./src/lib/firebase";
import { logout } from "./src/lib/firebase";
import { loadProfile, normalizeProfile, saveProfile, type PracticeProfile } from "./src/lib/profile-store";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { MediaOverlay, type MediaMode } from "./src/screens/MediaOverlay";
import { PracticeScreen } from "./src/screens/PracticeScreen";
import { TrackScreen } from "./src/screens/TrackScreen";
import { ProgressScreen } from "./src/screens/ProgressScreen";
import { reportVerticalTouch } from "./src/navigation/bottomNavigationVisibility";
import type { User } from "firebase/auth";
import { reportVerticalScroll, resetBottomNavigation } from "./src/navigation/bottomNavigationVisibility";
import { getUnlockQuiz, loadUnlockQuiz } from "./src/domain/unlock-quiz";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
type TaskRange = "today" | "week" | "month" | "3months" | "year";
const TASK_RANGE_LABELS: Record<TaskRange, string> = { today: "Today", week: "This week", month: "This month", "3months": "Last 3 months", year: "This year" };
const TASK_TABS = ["Tasks", "Analytics", "History"] as const;
const MANIFESTATION_COMPLETION_PREFIX = "ssc-buddy:manifestation-completion";
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function manifestationDayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function manifestationCompletionKey(userId?: string) {
  return `${MANIFESTATION_COMPLETION_PREFIX}:${userId ?? "local"}`;
}

const ScrollView = (props: any) => <NativeScrollView {...props} scrollEventThrottle={16} onScroll={(event) => { if (!props.horizontal) reportVerticalScroll(event.nativeEvent.contentOffset.y); props.onScroll?.(event); }} />;

function CompletionRing({ percent }: { percent: number }) {
  const value = Math.max(0, Math.min(100, percent));
  const animated = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
  const size = 112;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    animated.stopAnimation();
    const listener = animated.addListener(({ value: next }) => setDisplayValue(Math.round(next)));
    Animated.timing(animated, {
      toValue: value,
      duration: 760,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animated.removeListener(listener);
  }, [animated, value]);

  return (
    <View style={styles.ring}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke="#343434" strokeWidth={stroke} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="#60a5fa"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated.interpolate({ inputRange: [0, 100], outputRange: [circumference, 0] })}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={styles.ringText}>{displayValue}%</Text>
    </View>
  );
}

function AnimatedMetric({ value, format = (next: number) => String(next) }: { value: number; format?: (value: number) => string }) {
  const animated = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    animated.stopAnimation();
    const listener = animated.addListener(({ value: next }) => setDisplay(Math.round(next)));
    Animated.timing(animated, { toValue: Math.max(0, value), duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => animated.removeListener(listener);
  }, [animated, value]);

  return <>{format(display)}</>;
}

export default function App() {
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [showSplash, setShowSplash] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [mediaMode, setMediaMode] = useState<MediaMode>(null);
  const [musicOpenRequest, setMusicOpenRequest] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [syllabusSubjects, setSyllabusSubjects] = useState<string[]>([]);
  const [practiceActivityDates, setPracticeActivityDates] = useState<string[]>([]);
  const [trackerActivityDates, setTrackerActivityDates] = useState<string[]>([]);
  const [profileSettings, setProfileSettings] = useState<PracticeProfile | null>(null);
  const [appTab, setAppTab] = useState<TabKey>("tasks");
  const [trackTab, setTrackTab] = useState<"Syllabus" | "Revision" | "Mock Test">("Syllabus");
  const [dailyManifestation, setDailyManifestation] = useState("");
  const [manifestationEntry, setManifestationEntry] = useState("");
  const [manifestationRepeats, setManifestationRepeats] = useState(0);
  const [manifestationError, setManifestationError] = useState("");
  const learningFingerprint = useRef("");
  const [tab, setTab] = useState<"Tasks" | "Analytics" | "History">("Tasks");
  const [taskTabsWidth, setTaskTabsWidth] = useState(0);
  const taskTabIndicator = useRef(new Animated.Value(0)).current;
  const taskSwipeStartX = useRef<number | null>(null);
  const [taskDay, setTaskDay] = useState<"today" | "tomorrow">("today");
  const [analyticsRange, setAnalyticsRange] = useState<TaskRange>("week");
  const [analyticsSubject, setAnalyticsSubject] = useState("All subjects");
  const [historyRange, setHistoryRange] = useState<TaskRange>("week");
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [analyticsRangeOpen, setAnalyticsRangeOpen] = useState(false);
  const [analyticsSubjectOpen, setAnalyticsSubjectOpen] = useState(false);
  const [historyRangeOpen, setHistoryRangeOpen] = useState(false);
  const [historyDateOpen, setHistoryDateOpen] = useState(false);
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Other");
  const [type, setType] = useState<TaskType>("Practice Session");
  const [schedule, setSchedule] = useState<"today" | "tomorrow">("today");
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const [completion, setCompletion] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [spent, setSpent] = useState("60");
  const [taskActionLoading, setTaskActionLoading] = useState(false);
  const activeAppTab = tabs.find((item) => item.key === appTab) ?? tabs[0];
  const activeTaskTabIndex = TASK_TABS.indexOf(tab);
  const handleTaskSwipeEnd = (endX: number) => {
    const startX = taskSwipeStartX.current;
    taskSwipeStartX.current = null;
    if (startX === null || Math.abs(endX - startX) < 56) return;
    const direction = endX < startX ? 1 : -1;
    const nextIndex = (activeTaskTabIndex + direction + TASK_TABS.length) % TASK_TABS.length;
    setTab(TASK_TABS[nextIndex]);
  };
  // Task subjects follow the canonical tracker syllabus across app, web, and desktop.
  // Other only keeps the task form usable before the first syllabus subject exists.
  const subjectOptions = syllabusSubjects.length ? syllabusSubjects : ["Other"];
  useEffect(() => {
    if (!taskTabsWidth) return;
    Animated.spring(taskTabIndicator, {
      toValue: activeTaskTabIndex * (taskTabsWidth / TASK_TABS.length),
      damping: 18,
      stiffness: 220,
      mass: 0.65,
      useNativeDriver: true,
    }).start();
  }, [activeTaskTabIndex, taskTabIndicator, taskTabsWidth]);
  const refreshDailyTasksWidget = (next: Task[]) => {
    if (Platform.OS !== "android") return;
    try {
      const { requestWidgetUpdate } = require("react-native-android-widget");
      const { renderDailyTasksWidget } = require("./src/widgets/DailyTasksWidget");
      void requestWidgetUpdate({
        widgetName: "DailyTasksWidget",
        renderWidget: async () => renderDailyTasksWidget(next),
      });
      const { renderQuickRecallWidget } = require("./src/widgets/QuickRecallWidget");
      void requestWidgetUpdate({
        widgetName: "QuickRecallWidget",
        renderWidget: async () => renderQuickRecallWidget(await getUnlockQuiz()),
      });
    } catch {}
  };
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return observeSession((user) => {
      setAuthenticated(Boolean(user));
      setUser(user);
      setAuthReady(true);
    });
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1150);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    void loadProfile().then(setProfileSettings);
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
        if (!cancelled) setProfileSettings(next);
      } catch {}
    };
    const start = async () => {
      try {
        const remote = await readCloudProfile(user);
        if (cancelled) return;
        if (remote) { applyingRemote = true; await apply(remote); applyingRemote = false; }
        else await patchCloudProfile(user, profileSettings);
        if (cancelled) return;
        unsubscribe = watchCloudProfile(user, (value) => {
          if (value && !applyingRemote) void apply(value);
        });
      } catch {}
    };
    void start();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [authenticated, user?.uid]);

  const saveSharedProfile = (next: PracticeProfile) => {
    const normalized = normalizeProfile(next);
    const previous: Partial<PracticeProfile> = profileSettings ?? {};
    const changed = Object.fromEntries(
      Object.entries(normalized).filter(([key, value]) => previous[key as keyof PracticeProfile] !== value),
    );
    setProfileSettings(normalized);
    void saveProfile(normalized);
    if (user && Object.keys(changed).length) void patchCloudProfile(user, changed);
  };

  useEffect(() => {
    void (async () => {
      const current = await AsyncStorage.getItem(TASK_STORAGE_KEY);
      const raw = current ?? await AsyncStorage.getItem(LEGACY_TASK_STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as Task[]) : [];
      const normalized = stored.map((storedTask) => {
        const { targetMinutes: _legacyTarget, ...task } = storedTask as Task & { targetMinutes?: number };
        return task;
      }).filter((task) => !task.id.startsWith("demo-"));
      setTasks(normalized);
      await AsyncStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(normalized));
      if (!current && raw) await AsyncStorage.removeItem(LEGACY_TASK_STORAGE_KEY);
      setTasksLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!tasksLoaded) return;
    const openCompletionFromWidget = (url: string | null) => {
      if (!url?.startsWith("sscbuddy://tasks")) return;
      if (!url.startsWith("sscbuddy://tasks/complete")) {
        setAppTab("tasks");
        setTab("Tasks");
        setTaskDay("today");
        return;
      }
      const taskId = /[?&]taskId=([^&]+)/.exec(url)?.[1];
      const task = taskId ? tasks.find((item) => item.id === decodeURIComponent(taskId)) : undefined;
      if (!task || task.completed) return;
      setAppTab("tasks");
      setTab("Tasks");
      setTaskDay("today");
      setSpent(String(task.minutesSpent ?? 60));
      setCompletion(task);
    };
    void Linking.getInitialURL().then(openCompletionFromWidget).catch(() => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) => openCompletionFromWidget(url));
    return () => subscription.remove();
  }, [tasks, tasksLoaded]);
  useEffect(() => {
    if (!authenticated || !user || !tasksLoaded) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        await migrateTasksIfEmpty(user, tasks);
        if (cancelled) return;
        unsubscribe = watchTasks(user, (remote) => {
          const next = remote as Task[];
          setTasks(next);
          void AsyncStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(next));
          refreshDailyTasksWidget(next);
        });
      } catch {}
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  // Initial migration must only run once per authenticated account.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user?.uid, tasksLoaded]);
  // Matches the web header streak exactly: practice attempts plus explicit
  // tracker activity. Daily-task completion intentionally does not inflate it.
  useEffect(() => {
    if (!user) { setPracticeActivityDates([]); setTrackerActivityDates([]); setSyllabusSubjects([]); return; }
    const stopAttempts = watchPracticeEntities(user, "practiceAttempts", (items) => setPracticeActivityDates(items.map((item) => typeof item.date === "string" ? item.date : "").filter(Boolean)));
    const stopTracker = watchTrackerSections(user, (sections) => {
      setTrackerActivityDates(Array.isArray(sections.activity) ? sections.activity.map((entry: any) => typeof entry?.date === "string" ? entry.date : "").filter(Boolean) : []);
      setSyllabusSubjects(Array.isArray(sections.subjects) ? [...new Set(sections.subjects.map((entry: any) => String(entry?.name ?? "").trim()).filter(Boolean))] : []);
    });
    return () => { stopAttempts?.(); stopTracker?.(); };
  }, [user?.uid]);
  const persist = (next: Task[]) => {
    const previous = tasks;
    setTasks(next);
    void AsyncStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(next));
    refreshDailyTasksWidget(next);
    if (user) void syncTaskChanges(user, previous, next);
  };
  const today = dateKey();
  const tomorrow = dateKeyFromOffset(1);
  const inRange = (value: string, range: TaskRange) => { const days = range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 31 : range === "3months" ? 92 : 366; const from = dateKeyFromOffset(-(days - 1)); return value >= from && value <= today; };
  const todayTasks = tasks
    .filter((task) => task.date === (taskDay === "today" ? today : tomorrow))
    .sort((a, b) => Number(a.completed) - Number(b.completed));
  const todaySummary = summarizeTasks(todayTasks);
  const tomorrowTaskCount = tasks.filter((task) => task.date === tomorrow).length;
  const seven = tasksInLastDays(tasks, 7);
  const thirty = tasksInLastDays(tasks, 30);
  const sevenSummary = summarizeTasks(seven.flat());
  const thirtySummary = summarizeTasks(thirty.flat());
  const analyticsTasks = tasks.filter((task) => inRange(task.date, analyticsRange) && (analyticsSubject === "All subjects" || task.subject === analyticsSubject));
  const analyticsSummary = summarizeTasks(analyticsTasks);
  const historyDays = useMemo(() => [...new Set(tasks.filter((task) => task.date < today && inRange(task.date, historyRange)).map((task) => task.date))].sort().reverse(), [historyRange, tasks, today]);
  const activeHistoryDate = historyDays.includes(selectedHistoryDate ?? "") ? selectedHistoryDate! : historyDays[0];
  const historyTasks = activeHistoryDate ? tasks.filter((task) => task.date === activeHistoryDate).sort((a, b) => Number(a.completed) - Number(b.completed)) : [];
  const subjectBreakdown = useMemo(() => {
    const totals = new Map<string, { count: number; minutes: number }>();
    analyticsTasks.filter((task) => task.completed).forEach((task) => {
      const current = totals.get(task.subject) ?? { count: 0, minutes: 0 };
      totals.set(task.subject, { count: current.count + 1, minutes: current.minutes + (task.minutesSpent ?? 0) });
    });
    return [...totals.entries()].sort((left, right) => right[1].minutes - left[1].minutes);
  }, [analyticsTasks]);
  const typeBreakdown = useMemo(() => {
    const totals = new Map<string, { count: number; minutes: number }>();
    analyticsTasks.filter((task) => task.completed).forEach((task) => {
      const current = totals.get(task.type) ?? { count: 0, minutes: 0 };
      totals.set(task.type, { count: current.count + 1, minutes: current.minutes + (task.minutesSpent ?? 0) });
    });
    return [...totals.entries()].sort((left, right) => right[1].minutes - left[1].minutes);
  }, [analyticsTasks]);
  const streak = useMemo(() => {
    const activeDays = new Set([...practiceActivityDates, ...trackerActivityDates].map((value) => localDateKey(new Date(value))));
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!activeDays.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let days = 0;
    while (activeDays.has(localDateKey(cursor))) { days += 1; cursor.setDate(cursor.getDate() - 1); }
    return days;
  }, [practiceActivityDates, trackerActivityDates]);
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
    setType("Practice Session");
    setSchedule("today");
    setEditor("new");
  };
  const openEdit = (task: Task) => {
    setName(task.name);
    setSubject(subjectOptions.includes(task.subject) ? task.subject : (subjectOptions[0] ?? "Other"));
    setType(task.type);
    setEditor(task);
  };
  const saveTask = async () => {
    if (!name.trim()) return;
    setTaskActionLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    const draft = {
      name: name.trim(),
      subject: subject.trim() || "Other",
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
    if (!completion) return;
    setTaskActionLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    persist(
      tasks.map((task) =>
        task.id === completion.id
          ? {
              ...task,
              completed: true,
              completedAt: new Date().toISOString(),
              minutesSpent: Math.max(0, Number(spent) || 0),
            }
          : task,
      ),
    );
    setCompletion(null); setTaskActionLoading(false);
  };
  const reopen = (id: string) =>
    persist(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: false, completedAt: null, minutesSpent: null }
          : task,
      ),
    );
  const remove = (id: string) => setDeletingTask(tasks.find((task) => task.id === id) ?? null);
  const confirmDelete = async () => {
    if (!deletingTask) return;
    setTaskActionLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    persist(tasks.filter((task) => task.id !== deletingTask.id));
    setDeletingTask(null); setTaskActionLoading(false);
  };

  if (showSplash || !authReady) {
    return (
      <SafeAreaProvider>
        <StatusBar hidden />
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  if (!authenticated) {
    return (
      <SafeAreaProvider>
        <StatusBar hidden />
        <AuthScreen onAuthenticated={() => setAuthenticated(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]} onTouchStart={() => resetBottomNavigation()}>
      <StatusBar hidden />
      {appTab === "profile" ? (
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
          streak={streak}
          onLogout={() => {
            void logout();
          }}
        />
      ) : appTab === "track" ? (
        <TrackScreen initialTab={trackTab} user={user} examName={profileSettings?.examName} />
      ) : appTab === "practice" ? (
        <PracticeScreen user={user} />
      ) : appTab === "progress" ? (
        <ProgressScreen user={user} />
      ) : appTab === "tasks" ? (
        <>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>STUDY PLANNER</Text>
          <Text style={styles.title}>Daily Tasks</Text>
          <Text style={styles.headerCopy}>Plan, track, and review.</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.add} onPress={openNew}>
            <Text style={styles.addText}>＋ Add task</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.tabs} onLayout={(event) => setTaskTabsWidth(event.nativeEvent.layout.width - 8)}>
        {taskTabsWidth > 0 && <Animated.View pointerEvents="none" style={[styles.tabIndicator, { width: taskTabsWidth / TASK_TABS.length, transform: [{ translateX: taskTabIndicator }] }]} />}
        {TASK_TABS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            style={styles.tab}
          >
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content} onTouchStart={(event: any) => { taskSwipeStartX.current = event.nativeEvent.pageX; }} onTouchEnd={(event: any) => handleTaskSwipeEnd(event.nativeEvent.pageX)}>
        {tab === "Tasks" && (
          <>
            <View style={styles.hero}>
              <View style={styles.heroHeading}>
                <Text style={styles.date}>{taskDay === "today" ? "Today’s tasks" : "Tomorrow’s tasks"}</Text>
                {(tomorrowTaskCount > 0 || taskDay === "tomorrow") && <Pressable style={styles.dayToggle} onPress={() => setTaskDay((current) => current === "today" ? "tomorrow" : "today")}><Text style={styles.dayToggleText}>{taskDay === "today" ? `Tomorrow (${tomorrowTaskCount})` : "Today"}</Text><MaterialCommunityIcons name="chevron-right" size={14} color="#b4b4b8" /></Pressable>}
              </View>
              <View style={styles.progressRow}>
                <CompletionRing percent={todaySummary.percent} />
                <View style={styles.statColumn}>
                  <Text style={styles.statLabel}>TASKS</Text>
                  <Text style={styles.stat}>
                    <AnimatedMetric value={todaySummary.done} /> / <AnimatedMetric value={todaySummary.total} />
                  </Text>
                  <Text style={styles.statLabel}>COMPLETED TIME</Text>
                  <Text style={styles.stat}><AnimatedMetric value={todaySummary.minutes} format={formatMinutes} /></Text>
                </View>
              </View>
            </View>
            <Text style={styles.sectionTitle}>{taskDay === "today" ? "TODAY'S TASKS" : "TOMORROW'S TASKS"}</Text>
            {todayTasks.length === 0 ? (
                <Empty onPress={openNew} />
            ) : (
              todayTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onDone={() => {
                    setSpent(String(task.minutesSpent ?? 30));
                    setCompletion(task);
                  }}
                  onReopen={() => reopen(task.id)}
                  onEdit={() => openEdit(task)}
                  onDelete={() => remove(task.id)}
                />
              ))
            )}
          </>
        )}
        {tab === "Analytics" && (
          <>
            {(analyticsRangeOpen || analyticsSubjectOpen) && <Pressable style={styles.dropdownDismiss} onPress={() => { setAnalyticsRangeOpen(false); setAnalyticsSubjectOpen(false); }} />}
            <View style={styles.analyticsHeader}>
              <Text style={styles.sectionTitle}>ANALYTICS</Text>
            </View>
            <View style={styles.analyticsFilters}><TaskDropdown label={TASK_RANGE_LABELS[analyticsRange]} open={analyticsRangeOpen} onToggle={() => { setAnalyticsRangeOpen((value) => !value); setAnalyticsSubjectOpen(false); }} options={(["today", "week", "month", "3months", "year"] as TaskRange[]).map((value) => ({ value, label: TASK_RANGE_LABELS[value] }))} onSelect={(value) => { setAnalyticsRange(value as TaskRange); setAnalyticsRangeOpen(false); }} /><TaskDropdown label={analyticsSubject} open={analyticsSubjectOpen} onToggle={() => { setAnalyticsSubjectOpen((value) => !value); setAnalyticsRangeOpen(false); }} options={["All subjects", ...subjectOptions.filter((item) => item !== "Other")].map((value) => ({ value, label: value }))} onSelect={(value) => { setAnalyticsSubject(value); setAnalyticsSubjectOpen(false); }} /></View>
            <View style={styles.metricGrid}>
              <Metric label="Time spent" value={formatMinutes(analyticsSummary.minutes)} note={TASK_RANGE_LABELS[analyticsRange]} />
              <Metric label="Completed / pending" value={`${analyticsSummary.done} / ${analyticsSummary.total - analyticsSummary.done}`} note={`${analyticsSummary.percent}% completion`} />
            </View>
            <Breakdown title="Subject-wise study time" items={subjectBreakdown} tone="mint" />
            <Breakdown title="Task-type breakdown" items={typeBreakdown} tone="blue" />
            <Text style={styles.sectionTitle}>LAST 7 DAYS</Text>
            <View style={styles.chart}>
              {seven.map((day, index) => (
                <View key={index} style={styles.chartItem}>
                  <AnalyticsChartBar percent={summarizeTasks(day).percent} delay={index * 55} />
                  <Text style={styles.chartLabel}>{index === 6 ? "Today" : `${6 - index}d`}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        {tab === "History" && (
          <>
            {(historyRangeOpen || historyDateOpen) && <Pressable style={styles.dropdownDismiss} onPress={() => { setHistoryRangeOpen(false); setHistoryDateOpen(false); }} />}
            <TaskDropdown label={TASK_RANGE_LABELS[historyRange]} open={historyRangeOpen} onToggle={() => { setHistoryRangeOpen((value) => !value); setHistoryDateOpen(false); setAnalyticsRangeOpen(false); setAnalyticsSubjectOpen(false); }} options={(["week", "month", "3months", "year"] as TaskRange[]).map((value) => ({ value, label: TASK_RANGE_LABELS[value] }))} onSelect={(value) => { setHistoryRange(value as TaskRange); setSelectedHistoryDate(null); setHistoryRangeOpen(false); }} />
            {historyDays.length ? <>{!historyRangeOpen && <TaskDropdown label={new Date(`${activeHistoryDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })} open={historyDateOpen} onToggle={() => { setHistoryDateOpen((value) => !value); setHistoryRangeOpen(false); setAnalyticsRangeOpen(false); setAnalyticsSubjectOpen(false); }} options={historyDays.map((value) => ({ value, label: new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) }))} onSelect={(value) => { setSelectedHistoryDate(value); setHistoryDateOpen(false); }} />}<View style={styles.history}><Text style={styles.historyDate}>{new Date(`${activeHistoryDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</Text><Text style={styles.muted}>{formatMinutes(summarizeTasks(historyTasks).minutes)} study time</Text><View style={styles.historyTaskList}>{historyTasks.map((task, index) => <TaskRow key={task.id} task={task} compact grouped last={index === historyTasks.length - 1} onDone={() => { setSpent(String(task.minutesSpent ?? 30)); setCompletion(task); }} onReopen={() => reopen(task.id)} onEdit={() => openEdit(task)} onDelete={() => remove(task.id)} />)}</View></View></> : <View style={styles.empty}><Text style={styles.muted}>No task history yet.</Text></View>}
          </>
        )}
      </ScrollView>
      <Modal transparent visible={editor !== null} animationType="slide">
        <Pressable style={styles.backdrop} onPress={() => setEditor(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{editor === "new" ? "Add task" : "Edit task"}</Text>
            <Field
              label="Task name"
              value={name}
              placeholder="Lecture 5 of Polity"
              onChangeText={setName}
            />
            <View style={styles.selectWrap}>
              <Text style={styles.fieldLabel}>SUBJECT</Text>
              <TaskDropdown label={subject} open={subjectMenuOpen} onToggle={() => setSubjectMenuOpen((open) => !open)} options={subjectOptions.map((value) => ({ value, label: value }))} onSelect={(value) => { setSubject(value); setSubjectMenuOpen(false); }} />
            </View>
            <Text style={styles.fieldLabel}>TYPE</Text>
            <View style={styles.typeRow}>
              {TASK_TYPES.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setType(item)}
                  style={[styles.typeChip, type === item && styles.typeChipActive]}
                >
                  <Text style={styles.typeText}>{item}</Text>
                </Pressable>
              ))}
            </View>
            {editor === "new" && (
              <View>
                <Text style={styles.fieldLabel}>SCHEDULE FOR</Text>
                <View style={styles.scheduleRow}>
                  {(["today", "tomorrow"] as const).map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setSchedule(option)}
                      style={[styles.scheduleChip, schedule === option && styles.scheduleChipActive]}
                    >
                      <Text style={[styles.scheduleText, schedule === option && styles.scheduleTextActive]}>
                        {option === "today" ? "Today" : "Tomorrow"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setEditor(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable disabled={taskActionLoading} onPress={() => void saveTask()} style={[styles.primary, taskActionLoading && styles.actionDisabled]}>
                {taskActionLoading ? <ActivityIndicator size="small" color="#081a31" /> : <Text style={styles.primaryText}>Save task</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal transparent visible={completion !== null} animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Complete task</Text>
            <Text style={styles.muted}>{completion?.name}</Text>
            <Field
              label="Actual study minutes"
              value={spent}
              onChangeText={setSpent}
              keyboardType="numeric"
            />
            <View style={styles.timeChips}>{[30, 45, 60, 90, 120].map((minutes) => <Pressable key={minutes} onPress={() => setSpent(String(minutes))} style={[styles.timeChip, Number(spent) === minutes && styles.timeChipActive]}><Text style={[styles.timeChipText, Number(spent) === minutes && styles.timeChipTextActive]}>{formatMinutes(minutes)}</Text></Pressable>)}</View>
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setCompletion(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable disabled={taskActionLoading} onPress={() => void markDone()} style={[styles.primary, taskActionLoading && styles.actionDisabled]}>
                {taskActionLoading ? <ActivityIndicator size="small" color="#081a31" /> : <Text style={styles.primaryText}>Mark complete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal transparent visible={deletingTask !== null} animationType="fade" onRequestClose={() => setDeletingTask(null)}>
        <Pressable style={styles.deleteBackdrop} onPress={() => setDeletingTask(null)}>
          <Pressable style={styles.deleteDialog} onPress={() => undefined}>
            <View style={styles.deleteIcon}><MaterialCommunityIcons name="trash-can-outline" size={21} color="#fda4af" /></View>
            <Text style={styles.deleteTitle}>Delete task?</Text>
            <Text numberOfLines={2} style={styles.deleteCopy}>“{deletingTask?.name}” will be permanently removed.</Text>
            <View style={styles.deleteActions}>
              <Pressable style={styles.deleteCancel} onPress={() => setDeletingTask(null)}><Text style={styles.deleteCancelText}>Keep task</Text></Pressable>
              <Pressable disabled={taskActionLoading} style={[styles.deleteConfirm, taskActionLoading && styles.actionDisabled]} onPress={() => void confirmDelete()}>{taskActionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.deleteConfirmText}>Delete</Text>}</Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
        </>
      ) : (
        <ComingSoonScreen title={activeAppTab.label} />
      )}
      <BottomNavigation activeTab={appTab} onChange={setAppTab} />
      <MediaOverlay user={user} mode={mediaMode} musicOpenRequest={musicOpenRequest} onClose={() => setMediaMode(null)} />
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
    </SafeAreaProvider>
  );
}

function SplashScreen() {
  return <ImageBackground source={require("./assets/auth.jpg")} style={styles.splash} imageStyle={styles.splashImage}><View style={styles.splashOverlay}><Image source={require("./assets/auth.jpg")} style={styles.splashMark} /><Text style={styles.splashTitle}>SSC Buddy</Text><Text style={styles.splashCopy}>Focused preparation workspace</Text></View></ImageBackground>;
}

function DailyManifestationDialog({ phrase, entry, repeats, error, onChange, onContinue }: { phrase: string; entry: string; repeats: number; error: string; onChange: (value: string) => void; onContinue: () => void }) {
  return <Modal transparent visible={Boolean(phrase)} animationType="fade"><View style={styles.manifestationBackdrop}><View style={styles.manifestationDialog}><Text style={styles.manifestationTitle}>Daily manifestation</Text><View style={styles.manifestationPhrase}><Text style={styles.manifestationPhraseText}>“{phrase}”</Text></View><TextInput autoFocus value={entry} onChangeText={onChange} autoCapitalize="characters" placeholder="Type here" placeholderTextColor="#71717a" style={styles.manifestationInput} onSubmitEditing={onContinue} /><Text style={styles.manifestationError}>{error || " "}</Text><Pressable style={styles.manifestationButton} onPress={onContinue}><Text style={styles.manifestationButtonText}>{repeats === 2 ? "Done" : "Continue"}</Text></Pressable></View></View></Modal>;
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
function TaskDropdown({ label, open, onToggle, options, onSelect, compact = false }: { label: string; open: boolean; onToggle: () => void; options: Array<{ value: string; label: string }>; onSelect: (value: string) => void; compact?: boolean }) {
  const visibility = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [renderMenu, setRenderMenu] = useState(open);
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
  return <View style={[styles.dropdownWrap, compact && styles.dropdownWrapCompact, open && styles.dropdownWrapOpen]}><Pressable style={[styles.dropdownTrigger, open && styles.dropdownTriggerOpen]} onPress={onToggle}><Text numberOfLines={1} style={styles.dropdownValue}>{label}</Text><View style={styles.dropdownChevronButton}><MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={18} color="#a1a1aa" /></View></Pressable>{renderMenu && <Animated.View pointerEvents={open ? "auto" : "none"} style={[styles.dropdownMenu, { opacity: visibility, transform: [{ translateY: visibility.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }, { scale: visibility.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>{options.map((option) => { const selected = option.value === label || option.label === label; return <Pressable key={option.value} style={[styles.dropdownOption, selected && styles.dropdownOptionSelected]} onPress={() => onSelect(option.value)}><Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextSelected]}>{option.label}</Text>{selected && <MaterialCommunityIcons name="check" size={16} color="#171717" />}</Pressable>; })}</Animated.View>}</View>;
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
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.muted}>{note}</Text>
    </View>
  );
}
function AnalyticsChartBar({ percent, delay }: { percent: number; delay: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const height = Math.max(5, percent * 0.7);
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 760,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [delay, height, progress]);
  return <Animated.View style={[styles.chartBar, { height: progress.interpolate({ inputRange: [0, 1], outputRange: [5, height] }) }]} />;
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
  const progress = useRef(new Animated.Value(0)).current;
  const animationKey = items.map(([name, data]) => `${name}:${data.minutes}`).join("|");
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 820,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animationKey, progress]);
  return (
    <View style={styles.breakdown}>
      <Text style={styles.breakdownTitle}>{title}</Text>
      {items.length ? items.map(([name, data]) => (
        <View key={name} style={styles.breakdownRow}>
          <View style={styles.breakdownLabel}><Text style={styles.breakdownName}>{name}</Text><Text style={styles.breakdownMeta}>{data.count} tasks · {formatMinutes(data.minutes)}</Text></View>
          <View style={styles.breakdownTrack}><Animated.View style={[styles.breakdownFill, tone === "blue" && styles.breakdownFillBlue, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.max(4, (data.minutes / leadingMinutes) * 100)}%`] }) }]} /></View>
        </View>
      )) : <Text style={styles.emptyAnalytics}>Complete tasks to see analytics.</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#101010" },
  authLoading: { flex: 1, backgroundColor: "#101010" },
  splash: { flex: 1, backgroundColor: "#101010" },
  splashImage: { opacity: 0.18 },
  splashOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,10,10,.78)" },
  splashMark: { width: 76, height: 76, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,.15)" },
  splashTitle: { color: "#fafafa", fontSize: 30, fontWeight: "800", marginTop: 14, letterSpacing: -0.6 },
  splashCopy: { color: "#a1a1aa", fontSize: 12, marginTop: 6 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  streakPill: { minWidth: 42, height: 40, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 20, backgroundColor: "#262626", borderWidth: 1, borderColor: "#333333" },
  streakPillActive: { backgroundColor: "rgba(251, 191, 36, .14)", borderColor: "rgba(251, 191, 36, .22)" },
  streakText: { color: "#d4d4d8", fontSize: 13, fontWeight: "800" },
  streakTextActive: { color: "#fef3c7" },
  eyebrow: { color: "#818cf8", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  title: { color: "#fafafa", fontSize: 25, fontWeight: "700", marginTop: 3 },
  headerCopy: { color: "#a1a1aa", fontSize: 12, marginTop: 3 },
  add: { backgroundColor: "#60a5fa", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  addText: { color: "#081a31", fontWeight: "600" },
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
  hero: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  heroHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  date: { color: "#fafafa", fontSize: 20, fontWeight: "700" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 22, marginVertical: 20 },
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
  statColumn: { gap: 4 },
  statLabel: { color: "#a1a1aa", fontSize: 10, letterSpacing: 1.4 },
  stat: { color: "#fafafa", fontSize: 23, fontWeight: "700", marginBottom: 6 },
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
  checkDone: { borderColor: "#60a5fa", backgroundColor: "#60a5fa" },
  checkText: { color: "#081a31", fontWeight: "900" },
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
  link: { color: "#60a5fa", fontWeight: "700", marginTop: 10 },
  metric: {
    width: "48.8%",
    minHeight: 92,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  metricValue: { color: "#fafafa", fontSize: 20, fontWeight: "800", marginTop: 5 },
  analyticsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rangeControl: { flexDirection: "row", gap: 3, padding: 3, borderRadius: 11, backgroundColor: "#1c1c1c" },
  analyticsFilters: { flexDirection: "row", gap: 8, zIndex: 20 },
  rangeButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  rangeButtonActive: { backgroundColor: "#303030" },
  rangeText: { color: "#71717a", fontSize: 11, fontWeight: "700" },
  rangeTextActive: { color: "#60a5fa" },
  dayToggle: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 11, borderWidth: 1, borderColor: "#414141", paddingLeft: 10, paddingRight: 7, paddingVertical: 7, backgroundColor: "#242424" },
  dayToggleText: { color: "#e4e4e7", fontSize: 12, fontWeight: "700" },
  subjectFilters: { gap: 7, paddingVertical: 2 },
  subjectFilter: { borderRadius: 11, borderWidth: 1, borderColor: "#3d3d3d", paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#1b1b1b" },
  subjectFilterActive: { borderColor: "#60a5fa", backgroundColor: "#16345c" },
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
  breakdownFill: { height: "100%", borderRadius: 5, backgroundColor: "#60a5fa" },
  breakdownFillBlue: { backgroundColor: "#60a5fa" },
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
  chartBar: { width: 16, maxHeight: 95, borderRadius: 6, backgroundColor: "#60a5fa" },
  chartLabel: { color: "#71717a", fontSize: 10 },
  history: {
    borderRadius: 17,
    padding: 14,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  historyDate: { color: "#fafafa", fontWeight: "700" },
  historyTaskList: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#303030" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.72)" },
  sheet: {
    backgroundColor: "#202020",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
    gap: 14,
  },
  sheetTitle: { color: "#fafafa", fontSize: 21, fontWeight: "800" },
  timeChips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: -5 },
  timeChip: { borderRadius: 10, borderWidth: 1, borderColor: "#444", paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#292929" },
  timeChipActive: { borderColor: "#60a5fa", backgroundColor: "#162c45" },
  timeChipText: { color: "#a1a1aa", fontSize: 11, fontWeight: "800" },
  timeChipTextActive: { color: "#dbeafe" },
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
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#303030",
  },
  typeChipActive: { backgroundColor: "#162c45" },
  typeText: { color: "#e4e4e7", fontSize: 12 },
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
  scheduleChipActive: { borderColor: "#60a5fa", backgroundColor: "#162c45" },
  scheduleText: { color: "#a1a1aa", fontSize: 13, fontWeight: "600" },
  scheduleTextActive: { color: "#dbeafe" },
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
    backgroundColor: "#60a5fa",
  },
  primaryText: { color: "#081a31", fontWeight: "600" },
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
  manifestationIconText: { color: "#93c5fd", fontSize: 29, fontWeight: "800" },
  manifestationTitle: { color: "#fafafa", fontSize: 18, fontWeight: "700" },
  manifestationPhrase: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, alignItems: "center", marginTop: 16, backgroundColor: "rgba(0,0,0,.20)", borderWidth: 1, borderColor: "#383838" },
  manifestationPhraseText: { color: "#f4f4f5", fontSize: 16, fontWeight: "600", lineHeight: 24, textAlign: "center" },
  manifestationInput: { height: 44, borderRadius: 10, paddingHorizontal: 13, color: "#fafafa", backgroundColor: "rgba(0,0,0,.30)", borderWidth: 1, borderColor: "#383838", fontSize: 14, fontWeight: "600", marginTop: 16 },
  manifestationError: { minHeight: 18, color: "#fcd34d", fontSize: 12, marginTop: 7 },
  manifestationButton: { height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#f4f4f5", marginTop: 2 },
  manifestationButtonText: { color: "#18181b", fontSize: 14, fontWeight: "800" },
});
