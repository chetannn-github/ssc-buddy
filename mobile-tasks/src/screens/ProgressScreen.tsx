import { createThemedStyles } from "../theme";
import { DropdownChevron } from "../components/DropdownChevron";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, BackHandler, Easing, Modal, Pressable, ScrollView as NativeScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { MockTestLogDialog, type MockTestLog } from "./MockTestLogDialog";
import { colors } from "../theme";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
import type { User } from "firebase/auth";
import { appendTrackerTest, deleteTrackerTest, watchTrackerSections, watchTrackerTests } from "../lib/firebase";

const ScrollView = (props: any) => <NativeScrollView {...props} scrollEventThrottle={16} onScroll={(event) => { if (!props.horizontal) reportVerticalScroll(event.nativeEvent.contentOffset.y, event.nativeEvent); props.onScroll?.(event); }} />;

type Category = MockTestLog["type"];
const categories: Category[] = ["Sectional", "Pre", "Mains"];

export function ProgressScreen({ user, onBack }: { user: User | null; onBack?: () => void }) {
  useEffect(() => {
    if (!onBack) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { onBack(); return true; });
    return () => subscription.remove();
  }, [onBack]);
  const [tests, setTests] = useState<MockTestLog[]>([]);
  const [trackerSubjects, setTrackerSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [category, setCategory] = useState<Category>("Sectional");
  const [subject, setSubject] = useState("all");
  const [menu, setMenu] = useState<"category" | "subject" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loggingMockTest, setLoggingMockTest] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(!user);
  useEffect(() => {
    if (!user) { setTests([]); setProgressLoaded(true); return; }
    setProgressLoaded(false);
    const stopTests = watchTrackerTests(user, (records) => { setTests(records.map((test) => ({ ...test, type: test.type === "Mains" ? "Mains" : test.type === "Pre" ? "Pre" : "Sectional", subject: test.subjectId || "General", score: Number(test.score ?? 0), total: Number(test.total ?? 0), accuracy: Number(test.accuracy ?? 0) }))); setProgressLoaded(true); });
    const stopSubjects = watchTrackerSections(user, (sections) => setTrackerSubjects(
      Array.isArray(sections.subjects) ? sections.subjects.map((subject: any) => ({ id: String(subject.id ?? ""), name: String(subject.name ?? "") })) : [],
    ));
    return () => { stopTests(); stopSubjects(); };
  }, [user?.uid]);
  const displayTests = useMemo(() => tests.map((test) => ({
    ...test,
    subject: trackerSubjects.find((item) => item.id === test.subject)?.name ?? (test.subject || "General"),
  })), [tests, trackerSubjects]);
  const subjects = [...new Set(displayTests.filter((test) => test.type === "Sectional").map((test) => test.subject))];
  const filtered = displayTests.filter((test) => test.type === category && (category !== "Sectional" || subject === "all" || test.subject === subject)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const summary = useMemo(() => {
    const scores = filtered.map((test) => test.score), accuracy = filtered.map((test) => test.accuracy);
    return { high: scores.length ? Math.max(...scores) : 0, low: scores.length ? Math.min(...scores) : 0, average: scores.length ? (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1) : "0", accuracy: accuracy.length ? (accuracy.reduce((sum, value) => sum + value, 0) / accuracy.length).toFixed(1) : "0" };
  }, [filtered]);
  const choose = (next: Category) => { setCategory(next); setSubject("all"); setMenu(null); };
  const removeTest = (id: string) => { if (user) void deleteTrackerTest(user, id); };
  const saveMockTest = (entry: MockTestLog) => {
    if (!user) return;
    void appendTrackerTest(user, { id: entry.id, date: entry.date, createdAt: entry.createdAt, subjectId: "", type: entry.type, score: entry.score, total: entry.total, accuracy: entry.accuracy, notes: "" }, entry.subject);
  };
  if (!progressLoaded) return <View style={s.page}><View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="small" color={colors.accent} /></View></View>;
  return <View style={s.page}>
    {menu && <Pressable accessibilityLabel="Close filters" style={s.dismissLayer} onPress={() => setMenu(null)} />}
    <View style={s.header}><Pressable accessibilityLabel="Close filters" style={s.headerDismiss} onPress={() => setMenu(null)} /><Text style={s.eyebrow}>MOCK TEST ANALYSIS</Text><View style={s.titleRow}><View style={{ zIndex: 2, flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>{onBack && <Pressable accessibilityRole="button" accessibilityLabel="Back to Mock Test" onPress={onBack} hitSlop={8} style={{ padding: 4 }}><MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} /></Pressable>}<Text style={s.title}>Analysis</Text></View><Pressable onPress={() => setLoggingMockTest(true)} style={s.logButton}><MaterialCommunityIcons name="file-edit-outline" size={15} color={colors.text} /><Text style={s.logButtonText}>Log mock test</Text></Pressable></View><View style={s.filters}>
      <Filter label={category} selectedValue={category} open={menu === "category"} onPress={() => setMenu(menu === "category" ? null : "category")}>{categories.map((item) => <Pressable key={item} onPress={() => choose(item)} style={s.menuItem}><Text style={s.menuText}>{item}</Text></Pressable>)}</Filter>
      <Filter label={category === "Sectional" ? (subject === "all" ? "All subjects" : subject) : "All subjects"} selectedValue={category === "Sectional" ? (subject === "all" ? "All subjects" : subject) : "All subjects"} disabled={category !== "Sectional"} open={menu === "subject"} onPress={() => setMenu(menu === "subject" ? null : "subject")}>{["all", ...subjects].map((item) => <Pressable key={item} onPress={() => { setSubject(item); setMenu(null); }} style={s.menuItem}><Text style={s.menuText}>{item === "all" ? "All subjects" : item}</Text></Pressable>)}</Filter>
    </View></View>
    <ScrollView contentContainerStyle={s.content} onScrollBeginDrag={() => setMenu(null)}>
      {filtered.length ? <><View style={s.stats}><Metric label="Tests" value={String(filtered.length)} /><Metric label="Highest" value={String(summary.high)} suffix="marks" /><Metric label="Lowest" value={String(summary.low)} suffix="marks" /><Metric label="Average" value={summary.average} suffix="marks" /><Metric label="Avg. accuracy" value={summary.accuracy} suffix="%" /></View><Chart title="Marks trend" tests={filtered} metric="marks" color={colors.accent} category={category} /><Chart title="Accuracy trend" tests={filtered} metric="accuracy" color="#34d399" category={category} /><View style={s.history}><View style={s.historyHeader}><View><Text style={s.historyTitle}>Recent tests</Text><Text style={s.historyCount}>Latest {Math.min(5, filtered.length)} of {filtered.length}</Text></View><Pressable onPress={() => setShowAll(true)} style={s.allButton}><Text style={s.allButtonText}>All tests</Text><MaterialCommunityIcons name="arrow-right" size={15} color="#a5b4fc" /></Pressable></View>{[...filtered].reverse().slice(0, 5).map((test) => <TestRow key={test.id} test={test} category={category} />)}</View></> : <View style={s.empty}><MaterialCommunityIcons name="chart-line-variant" size={32} color={colors.subdued} /><Text style={s.emptyTitle}>No {category.toLowerCase()} tests yet</Text><Text style={s.emptyCopy}>Use Log mock test above to add your first result.</Text></View>}
    </ScrollView>
    <AllTestsModal visible={showAll} tests={displayTests} onClose={() => setShowAll(false)} onDelete={removeTest} />
    <MockTestLogDialog visible={loggingMockTest} subjects={trackerSubjects.map((item) => item.name)} onClose={() => setLoggingMockTest(false)} onSave={saveMockTest} />
  </View>;
}
function AllTestsModal({ visible, tests, onClose, onDelete }: { visible: boolean; tests: MockTestLog[]; onClose: () => void; onDelete: (id: string) => void }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><View style={s.allPage}><View style={s.allHeader}><View><Text style={s.eyebrow}>COMPLETE HISTORY</Text><Text style={s.title}>All tests</Text></View><Pressable style={s.closeButton} onPress={onClose}><MaterialCommunityIcons name="close" size={20} color={colors.text} /></Pressable></View><ScrollView contentContainerStyle={s.allList}>{[...tests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((test) => <View key={test.id} style={s.allRow}><View style={{ flex: 1 }}><Text style={s.testDate}>{new Date(test.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text><Text style={s.testSubject}>{test.type === "Sectional" ? test.subject : test.type} · {test.type}</Text></View><View style={s.testResult}><Text style={s.testMarks}>{test.score}/{test.total}</Text><Text style={s.testAccuracy}>{test.accuracy}%</Text></View><Pressable hitSlop={10} onPress={() => onDelete(test.id)} style={s.delete}><MaterialCommunityIcons name="trash-can-outline" size={19} color="#f87171" /></Pressable></View>)}{!tests.length && <View style={s.empty}><Text style={s.emptyTitle}>No tests yet</Text></View>}</ScrollView></View></Modal>;
}
function Filter({ label, selectedValue, open, disabled, onPress, children }: { label: string; selectedValue: string; open: boolean; disabled?: boolean; onPress: () => void; children: ReactNode }) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    if (mounted) Animated.timing(progress, { toValue: 0, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
  }, [mounted, open, progress]);
  const options = (Array.isArray(children) ? children : [children]).map((child: any) => {
    if (!child) return child;
    const selected = child.props.children?.props?.children === selectedValue;
    return { ...child, props: { ...child.props, style: [s.menuItem, selected && s.menuItemSelected], children: <><Text style={[s.menuText, selected && s.menuTextSelected]}>{child.props.children?.props?.children}</Text>{selected && <MaterialCommunityIcons name="check" size={16} color="#171717" />}</> } };
  });
  return <View style={s.filterWrap}><Pressable disabled={disabled} onPress={onPress} style={[s.filter, disabled && s.disabled]}><Text style={s.filterText} numberOfLines={1}>{label}</Text><DropdownChevron open={open} size={16} color={colors.muted} /></Pressable>{mounted && <Animated.View style={[s.menu, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-7, 0] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>{options}</Animated.View>}</View>;
}
function Metric({ label, value, suffix }: { label: string; value: string; suffix?: string }) { return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}<Text style={s.metricSuffix}>{suffix ? ` ${suffix}` : ""}</Text></Text></View>; }
function TestRow({ test, category }: { test: MockTestLog; category: Category }) { return <View style={s.testRow}><View style={{ flex: 1 }}><Text style={s.testDate}>{new Date(test.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text><Text style={s.testSubject}>{category === "Sectional" ? test.subject : category}</Text></View><View style={s.testResult}><Text style={s.testMarks}>{test.score}/{test.total}</Text><Text style={s.testAccuracy}>{test.accuracy}%</Text></View></View>; }
function Chart({ title, tests, metric, color, category }: { title: string; tests: MockTestLog[]; metric: "marks" | "accuracy"; color: string; category: Category }) {
  const [selected, setSelected] = useState<number | null>(tests.length ? tests.length - 1 : null), data = tests.map((test) => metric === "marks" ? test.score : test.accuracy);
  useEffect(() => { setSelected(tests.length ? tests.length - 1 : null); }, [tests.length]);
  const width = 330, height = 168, left = 34, right = 14, top = 12, bottom = 25, max = Math.max(1, ...data), middle = Math.round(max / 2);
  const points = data.map((value, index) => ({ x: left + index * ((width - left - right) / Math.max(1, data.length - 1)), y: height - bottom - (value / max) * (height - top - bottom) }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" "), item = selected === null ? null : tests[selected];
  return <View style={s.chart}><Text style={s.chartTitle}>{title}</Text><View style={s.chartBody}><View style={s.yLabels}><Text style={s.yLabel}>{max}{metric === "accuracy" ? "%" : ""}</Text><Text style={s.yLabel}>{middle}{metric === "accuracy" ? "%" : ""}</Text><Text style={s.yLabel}>0</Text></View><Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}><Line x1={left} y1={top} x2={width - right} y2={top} stroke="#2d2d2d" strokeWidth="1" /><Line x1={left} y1={height / 2} x2={width - right} y2={height / 2} stroke="#2d2d2d" strokeWidth="1" /><Line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="#373737" strokeWidth="1" /><Path d={path} fill="none" stroke={color} strokeWidth="2.5" />{points.map((point, index) => <Circle key={`dot-${index}`} cx={point.x} cy={point.y} r={selected === index ? "6" : "4"} fill={color} />)}{points.map((point, index) => <Circle key={`hit-${index}`} onPress={() => setSelected(index)} cx={point.x} cy={point.y} r="14" fill="transparent" />)}</Svg></View><View style={s.chartLabels}>{data.map((_, index) => <Pressable key={index} hitSlop={8} onPress={() => setSelected(index)}><Text style={[s.chartLabel, selected === index && { color }]}>Test {index + 1}</Text></Pressable>)}</View>{item && <Pressable onPress={() => setSelected(null)} style={s.tooltip}><View style={s.tooltipHeader}><Text style={s.tooltipTitle}>Test {(selected ?? 0) + 1}</Text><Text style={s.tooltipDate}>{new Date(item.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text></View><Text style={s.tooltipSubject}>{category === "Sectional" ? item.subject : category} · {category}</Text><View style={s.tooltipStats}><View><Text style={s.tooltipLabel}>{metric === "marks" ? "MARKS" : "ACCURACY"}</Text><Text style={[s.tooltipValue, { color }]}>{metric === "marks" ? item.score : item.accuracy}{metric === "accuracy" ? "%" : " marks"}</Text></View><View><Text style={s.tooltipLabel}>FULL RESULT</Text><Text style={s.tooltipResult}>{item.score}/{item.total} · {item.accuracy}%</Text></View></View></Pressable>}</View>;
}
const s = createThemedStyles({
  page: { flex: 1, backgroundColor: colors.background }, dismissLayer: { position: "absolute", zIndex: 10, top: 0, right: 0, bottom: 0, left: 0 }, header: { zIndex: 20, padding: 20, paddingBottom: 13 }, headerDismiss: { position: "absolute", zIndex: 1, top: 0, right: 0, bottom: 0, left: 0 }, eyebrow: { color: "#818cf8", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 }, titleRow: { zIndex: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }, title: { color: colors.text, fontSize: 25, fontWeight: "800" }, logButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: "#252525" }, logButtonText: { color: colors.text, fontSize: 10, fontWeight: "700" }, filters: { flexDirection: "row", gap: 8, marginTop: 16, zIndex: 30 }, filterWrap: { flex: 1, position: "relative", zIndex: 30 }, filter: { height: 37, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4, borderRadius: 11, paddingHorizontal: 10, backgroundColor: "#252525" }, filterText: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "700" }, menu: { position: "absolute", top: 42, left: 0, right: 0, overflow: "hidden", borderRadius: 12, backgroundColor: "#282828", borderWidth: 1, borderColor: "#414141", elevation: 20 }, menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 }, menuItemSelected: { backgroundColor: "#f4f4f5" }, menuText: { color: "#e4e4e7", fontSize: 12 }, menuTextSelected: { color: "#171717", fontWeight: "700" },
  content: { padding: 20, paddingTop: 5, gap: 13, paddingBottom: 70 }, stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { width: "31.5%", minHeight: 72, borderRadius: 14, padding: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, metricLabel: { color: colors.muted, fontSize: 10 }, metricValue: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 7 }, metricSuffix: { color: colors.subdued, fontSize: 10, fontWeight: "600" }, chart: { borderRadius: 17, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, chartTitle: { color: colors.text, fontSize: 15, fontWeight: "800" }, chartBody: { flexDirection: "row", alignItems: "stretch", marginTop: 9 }, yLabels: { width: 29, justifyContent: "space-between", paddingVertical: 11 }, yLabel: { color: colors.subdued, fontSize: 9, textAlign: "right" }, chartLabels: { flexDirection: "row", justifyContent: "space-between", marginLeft: 37, marginRight: 14 }, chartLabel: { color: colors.subdued, fontSize: 10 },
  tooltip: { marginTop: 15, borderRadius: 12, padding: 12, backgroundColor: "#202020", borderWidth: 1, borderColor: "#3a3a3a" }, tooltipHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, tooltipTitle: { color: colors.text, fontSize: 12, fontWeight: "800" }, tooltipDate: { color: colors.subdued, fontSize: 10 }, tooltipSubject: { color: colors.muted, fontSize: 11, marginTop: 5 }, tooltipStats: { flexDirection: "row", gap: 30, borderTopWidth: 1, borderColor: "#383838", paddingTop: 10, marginTop: 10 }, tooltipLabel: { color: colors.subdued, fontSize: 9, letterSpacing: 0.8, fontWeight: "800" }, tooltipValue: { fontSize: 14, fontWeight: "800", marginTop: 3 }, tooltipResult: { color: "#e4e4e7", fontSize: 13, fontWeight: "800", marginTop: 3 },
  history: { overflow: "hidden", borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderColor: colors.border }, historyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" }, historyCount: { color: colors.muted, fontSize: 11, marginTop: 3 }, allButton: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 6, paddingLeft: 8 }, allButtonText: { color: "#a5b4fc", fontSize: 12, fontWeight: "800" }, testRow: { minHeight: 59, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderColor: "rgba(255,255,255,.05)" }, testDate: { color: colors.text, fontSize: 13, fontWeight: "700" }, testSubject: { color: colors.muted, fontSize: 11, marginTop: 4 }, testResult: { alignItems: "flex-end" }, testMarks: { color: colors.text, fontSize: 13, fontWeight: "700" }, testAccuracy: { color: colors.accent, fontSize: 11, marginTop: 4 }, empty: { alignItems: "center", borderRadius: 17, padding: 36, backgroundColor: colors.surface, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }, emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 11 }, emptyCopy: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 5 }, disabled: { opacity: 0.4 },
  allPage: { flex: 1, backgroundColor: colors.background }, allHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderColor: colors.border }, closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: "#282828" }, allList: { padding: 16, gap: 8, paddingBottom: 50 }, allRow: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, delete: { marginLeft: 15, padding: 6 },
});
