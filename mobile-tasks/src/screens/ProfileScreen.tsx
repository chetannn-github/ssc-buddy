// @ts-nocheck
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, ScrollView as NativeScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { User } from "firebase/auth";

import { formatMinutes, summarizeTasks, type Task } from "../domain/tasks";
import { colors } from "../theme";
import { MockTestLogDialog, type MockTestLog } from "./MockTestLogDialog";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
import type { PracticeProfile } from "../lib/profile-store";
import { appendTrackerTest, watchTrackerSections, watchTrackerTests } from "../lib/firebase";

const ScrollView = (props: any) => <NativeScrollView {...props} scrollEventThrottle={16} onScroll={(event) => { if (!props.horizontal) reportVerticalScroll(event.nativeEvent.contentOffset.y); props.onScroll?.(event); }} />;

type Range = "today" | "week" | "lastMonth" | "year" | "all";
const ranges: Array<{ key: Range; label: string }> = [
  { key: "today", label: "Today" }, { key: "week", label: "This week" }, { key: "lastMonth", label: "Last month" }, { key: "year", label: "This year" }, { key: "all", label: "All time" },
];
const withinRange = (date: string, range: Range) => {
  if (range === "all") return true;
  const now = new Date(), start = new Date(now);
  if (range === "today") return date === now.toISOString().slice(0, 10);
  if (range === "week") start.setDate(now.getDate() - 6);
  if (range === "lastMonth") start.setMonth(now.getMonth() - 1);
  if (range === "year") start.setFullYear(now.getFullYear() - 1);
  return date >= start.toISOString().slice(0, 10) && date <= now.toISOString().slice(0, 10);
};
const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type Props = {
  user: User | null;
  tasks: Task[];
  profileSettings: PracticeProfile | null;
  onProfileSaved: (profile: PracticeProfile) => void;
  onLogout: () => void;
  onOpenVideo: () => void;
  onOpenMusic: () => void;
  onOpenTracker: (tab: "Syllabus" | "Revision" | "Mock Test") => void;
};

