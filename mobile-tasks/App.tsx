import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createTaskId,
  dateKey,
  formatMinutes,
  summarizeTasks,
  TASK_TYPES,
  tasksInLastDays,
  type Task,
  type TaskType,
} from "./src/domain/tasks";
import { TaskRow } from "./src/components/TaskRow";
import { BottomNavigation } from "./src/components/BottomNavigation";
import { type TabKey, tabs } from "./src/navigation/tabs";
import { ComingSoonScreen } from "./src/screens/ComingSoonScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { isFirebaseConfigured, observeSession } from "./src/lib/firebase";

const STORAGE_KEY = "ssc-buddy-mobile:tasks:v1";

export default function App() {
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [authenticated, setAuthenticated] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [appTab, setAppTab] = useState<TabKey>("tasks");
  const [tab, setTab] = useState<"Today" | "Insights" | "History">("Today");
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("General");
  const [type, setType] = useState<TaskType>("Practice Session");
  const [minutes, setMinutes] = useState("60");
  const [completion, setCompletion] = useState<Task | null>(null);
  const [spent, setSpent] = useState("60");
  const activeAppTab = tabs.find((item) => item.key === appTab) ?? tabs[0];

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return observeSession((user) => {
      setAuthenticated(Boolean(user));
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const stored = raw ? (JSON.parse(raw) as Task[]) : [];
      setTasks(
        stored.map((task) => ({
          ...task,
          // Keeps local data compatible if an earlier app build did not yet save targets.
          targetMinutes: task.targetMinutes ?? task.minutesSpent ?? 60,
        })),
      );
    });
  }, []);
  const persist = (next: Task[]) => {
    setTasks(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };
  const today = dateKey();
  const todayTasks = tasks
    .filter((task) => task.date === today)
    .sort((a, b) => Number(a.completed) - Number(b.completed));
  const todaySummary = summarizeTasks(todayTasks);
  const seven = tasksInLastDays(tasks, 7);
  const thirty = tasksInLastDays(tasks, 30);
  const sevenSummary = summarizeTasks(seven.flat());
  const thirtySummary = summarizeTasks(thirty.flat());
  const streak = useMemo(() => {
    let days = 0;
    for (let i = 0; ; i += 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      if (tasks.some((task) => task.date === dateKey(date) && task.completed)) days += 1;
      else break;
    }
    return days;
  }, [tasks]);
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
    setSubject("General");
    setType("Practice Session");
    setMinutes("60");
    setEditor("new");
  };
  const openEdit = (task: Task) => {
    setName(task.name);
    setSubject(task.subject);
    setType(task.type);
    setMinutes(String(task.targetMinutes));
    setEditor(task);
  };
  const saveTask = () => {
    if (!name.trim()) return;
    const draft = {
      name: name.trim(),
      subject: subject.trim() || "General",
      type,
      date: editor === "new" ? today : (editor?.date ?? today),
      targetMinutes: Math.max(0, Number(minutes) || 0),
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
    setEditor(null);
  };
  const markDone = () => {
    if (!completion) return;
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
    setCompletion(null);
  };
  const reopen = (id: string) =>
    persist(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: false, completedAt: null, minutesSpent: null }
          : task,
      ),
    );
  const remove = (id: string) =>
    Alert.alert("Delete task?", "This task will be removed permanently.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => persist(tasks.filter((task) => task.id !== id)),
      },
    ]);

  if (!authReady) {
    return (
      <SafeAreaProvider>
        <View style={styles.authLoading} />
      </SafeAreaProvider>
    );
  }

  if (!authenticated) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthScreen onAuthenticated={() => setAuthenticated(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      {appTab === "tasks" ? (
        <>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SSC BUDDY</Text>
          <Text style={styles.title}>Daily Tasks</Text>
        </View>
        <Pressable style={styles.add} onPress={openNew}>
          <Text style={styles.addText}>＋ Add</Text>
        </Pressable>
      </View>
      <View style={styles.tabs}>
        {(["Today", "Insights", "History"] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            style={[styles.tab, tab === item && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === "Today" && (
          <>
            <View style={styles.hero}>
              <Text style={styles.date}>
                {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" })}
              </Text>
              <View style={styles.progressRow}>
                <View style={styles.ring}>
                  <Text style={styles.ringText}>{todaySummary.percent}%</Text>
                </View>
                <View style={styles.statColumn}>
                  <Text style={styles.statLabel}>TASKS</Text>
                  <Text style={styles.stat}>
                    {todaySummary.done} / {todaySummary.total}
                  </Text>
                  <Text style={styles.statLabel}>COMPLETED / TARGET</Text>
                  <Text style={styles.stat}>{formatMinutes(todaySummary.minutes)}</Text>
                  <Text style={styles.muted}>of {formatMinutes(todaySummary.targetMinutes)}</Text>
                </View>
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${todaySummary.percent}%` }]} />
              </View>
              <Text style={styles.muted}>{streak} day consistency streak</Text>
            </View>
            <Text style={styles.sectionTitle}>TODAY'S TASKS</Text>
            {todayTasks.length === 0 ? (
              <Empty onPress={openNew} />
            ) : (
              todayTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onDone={() => {
                    setSpent(String(task.minutesSpent ?? task.targetMinutes));
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
        {tab === "Insights" && (
          <>
            <Text style={styles.sectionTitle}>PERFORMANCE</Text>
            <Metric
              label="7-day completion"
              value={`${sevenSummary.percent}%`}
              note={`${formatMinutes(sevenSummary.minutes)} / ${formatMinutes(sevenSummary.targetMinutes)}`}
            />
            <Metric
              label="30-day completion"
              value={`${thirtySummary.percent}%`}
              note={`${formatMinutes(thirtySummary.minutes)} / ${formatMinutes(thirtySummary.targetMinutes)}`}
            />
            <Metric
              label="Average completed / day"
              value={formatMinutes(Math.round(thirtySummary.minutes / 30))}
              note={`Across the last 30 days · ${thirtySummary.percent}% average completion`}
            />
            <Metric
              label="Total completed"
              value={formatMinutes(summarizeTasks(tasks).minutes)}
              note={`${summarizeTasks(tasks).done} tasks completed · ${streak} day streak`}
            />
            <Metric
              label="Highest study day"
              value={highest?.minutes ? formatMinutes(highest.minutes) : "—"}
              note={highest?.minutes ? highest.date : "No completed study yet"}
            />
            <Metric
              label="Best completion day"
              value={bestCompletion ? `${bestCompletion.percent}%` : "—"}
              note={bestCompletion?.date ?? "No tasks scheduled yet"}
            />
            <Text style={styles.sectionTitle}>LAST 7 DAYS</Text>
            <View style={styles.chart}>
              {seven.map((day, index) => (
                <View key={index} style={styles.chartItem}>
                  <View
                    style={[
                      styles.chartBar,
                      { height: Math.max(5, summarizeTasks(day).percent * 0.7) },
                    ]}
                  />
                  <Text style={styles.chartLabel}>{index === 6 ? "Today" : `${6 - index}d`}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        {tab === "History" && (
          <>
            {[...new Set(tasks.map((task) => task.date))]
              .sort()
              .reverse()
              .map((day) => {
                const items = tasks.filter((task) => task.date === day);
                const data = summarizeTasks(items);
                return (
                  <View key={day} style={styles.history}>
                    <Text style={styles.historyDate}>{day}</Text>
                    <Text style={styles.muted}>
                      {data.done}/{data.total} done · {formatMinutes(data.minutes)} /{" "}
                      {formatMinutes(data.targetMinutes)} · {data.percent}%
                    </Text>
                    {items.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        compact
                        onDone={() => {
                          setSpent(String(task.minutesSpent ?? task.targetMinutes));
                          setCompletion(task);
                        }}
                        onReopen={() => reopen(task.id)}
                        onEdit={() => openEdit(task)}
                        onDelete={() => remove(task.id)}
                      />
                    ))}
                  </View>
                );
              })}
          </>
        )}
      </ScrollView>
      <Modal transparent visible={editor !== null} animationType="slide">
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editor === "new" ? "Add task" : "Edit task"}</Text>
            <Field label="Task name" value={name} onChangeText={setName} />
            <Field label="Subject" value={subject} onChangeText={setSubject} />
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
            <Field
              label="Target minutes"
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="numeric"
            />
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setEditor(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveTask} style={styles.primary}>
                <Text style={styles.primaryText}>Save task</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setCompletion(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={markDone} style={styles.primary}>
                <Text style={styles.primaryText}>Mark complete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
        </>
      ) : (
        <ComingSoonScreen title={activeAppTab.label} />
      )}
      <BottomNavigation activeTab={appTab} onChange={setAppTab} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Field(props: {
  label: string;
  value: string;
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
        placeholderTextColor="#71717a"
      />
    </View>
  );
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
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#101010" },
  authLoading: { flex: 1, backgroundColor: "#101010" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },
  eyebrow: { color: "#818cf8", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  title: { color: "#fafafa", fontSize: 25, fontWeight: "700", marginTop: 3 },
  add: { backgroundColor: "#5eead4", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  addText: { color: "#042f2e", fontWeight: "800" },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    padding: 4,
    borderRadius: 13,
    backgroundColor: "#1c1c1c",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  tabActive: { backgroundColor: "#303030" },
  tabText: { color: "#71717a", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fafafa" },
  content: { padding: 20, gap: 12, paddingBottom: 60 },
  hero: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  date: { color: "#fafafa", fontSize: 20, fontWeight: "700" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 22, marginVertical: 20 },
  ring: {
    height: 112,
    width: 112,
    borderRadius: 56,
    borderWidth: 10,
    borderColor: "#5eead4",
    alignItems: "center",
    justifyContent: "center",
  },
  ringText: { color: "#fafafa", fontSize: 25, fontWeight: "800" },
  statColumn: { gap: 4 },
  statLabel: { color: "#a1a1aa", fontSize: 10, letterSpacing: 1.4 },
  stat: { color: "#fafafa", fontSize: 23, fontWeight: "700", marginBottom: 6 },
  bar: { height: 8, backgroundColor: "#333", borderRadius: 6, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#5eead4", borderRadius: 6 },
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
  taskDone: { backgroundColor: "#16342f", borderColor: "#256b5a" },
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
  checkDone: { borderColor: "#5eead4", backgroundColor: "#5eead4" },
  checkText: { color: "#052e2b", fontWeight: "900" },
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
  link: { color: "#5eead4", fontWeight: "700", marginTop: 10 },
  metric: {
    borderRadius: 17,
    padding: 16,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  metricValue: { color: "#fafafa", fontSize: 28, fontWeight: "800", marginTop: 5 },
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
  chartBar: { width: 16, maxHeight: 95, borderRadius: 6, backgroundColor: "#5eead4" },
  chartLabel: { color: "#71717a", fontSize: 10 },
  history: {
    borderRadius: 17,
    padding: 14,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
  },
  historyDate: { color: "#fafafa", fontWeight: "700" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.72)" },
  sheet: {
    backgroundColor: "#202020",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
    gap: 14,
  },
  sheetTitle: { color: "#fafafa", fontSize: 21, fontWeight: "800" },
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
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#303030",
  },
  typeChipActive: { backgroundColor: "#115e59" },
  typeText: { color: "#e4e4e7", fontSize: 12 },
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
    backgroundColor: "#5eead4",
  },
  primaryText: { color: "#042f2e", fontWeight: "800" },
});