export function ProfileScreen({ user, tasks, profileSettings, onProfileSaved, onLogout, onOpenVideo, onOpenMusic, onOpenTracker }: Props) {
  const [profileName, setProfileName] = useState(profileSettings?.name ?? "");
  const [profileReady, setProfileReady] = useState(profileSettings !== null);
  const [examName, setExamName] = useState(profileSettings?.examName ?? "SSC CGL 2027");
  const [goal, setGoal] = useState(String(profileSettings?.questionGoal ?? 100));
  const [manifestation, setManifestation] = useState(profileSettings?.manifestation ?? "");
  const [editing, setEditing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const name = profileReady ? (profileName.trim() || user?.displayName?.trim() || user?.email?.split("@")[0] || "Student") : "";
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [viewingAvatar, setViewingAvatar] = useState(false);
  const [spin] = useState(() => new Animated.Value(0));
  const [loggingMockTest, setLoggingMockTest] = useState(false);
  const [mockTests, setMockTests] = useState<MockTestLog[]>([]);
  const [range, setRange] = useState<Range>("today");
  const [rangeOpen, setRangeOpen] = useState(false);
  const avatarImages = [
    require("../../assets/avatar-1.jpg"),
    require("../../assets/avatar-2.jpg"),
    require("../../assets/avatar-3.jpg"),
  ];
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const changeAvatar = () => {
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 560, useNativeDriver: true }).start();
    setAvatarIndex((current) => (current + 1) % avatarImages.length);
  };
  useEffect(() => {
    if (!profileSettings) setProfileReady(true);
    if (!user) return;
    return watchTrackerTests(user, (tests) => setMockTests(tests.map((test) => ({ ...test, type: test.type === "Mains" ? "Mains" : test.type === "Pre" ? "Pre" : "Sectional", subject: test.subjectId || "General", score: Number(test.score ?? 0), total: Number(test.total ?? 0), accuracy: Number(test.accuracy ?? 0) }))));
  }, [user?.uid]);
  useEffect(() => {
    if (!profileSettings) return;
    setProfileName(profileSettings.name); setExamName(profileSettings.examName ?? "SSC CGL 2027"); setGoal(String(profileSettings.questionGoal)); setManifestation(profileSettings.manifestation ?? ""); setProfileReady(true);
  }, [profileSettings]);
  const saveMockTest = (entry: MockTestLog) => {
    if (!user) return;
    void appendTrackerTest(user, { id: entry.id, date: entry.date, createdAt: entry.createdAt, subjectId: "", type: entry.type, score: entry.score, total: entry.total, accuracy: entry.accuracy, notes: "" }, entry.subject);
  };
  const filteredTasks = tasks.filter((task) => withinRange(task.date, range));
  const filteredSummary = summarizeTasks(filteredTasks);
  const practiceSessions = filteredTasks.filter((task) => task.type === "Practice Session").length;
  const lectures = filteredTasks.filter((task) => task.type === "Lecture").length;
  const revisions = filteredTasks.filter((task) => task.type === "Revision").length;
  const loggedMocks = mockTests.filter((test) => withinRange(test.date, range)).length;
  const activeRangeLabel = ranges.find((item) => item.key === range)?.label ?? "Today";
  const changeRange = (next: Range) => {
    setRange(next);
    setRangeOpen(false);
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: 16 }]} onScrollBeginDrag={() => setRangeOpen(false)}>
      <View style={styles.profileRow}>
        <View style={[styles.avatar, { width: 70, height: 70, borderRadius: 35 }]}><Pressable onPress={() => setViewingAvatar(true)}><Image source={avatarImages[avatarIndex]} style={[styles.avatarImage, { borderRadius: 35 }]} /></Pressable><Pressable style={[styles.avatarBadge, { width: 25, height: 25, borderRadius: 13 }]} accessibilityLabel="Change profile image" onPress={changeAvatar}><Animated.View style={{ transform: [{ rotate }] }}><MaterialCommunityIcons name="sync" size={12} color={colors.muted} /></Animated.View></Pressable></View>
        <View style={[styles.identity, { marginTop: 9 }]}>
          <Text style={styles.exam}>{examName}</Text>
          <View style={styles.nameLine}><Text style={styles.name} numberOfLines={1}>{name}</Text><Pressable accessibilityLabel="Edit profile" hitSlop={10} onPressIn={() => setEditing(true)}><MaterialCommunityIcons name="pencil-outline" size={17} color={colors.muted} /></Pressable><Pressable accessibilityLabel="Log out" hitSlop={10} onPress={() => setConfirmLogout(true)}><MaterialCommunityIcons name="logout" size={17} color={colors.muted} /></Pressable></View>
        </View>
      </View>

      <View style={[styles.actionRow, { marginTop: 11 }]}>
        <Pressable style={styles.action} onPress={() => setLoggingMockTest(true)}><MaterialCommunityIcons name="file-edit-outline" size={18} color={colors.text} /><Text style={styles.actionText}>Log mock test</Text></Pressable>
        <Pressable style={styles.action} onPress={onOpenVideo}><MaterialCommunityIcons name="play-outline" size={18} color={colors.text} /><Text style={styles.actionText}>Videos</Text></Pressable>
        <Pressable style={styles.action} onPress={onOpenMusic}><MaterialCommunityIcons name="music-note" size={18} color={colors.text} /><Text style={styles.actionText}>Music</Text></Pressable>
      </View>

      <View style={[styles.summaryCard, { position: "relative", marginTop: 16, paddingTop: 13 }]}>
        {rangeOpen && <Pressable accessibilityLabel="Close date range menu" style={{ position: "absolute", zIndex: 10, top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => setRangeOpen(false)} />}
        <View style={[styles.cardHeader, { elevation: 31 }]}><Text style={styles.cardEyebrow}>PRACTICE</Text><View style={[styles.rangeWrap, { elevation: 40 }]}><Pressable style={styles.rangeButton} onPressIn={() => setRangeOpen((value) => !value)}><Text style={styles.rangeText}>{activeRangeLabel}</Text><MaterialCommunityIcons name={rangeOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} /></Pressable>{rangeOpen && <View style={styles.rangeMenu}>{ranges.map((item) => <Pressable key={item.key} style={[styles.rangeOption, item.key === range && styles.rangeOptionActive]} onPress={() => changeRange(item.key)}><Text style={[styles.rangeOptionText, item.key === range && styles.rangeOptionTextActive]}>{item.label}</Text></Pressable>)}</View>}</View></View>
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
          <Stat label="Lectures" value={String(lectures)} />
          <Stat label="Revisions" value={String(revisions)} />
          <Stat lastColumn label="Mock tests" value={String(loggedMocks)} />
          <Stat lastRow label="Study time" value={formatMinutes(filteredSummary.minutes)} />
          <Stat lastColumn lastRow label="Tasks completed" value={String(filteredSummary.done)} />
          <Stat lastRow label="Incomplete tasks" value={String(filteredSummary.total - filteredSummary.done)} />
        </View>
      </View>
      <ActivityHeatmap user={user} mockTests={mockTests} />
      <StudyTrackerOverview tasks={tasks} mockTests={mockTests} onOpen={onOpenTracker} />
      <MockTestLogDialog visible={loggingMockTest} onClose={() => setLoggingMockTest(false)} onSave={saveMockTest} />
      <Modal transparent visible={viewingAvatar} animationType="fade" onRequestClose={() => setViewingAvatar(false)}><Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "rgba(0,0,0,.88)" }} onPress={() => setViewingAvatar(false)}><Pressable style={{ width: "100%", aspectRatio: 1, maxWidth: 330, overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: "#3f3f46", backgroundColor: "#1c1c1c" }} onPress={() => undefined}><Image source={avatarImages[avatarIndex]} style={{ width: "100%", height: "100%" }} /></Pressable></Pressable></Modal>
      <Modal transparent visible={confirmLogout} animationType="fade" onRequestClose={() => setConfirmLogout(false)}><Pressable style={styles.modalBackdrop} onPress={() => setConfirmLogout(false)}><Pressable style={styles.confirmDialog} onPress={() => undefined}><View style={styles.confirmHeader}><View style={styles.confirmIcon}><MaterialCommunityIcons name="logout" size={18} color="#fca5a5" /></View><Pressable hitSlop={10} onPress={() => setConfirmLogout(false)}><MaterialCommunityIcons name="close" size={20} color={colors.subdued} /></Pressable></View><Text style={styles.confirmTitle}>Sign out?</Text><Text style={styles.confirmCopy}>You can sign back in anytime.</Text><View style={styles.confirmActions}><Pressable style={styles.cancelButton} onPress={() => setConfirmLogout(false)}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable style={styles.logoutConfirm} onPress={onLogout}><Text style={styles.logoutConfirmText}>Sign out</Text></Pressable></View></Pressable></Pressable></Modal>
      <Modal transparent visible={editing} animationType="fade" onRequestClose={() => setEditing(false)}><Pressable style={styles.modalBackdrop} onPress={() => setEditing(false)}><Pressable style={styles.editDialog} onPress={() => undefined}><Text style={styles.editTitle}>Setup your profile</Text><EditField label="Your name" value={profileName} onChange={setProfileName} /><EditField label="Question goal" value={goal} onChange={(value) => setGoal(value.replace(/\D/g, ""))} numeric /><EditField label="Exam name" value={examName} onChange={setExamName} /><Text style={styles.editLabel}>DAILY MANIFESTATION (OPTIONAL)</Text><TextInput multiline value={manifestation} onChangeText={(value) => setManifestation(value.toUpperCase())} placeholder="Write the sentence you want to type daily" placeholderTextColor={colors.subdued} style={styles.manifestationInput} /><View style={styles.editActions}><Pressable onPress={() => setEditing(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable style={styles.saveProfile} onPress={() => { onProfileSaved({ name: profileName, examName, questionGoal: Number(goal) || 100, manifestation }); setEditing(false); }}><Text style={styles.saveProfileText}>Save profile</Text></Pressable></View></Pressable></Pressable></Modal>
    </ScrollView>
  );
}

function Stat({ label, value, columns = 3, lastColumn, lastRow }: { label: string; value: string; columns?: 2 | 3; lastColumn?: boolean; lastRow?: boolean }) {
  return <View style={[styles.stat, { paddingVertical: 8 }, columns === 2 && styles.statHalf, lastColumn && styles.statLastColumn, lastRow && styles.statLastRow]}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function ActivityHeatmap({ user, mockTests }: { user: User | null; mockTests: MockTestLog[] }) {
  const [selectedDay, setSelectedDay] = useState<string>(() => localDayKey(new Date()));
  const [trackerActivity, setTrackerActivity] = useState<Array<{ id: string; date: string; count: number; type?: string; subjectId?: string; chapterId?: string; revisionTypeId?: string }>>([]);
  const [trackerSubjects, setTrackerSubjects] = useState<Array<{ id: string; name: string; chapters?: Array<{ id: string; name: string }> }>>([]);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [heatmapReady, setHeatmapReady] = useState(false);
  const [scrollbarVisible, setScrollbarVisible] = useState(false);
  const heatmapRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user) { setTrackerActivity([]); return; }
    return watchTrackerSections(user, (sections) => {
      const entries = Array.isArray(sections.activity) ? sections.activity : [];
      setTrackerSubjects(Array.isArray(sections.subjects) ? sections.subjects : []);
      setTrackerActivity(entries.filter((entry: any) => entry && typeof entry.date === "string").map((entry: any, index: number) => ({
        id: String(entry.id ?? `${entry.date}-${index}`), date: entry.date, count: Math.max(1, Number(entry.count) || 1), type: entry.type,
        subjectId: entry.subjectId, chapterId: entry.chapterId, revisionTypeId: entry.revisionTypeId,
      })));
    });
  }, [user?.uid]);
  const { months, total, activeDays, streak, activity } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const counts = new Map<string, number>();
    // Match web: Daily Tasks are intentionally not heatmap activities.
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
  }, [mockTests, trackerActivity]);
  const max = Math.max(1, ...[...activity.values()]);
  const selected = activity.get(selectedDay) ?? 0;
  const activityRows = useMemo(() => {
    const subjectName = (subjectId?: string) => trackerSubjects.find((subject) => subject.id === subjectId)?.name;
    const chapterName = (subjectId?: string, chapterId?: string) => trackerSubjects.find((subject) => subject.id === subjectId)?.chapters?.find((chapter) => chapter.id === chapterId)?.name;
    const mockRows = mockTests.filter((test) => test.date === selectedDay).map((test) => ({
      id: `mock-${test.id}`, title: `${test.type} mock test`, detail: `${test.subject || "General"} · ${test.score}/${test.total}`,
    }));
    const trackerRows = trackerActivity.filter((entry) => entry.date === selectedDay).map((entry) => {
      const subject = subjectName(entry.subjectId);
      const chapter = chapterName(entry.subjectId, entry.chapterId);
      const isRevision = entry.type === "revision";
      const isMock = entry.type === "mock-test";
      return {
        id: `tracker-${entry.id}`,
        title: isRevision ? `${entry.count} revision${entry.count === 1 ? "" : "s"} completed` : isMock ? `${entry.count} mock test${entry.count === 1 ? "" : "s"} logged` : `${entry.count} lecture${entry.count === 1 ? "" : "s"} completed`,
        detail: [subject, chapter].filter(Boolean).join(" · ") || "Study tracker",
      };
    });
    return [...trackerRows, ...mockRows];
  }, [mockTests, selectedDay, trackerActivity, trackerSubjects]);
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
      {activityRows.length ? activityRows.map((row) => <View key={row.id} style={styles.activityRow}><View style={styles.activityCopy}><Text numberOfLines={1} style={styles.activityTitle}>{row.title}</Text><Text numberOfLines={1} style={styles.activityMeta}>{row.detail}</Text></View></View>) : <Text style={styles.noActivity}>No activity recorded on this day.</Text>}
    </View>
  </View>;
}

function StudyTrackerOverview({ tasks, mockTests, onOpen }: { tasks: Task[]; mockTests: MockTestLog[]; onOpen: (tab: "Syllabus" | "Revision" | "Mock Test") => void }) {
  const subjects = useMemo(() => {
    const names = [...new Set(tasks.map((task) => task.subject).filter(Boolean))];
    return names.length ? names.slice(0, 5) : ["English", "Maths", "Reasoning", "GK"];
  }, [tasks]);
  const rows = (kind: "Lecture" | "Revision" | "mock") => subjects.map((subject) => {
    const source = kind === "mock" ? mockTests.filter((test) => test.subject === subject) : tasks.filter((task) => task.subject === subject && task.type === kind);
    const completed = kind === "mock" ? source.length : (source as Task[]).filter((task) => task.completed).length;
    return { subject, completed, total: source.length };
  });
  const syllabus = rows("Lecture");
  const revision = rows("Revision");
  const mocks = rows("mock");
  const totalLectures = syllabus.reduce((sum, item) => sum + item.total, 0);
  const doneLectures = syllabus.reduce((sum, item) => sum + item.completed, 0);
  return <View style={styles.trackerOverview}>
    <View style={styles.trackerHeading}><View><Text style={styles.cardEyebrow}>STUDY TRACKER</Text><Text style={styles.trackerTitle}>SSC CGL 2027</Text></View><Text style={styles.trackerCount}>{doneLectures}/{totalLectures} lectures</Text></View>
    <TrackerCard title="Syllabus" subtitle={`${totalLectures ? Math.round((doneLectures / totalLectures) * 100) : 0}% complete`} rows={syllabus} tone="#60a5fa" onPress={() => onOpen("Syllabus")} />
    <TrackerCard title="Revision" subtitle="By subject" rows={revision} tone="#34d399" onPress={() => onOpen("Revision")} />
    <TrackerCard title="Mock tests" subtitle="Practice progress" rows={mocks} tone="#a78bfa" onPress={() => onOpen("Mock Test")} />
  </View>;
}

function TrackerCard({ title, subtitle, rows, tone, onPress }: { title: string; subtitle: string; rows: Array<{ subject: string; completed: number; total: number }>; tone: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.trackerCard}><View style={styles.trackerCardTop}><View><Text style={styles.trackerCardLabel}>{title}</Text><Text style={styles.trackerCardTitle}>{subtitle}</Text></View><MaterialCommunityIcons name="chevron-right" size={19} color={colors.subdued} /></View>{rows.map((row) => <View key={row.subject} style={styles.trackerRow}><Text style={styles.trackerRowName} numberOfLines={1}>{row.subject}</Text><View style={styles.trackerBar}><View style={[styles.trackerBarFill, { backgroundColor: tone, width: `${row.total ? (row.completed / row.total) * 100 : 0}%` }]} /></View><Text style={styles.trackerRowCount}>{row.completed}/{row.total}</Text></View>)}</Pressable>;
}

function EditField({ label, value, onChange, numeric }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean }) { return <View><Text style={styles.editLabel}>{label.toUpperCase()}</Text><TextInput value={value} onChangeText={onChange} keyboardType={numeric ? "number-pad" : "default"} placeholderTextColor={colors.subdued} style={styles.editInput} /></View>; }

const styles: Record<string, any> = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 11, paddingTop: 24, paddingBottom: 36 },
  profileRow: { alignItems: "center" },
  avatar: { position: "relative", width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }, avatarImage: { width: "100%", height: "100%", borderRadius: 42 }, avatarBadge: { position: "absolute", right: -2, bottom: -2, width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#202020", borderWidth: 1, borderColor: colors.border },
  identity: { alignItems: "center", marginTop: 12 }, exam: { color: colors.subdued, fontSize: 10, fontWeight: "700", letterSpacing: 2.2 }, nameLine: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 }, name: { color: colors.text, fontSize: 21, fontWeight: "700" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11, marginTop: 19 }, action: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8 }, actionText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  summaryCard: { marginTop: 27, overflow: "visible", borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingTop: 16 }, cardHeader: { zIndex: 30, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16 }, cardEyebrow: { color: "#a1a1aa", fontSize: 10, fontWeight: "700", letterSpacing: 1.6 }, trackerEyebrow: { paddingHorizontal: 16, paddingTop: 17 }, rangeWrap: { position: "relative", zIndex: 40 }, rangeButton: { height: 29, flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 9, paddingHorizontal: 8, backgroundColor: "#292929" }, rangeText: { color: colors.text, fontSize: 11, fontWeight: "700" }, rangeMenu: { position: "absolute", top: 34, right: 0, minWidth: 124, overflow: "hidden", borderRadius: 11, paddingVertical: 3, backgroundColor: "#292929", borderWidth: 1, borderColor: colors.border, elevation: 30, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }, rangeOption: { paddingHorizontal: 11, paddingVertical: 8 }, rangeOptionActive: { backgroundColor: "#3b3b3b" }, rangeOptionText: { color: colors.muted, fontSize: 12 }, rangeOptionTextActive: { color: colors.text, fontWeight: "800" }, practiceGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 10 }, trackerGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 11 }, stat: { width: "33.333%", alignItems: "center", paddingVertical: 10, paddingHorizontal: 3, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border }, statHalf: { width: "50%" }, statLastColumn: { borderRightWidth: 0 }, statLastRow: { borderBottomWidth: 0 }, statValue: { color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" }, statLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 4, textAlign: "center" }, divider: { height: 1, backgroundColor: colors.border },
  heatmapSection: { marginTop: 20, paddingTop: 2 }, heatmapPending: { opacity: 0 }, heatmapHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }, heatmapFacts: { flexDirection: "row", gap: 12 }, heatmapMuted: { color: colors.muted, fontSize: 10 }, heatmapNumber: { color: colors.text, fontWeight: "800" }, heatmapScroll: { marginTop: 12 }, months: { gap: 10, paddingBottom: 4 }, month: { width: 58 }, monthGrid: { height: 63, flexDirection: "column", flexWrap: "wrap", alignContent: "flex-start", gap: 3 }, heatCell: { width: 8, height: 8, borderRadius: 2 }, heatSelected: { borderWidth: 1, borderColor: "#fff", transform: [{ scale: 1.15 }] }, monthLabel: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 7 }, heatScrollbar: { height: 3, overflow: "hidden", marginTop: 2, borderRadius: 2, backgroundColor: "#303030" }, heatScrollbarThumb: { height: "100%", borderRadius: 2, backgroundColor: "#777782" }, heatDetail: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, borderRadius: 9, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,.04)" }, heatDetailDate: { color: colors.text, fontSize: 11, fontWeight: "700" }, activityList: { marginTop: 8, overflow: "hidden", borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,.025)" }, activityRow: { minHeight: 43, justifyContent: "center", paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, activityCopy: { minWidth: 0 }, activityTitle: { color: colors.text, fontSize: 12, fontWeight: "700" }, activityMeta: { marginTop: 2, color: colors.muted, fontSize: 10 }, noActivity: { paddingVertical: 17, paddingHorizontal: 12, color: colors.muted, fontSize: 12, textAlign: "center" },
  trackerOverview: { marginTop: 24, borderTopWidth: 1, borderColor: colors.border, paddingTop: 19 }, trackerHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }, trackerTitle: { color: colors.text, fontSize: 19, fontWeight: "800", marginTop: 4 }, trackerCount: { color: colors.muted, fontSize: 11, fontFamily: "monospace" }, trackerCard: { marginTop: 9, borderRadius: 15, padding: 14, backgroundColor: "rgba(255,255,255,.025)", borderWidth: 1, borderColor: colors.border }, trackerCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }, trackerCardLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" }, trackerCardTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 3 }, trackerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 }, trackerRowName: { width: 68, color: "#d4d4d8", fontSize: 11 }, trackerBar: { flex: 1, height: 5, overflow: "hidden", borderRadius: 4, backgroundColor: "#303030" }, trackerBarFill: { height: "100%", borderRadius: 4 }, trackerRowCount: { width: 31, color: colors.muted, fontSize: 10, textAlign: "right" },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,.70)" }, editDialog: { borderRadius: 21, padding: 20, gap: 14, backgroundColor: "#202020", borderWidth: 1, borderColor: colors.border }, editTitle: { color: colors.text, fontSize: 21, fontWeight: "800", marginBottom: 4 }, editLabel: { color: colors.subdued, fontSize: 10, letterSpacing: 1.3, fontWeight: "800", marginBottom: 7 }, editInput: { height: 46, borderRadius: 12, paddingHorizontal: 13, color: colors.text, backgroundColor: "#151515", borderWidth: 1, borderColor: "#3f3f46" }, manifestationInput: { minHeight: 82, borderRadius: 12, padding: 13, color: colors.text, backgroundColor: "#151515", borderWidth: 1, borderColor: "#3f3f46", textAlignVertical: "top" }, editActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 18, marginTop: 3 }, cancel: { color: "#d4d4d8", fontWeight: "700" }, saveProfile: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.accent }, saveProfileText: { color: colors.accentDeep, fontWeight: "800" },
  confirmDialog: { borderRadius: 20, padding: 18, backgroundColor: "#1d1d1d", borderWidth: 1, borderColor: "#353535" }, confirmHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, confirmIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "rgba(244,63,94,.12)" }, confirmTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 15 }, confirmCopy: { color: colors.muted, fontSize: 13, marginTop: 5 }, confirmActions: { flexDirection: "row", gap: 9, marginTop: 20 }, cancelButton: { flex: 1, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#2b2b2b" }, cancelButtonText: { color: "#e4e4e7", fontSize: 13, fontWeight: "700" }, logoutConfirm: { flex: 1, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#e11d48" }, logoutConfirmText: { color: "#fff1f2", fontSize: 13, fontWeight: "800" },
});
