import { ChapterReorderList } from "../components/ChapterReorderList";
import { FavouriteStar } from "../components/FavouriteStar";
import { PinnedChapterGrid } from "../components/PinnedChapterGrid";
import { DestructiveDialog } from "../components/DestructiveDialog";
import { UppercaseTextInput as TextInput } from "../components/UppercaseTextInput";
import { createThemedStyles } from "../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import { NumberFlow } from "number-flow-react-native";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView as NativeScrollView, StyleSheet, Text, View } from "react-native";

import { MockTestLogDialog, type MockTestLog } from "./MockTestLogDialog";
import { LiquidProgressBar } from "../components/ProfileXpBar";
import { colors } from "../theme";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
import { migrateTrackerSections, syncTrackerSections, watchTrackerSections } from "../lib/firebase";

const ScrollView = (props: { [key: string]: any; onTouchStart?: (event: any) => void; onTouchEnd?: (event: any) => void }) => <NativeScrollView {...props} scrollEventThrottle={16} onScroll={(event) => { if (!props.horizontal) reportVerticalScroll(event.nativeEvent.contentOffset.y, event.nativeEvent); props.onScroll?.(event); }} />;

type Chapter = { id: string; name: string; total: number; completed: number };
type Subject = { id: string; name: string; target: number; chapters: Chapter[] };
type RevisionType = { id: string; name: string; target: number };
type Revision = { types: RevisionType[]; done: Record<string, Record<string, number>>; targets: Record<string, Record<string, number>> };
type TrackerActivityType = "lecture" | "revision" | "mock-test";
type TrackerActivity = { id: string; date: string; type: TrackerActivityType; count: number; subjectId?: string; chapterId?: string; revisionTypeId?: string };
type Data = { version: 1; subjects: Subject[]; revision: Record<string, Revision>; fullMockTargets: { pre: number; mains: number }; pinnedChapterIds: string[]; activity: TrackerActivity[] };
type ImportedSubject = Pick<Subject, "id" | "name" | "chapters">;
type Tab = "Syllabus" | "Revision" | "Mock Test";
const TRACK_TABS: Tab[] = ["Syllabus", "Revision", "Mock Test"];
const STORE = "ssc-buddy-mobile:tracker:v1";
const MOCK_STORE = "ssc-buddy-mobile:mock-tests:v1";
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const defaults: Data = { version: 1, pinnedChapterIds: [], fullMockTargets: { pre: 0, mains: 0 }, revision: {}, activity: [], subjects: [] };

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
    const chapters = subject.chapters.map((item, chapterIndex) => {
      const chapter = item as { id?: unknown; name?: unknown; total?: unknown; completed?: unknown };
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

function normalise(raw: unknown): Data {
  type OldChapter = Partial<Chapter> & { done?: boolean; revisions?: number };
  type OldSubject = { id?: string; name?: string; target?: number; chapters?: OldChapter[] };
  const old = raw as Partial<Omit<Data, "subjects">> & { subjects?: OldSubject[] };
  if (!old?.subjects?.length) return defaults;
  const subjects = old.subjects.map((subject, si) => ({ id: subject.id || `subject-${si}`, name: subject.name || "Subject", target: Number(subject.target) || 10, chapters: (subject.chapters || []).map((chapter, ci) => { const total = Math.max(1, Number(chapter.total) || 10); return { id: chapter.id || `chapter-${si}-${ci}`, name: chapter.name || "Untitled chapter", total, completed: Math.min(total, Math.max(0, Number(chapter.completed) || (chapter.done ? total : 0))) }; }) }));
  const revision = old.revision || {};
  subjects.forEach((subject) => { if (!revision[subject.id]) { const source = old.subjects?.find((x) => x.id === subject.id); revision[subject.id] = { types: [{ id: "revision-1", name: "Revision", target: 1 }], done: Object.fromEntries(subject.chapters.map((chapter) => [chapter.id, { "revision-1": Math.min(1, Number(source?.chapters?.find((x) => x.id === chapter.id)?.revisions) || 0) }])), targets: {} }; } });
  const safeRevision = Object.fromEntries(Object.entries(revision).map(([subjectId, value]) => [subjectId, {
    types: Array.isArray(value?.types) ? value.types : [],
    done: value?.done && typeof value.done === "object" ? value.done : {},
    targets: value?.targets && typeof value.targets === "object" ? value.targets : {},
  }]));
  const activity = Array.isArray(old.activity) ? old.activity.filter((entry): entry is TrackerActivity => !!entry && typeof entry === "object" && (entry.type === "lecture" || entry.type === "revision" || entry.type === "mock-test")).map((entry) => ({
    id: String(entry.id || id()), date: String(entry.date || ""), type: entry.type, count: Number(entry.count) || 1,
    ...(entry.subjectId ? { subjectId: String(entry.subjectId) } : {}), ...(entry.chapterId ? { chapterId: String(entry.chapterId) } : {}), ...(entry.revisionTypeId ? { revisionTypeId: String(entry.revisionTypeId) } : {}),
  })) : [];
  return { version: 1, subjects, revision: safeRevision, fullMockTargets: old.fullMockTargets || defaults.fullMockTargets, pinnedChapterIds: old.pinnedChapterIds || [], activity };
}
const pct = (done: number, total: number) => total ? Math.round(Math.min(done, total) / total * 100) : 0;
const exactPct = (done: number, total: number) => total ? Math.min(done, total) / total * 100 : 0;

export function TrackScreen({ initialTab, user, examName, onOpenAnalysis }: { initialTab?: Tab; user: any; examName?: string; onOpenAnalysis?: () => void }) {
  const [data, setData] = useState<Data>(defaults); const [mocks, setMocks] = useState<MockTestLog[]>([]); const [tab, setTabState] = useState<Tab>(initialTab ?? "Syllabus"); const [filter, setFilter] = useState("all"); const [openSubjects, setOpenSubjects] = useState<string[]>([]);
  const [trackerLoaded, setTrackerLoaded] = useState(false); const dataRef = useRef(data); const mocksRef = useRef(mocks);
  const [selected, setSelected] = useState<{ subjectId: string; chapterId: string } | null>(null); const [editingChapter, setEditingChapter] = useState(false); const [dialog, setDialog] = useState<"subject" | "chapter" | "revision" | null>(null); const [dialogSubjectId, setDialogSubjectId] = useState<string | null>(null); const [mockDialog, setMockDialog] = useState(false); const [deleteConfirm, setDeleteConfirm] = useState(false); const [name, setName] = useState(""); const [totalInput, setTotalInput] = useState("10"); const [reorderingSubjectId, setReorderingSubjectId] = useState("");
  const [savingAction, setSavingAction] = useState(false); const [savingChapter, setSavingChapter] = useState(false); const [deletingChapter, setDeletingChapter] = useState(false);
  const [importingSyllabus, setImportingSyllabus] = useState(false); const [syllabusImportError, setSyllabusImportError] = useState("");
  const tabOpacity = useRef(new Animated.Value(1)).current; const tabOffset = useRef(new Animated.Value(0)).current; const tabTransitioning = useRef(false);
  const [tabsWidth, setTabsWidth] = useState(0); const tabIndicator = useRef(new Animated.Value(0)).current;
  const swipeStartX = useRef<number | null>(null); const editReveal = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(editReveal, { toValue: editingChapter ? 1 : 0, duration: editingChapter ? 280 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [editReveal, editingChapter]);
  const setTab = (next: Tab) => {
    if (next === tab || tabTransitioning.current) return;
    tabTransitioning.current = true;
    Animated.parallel([
      Animated.timing(tabOpacity, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(tabOffset, { toValue: -7, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setTabState(next);
      tabOpacity.setValue(0);
      tabOffset.setValue(12);
      Animated.parallel([
        Animated.timing(tabOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(tabOffset, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => { tabTransitioning.current = false; });
    });
  };
  const handleTabSwipeEnd = (endX: number) => {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (reorderingSubjectId) return;
    if (startX === null || Math.abs(endX - startX) < 56) return;
    const nextIndex = (TRACK_TABS.indexOf(tab) + (endX < startX ? 1 : -1) + TRACK_TABS.length) % TRACK_TABS.length;
    setTab(TRACK_TABS[nextIndex]);
  };
  useEffect(() => {
    if (!tabsWidth) return;
    Animated.spring(tabIndicator, { toValue: TRACK_TABS.indexOf(tab) * (tabsWidth / TRACK_TABS.length), damping: 18, stiffness: 220, mass: 0.65, useNativeDriver: true }).start();
  }, [tab, tabIndicator, tabsWidth]);
  useEffect(() => { void (async () => { const [raw, mockRaw] = await Promise.all([AsyncStorage.getItem(STORE), AsyncStorage.getItem(MOCK_STORE)]); try { if (raw) { const next = normalise(JSON.parse(raw)); dataRef.current = next; setData(next); } } catch {} try { if (mockRaw) { const next = JSON.parse(mockRaw) as MockTestLog[]; mocksRef.current = next; setMocks(next); } } catch {} setTrackerLoaded(true); })(); }, []);
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const sectionsFor = (value: Data, mockList: MockTestLog[]) => ({
    meta: { examName: "SSC CGL 2027", prepStartDate: "", examDate: "" },
    subjects: value.subjects.map(({ target: _target, ...subject }) => subject),
    revision: value.revision,
    tests: { targets: Object.fromEntries(value.subjects.map((subject) => [subject.id, subject.target])), mocks: { pre: { target: value.fullMockTargets.pre, done: mockList.filter((item) => item.type === "Pre").length }, mains: { target: value.fullMockTargets.mains, done: mockList.filter((item) => item.type === "Mains").length } }, log: mockList.map((item) => ({ ...item, subjectId: value.subjects.find((subject) => subject.name === item.subject)?.id ?? "", notes: "" })) },
    activity: value.activity, pinned: value.pinnedChapterIds,
  });
  const applySections = (sections: Record<string, any>) => {
    if (!Array.isArray(sections.subjects)) return;
    const tests = sections.tests ?? {}; const subjects = sections.subjects.map((subject: any) => ({ ...subject, target: Number(tests.targets?.[subject.id] ?? 10) }));
    const next = normalise({ version: 1, subjects, revision: sections.revision ?? {}, fullMockTargets: { pre: Number(tests.mocks?.pre?.target ?? 0), mains: Number(tests.mocks?.mains?.target ?? 0) }, pinnedChapterIds: sections.pinned ?? [], activity: sections.activity ?? [] });
    const nextMocks = Array.isArray(tests.log) ? tests.log.map((item: any) => ({ ...item, subject: subjects.find((subject: Subject) => subject.id === item.subjectId)?.name ?? item.subject ?? "General", type: item.type === "Sectional" ? "Sectional" : item.type === "Mains" ? "Mains" : "Pre" })) : [];
    dataRef.current = next; mocksRef.current = nextMocks; setData(next); setMocks(nextMocks); void AsyncStorage.multiSet([[STORE, JSON.stringify(next)], [MOCK_STORE, JSON.stringify(nextMocks)]]);
  };
  useEffect(() => { if (!user || !trackerLoaded) return; let stopped = false; let unsubscribe: (() => void) | undefined; void (async () => { const initial = sectionsFor(dataRef.current, mocksRef.current); await migrateTrackerSections(user, initial); if (!stopped) unsubscribe = watchTrackerSections(user, applySections); })().catch(() => undefined); return () => { stopped = true; unsubscribe?.(); }; }, [user?.uid, trackerLoaded]);
  const save = (next: Data) => { const previous = dataRef.current; dataRef.current = next; setData(next); void AsyncStorage.setItem(STORE, JSON.stringify(next)); if (user) void syncTrackerSections(user, sectionsFor(previous, mocksRef.current), sectionsFor(next, mocksRef.current)); };
  const importSyllabus = async () => {
    if (importingSyllabus) return;
    setImportingSyllabus(true); setSyllabusImportError("");
    try {
      const result = await File.pickFileAsync({ mimeTypes: ["application/json", "text/json"] });
      if (result.canceled) return;
      const imported = parseSubjectsFile(JSON.parse(await result.result.text()));
      const subjects = imported.map((subject) => ({ ...subject, target: 0 }));
      save({ ...dataRef.current, subjects, revision: Object.fromEntries(subjects.map((subject) => [subject.id, { types: [], done: {}, targets: {} }])) });
    } catch (error) {
      setSyllabusImportError(error instanceof Error ? error.message : "Choose a valid syllabus JSON file.");
    } finally { setImportingSyllabus(false); }
  };
  const saveMocks = (next: MockTestLog[]) => { const previous = mocksRef.current; mocksRef.current = next; setMocks(next); void AsyncStorage.setItem(MOCK_STORE, JSON.stringify(next)); if (user) void syncTrackerSections(user, sectionsFor(dataRef.current, previous), sectionsFor(dataRef.current, next)); };
  const subjects = filter === "all" ? data.subjects : data.subjects.filter((x) => x.id === filter);
  const chosenSubject = data.subjects.find((x) => x.id === selected?.subjectId); const chosen = chosenSubject?.chapters.find((x) => x.id === selected?.chapterId);
  const lectures = data.subjects.flatMap((x) => x.chapters); const total = lectures.reduce((sum, x) => sum + x.total, 0); const complete = lectures.reduce((sum, x) => sum + x.completed, 0);
  const updateChapter = (subjectId: string, chapterId: string, fn: (chapter: Chapter) => Chapter) => {
    const current = data.subjects.find((subject) => subject.id === subjectId)?.chapters.find((chapter) => chapter.id === chapterId);
    if (!current) return;
    const changed = fn(current);
    // Mirrors the web tracker: only newly completed lectures create an activity event.
    const nextCompleted = Math.max(current.completed, Math.min(changed.completed, changed.total));
    const delta = nextCompleted - current.completed;
    const next = { ...data, subjects: data.subjects.map((subject) => subject.id === subjectId ? { ...subject, chapters: subject.chapters.map((chapter) => chapter.id === chapterId ? { ...changed, completed: nextCompleted } : chapter) } : subject) };
    save(delta > 0 ? { ...next, activity: [{ id: id(), date: todayISO(), type: "lecture", count: delta, subjectId, chapterId }, ...data.activity] } : next);
  };
  const revision = (subjectId: string): Revision => data.revision[subjectId] || { types: [], done: {}, targets: {} };
  const setRevision = (subjectId: string, fn: (value: Revision) => Revision) => {
    const current = revision(subjectId); const changed = fn(current); const events: TrackerActivity[] = [];
    Object.entries(changed.done).forEach(([chapterId, values]) => Object.entries(values).forEach(([revisionTypeId, value]) => {
      const previous = Number(current.done[chapterId]?.[revisionTypeId] || 0); const next = Math.max(previous, Number(value) || 0);
      if (next > previous) events.push({ id: id(), date: todayISO(), type: "revision", count: next - previous, subjectId, chapterId, revisionTypeId });
    }));
    const normalisedDone = Object.fromEntries(Object.entries(changed.done).map(([chapterId, values]) => [chapterId, Object.fromEntries(Object.entries(values).map(([typeId, value]) => [typeId, Math.max(Number(current.done[chapterId]?.[typeId] || 0), Number(value) || 0)]))]));
    save({ ...data, revision: { ...data.revision, [subjectId]: { ...changed, done: normalisedDone, targets: changed.targets || {} } }, activity: events.length ? [...events, ...data.activity] : data.activity });
  };
  const toggleSubject = (subjectId: string) => { setOpenSubjects((current) => current.includes(subjectId) ? [] : [subjectId]); };
  const submitDialog = async () => { if (!name.trim() || savingAction) return; setSavingAction(true); await new Promise((resolve) => setTimeout(resolve, 280)); if (dialog === "subject") { const subjectId = id(); save({ ...data, subjects: [...data.subjects, { id: subjectId, name: name.trim(), target: 0, chapters: [] }], revision: { ...data.revision, [subjectId]: { types: [], done: {}, targets: {} } } }); setFilter(subjectId); } else { const subjectId = dialogSubjectId; const subject = data.subjects.find((item) => item.id === subjectId); if (subjectId && dialog === "chapter") save({ ...data, subjects: data.subjects.map((subject) => subject.id === subjectId ? { ...subject, chapters: [...subject.chapters, { id: id(), name: name.trim(), total: Math.max(1, Number(totalInput) || 1), completed: 0 }] } : subject) }); if (subjectId && dialog === "revision" && subject?.chapters.length) setRevision(subjectId, (value) => ({ ...value, types: [...value.types, { id: id(), name: name.trim(), target: Math.max(1, Number(totalInput) || 1) }] })); } setName(""); setTotalInput("10"); setDialogSubjectId(null); setDialog(null); setSavingAction(false); };
  const editChapter = () => { if (!selected || !chosen || !name.trim()) return; const newTotal = Math.max(1, Number(totalInput) || chosen.total); updateChapter(selected.subjectId, selected.chapterId, (x) => ({ ...x, name: name.trim(), total: newTotal, completed: Math.min(x.completed, newTotal) })); setSelected(null); };
  const saveChapterChanges = async () => { if (savingChapter || !name.trim()) return; setSavingChapter(true); await new Promise((resolve) => setTimeout(resolve, 260)); editChapter(); setSavingChapter(false); };
  const deleteSelectedChapter = async () => { if (!selected || deletingChapter) return; setDeletingChapter(true); await new Promise((resolve) => setTimeout(resolve, 280)); save({ ...data, subjects: data.subjects.map((subject) => subject.id === selected.subjectId ? { ...subject, chapters: subject.chapters.filter((item) => item.id !== selected.chapterId) } : subject), pinnedChapterIds: data.pinnedChapterIds.filter((item) => item !== selected.chapterId) }); setDeleteConfirm(false); setSelected(null); setDeletingChapter(false); };
  const togglePinnedChapter = (chapterId: string) => save({ ...data, pinnedChapterIds: data.pinnedChapterIds.includes(chapterId) ? data.pinnedChapterIds.filter((x) => x !== chapterId) : [...data.pinnedChapterIds, chapterId] });
  const togglePin = () => { if (chosen) togglePinnedChapter(chosen.id); };
  const pinned = data.pinnedChapterIds.flatMap((chapterId) => data.subjects.flatMap((subject) => subject.chapters.filter((chapter) => chapter.id === chapterId).map((chapter) => ({ subject, chapter }))));
  const openChapter = (subject: Subject, chapterId: string) => { const chapter = subject.chapters.find((item) => item.id === chapterId); setName(chapter?.name ?? ""); setTotalInput(String(chapter?.total ?? 1)); setEditingChapter(false); setDeleteConfirm(false); setSelected({ subjectId: subject.id, chapterId }); };
  const moveChapter = (subjectId: string, chapterId: string, offset: number) => save({ ...data, subjects: data.subjects.map((subject) => { if (subject.id !== subjectId) return subject; const from = subject.chapters.findIndex((chapter) => chapter.id === chapterId); const to = Math.max(0, Math.min(subject.chapters.length - 1, from + offset)); if (from < 0 || to === from) return subject; const chapters = [...subject.chapters], [moved] = chapters.splice(from, 1); chapters.splice(to, 0, moved); return { ...subject, chapters }; }) });
  const revisionOverall = data.subjects.reduce((sum, subject) => sum + subject.chapters.reduce((cs, chapter) => cs + revision(subject.id).types.reduce((ts, type) => ts + Math.min(type.target, revision(subject.id).done[chapter.id]?.[type.id] || 0), 0), 0), 0); const revisionTotal = data.subjects.reduce((sum, subject) => sum + subject.chapters.length * revision(subject.id).types.reduce((ts, type) => ts + type.target, 0), 0);
  if (!trackerLoaded) return <View style={s.page}><View style={s.header}><Text style={s.eyebrow}>STUDY TRACKER</Text><Text style={s.title}>{examName?.trim() || "Your tracker"}</Text></View><View style={s.trackLoading}><ActivityIndicator size="small" color={colors.accent} /></View></View>;
  if (!data.subjects.length) return <View style={s.page}><View style={s.header}><Text style={s.eyebrow}>STUDY TRACKER</Text><Text style={s.title}>{examName?.trim() || "Your tracker"}</Text></View><View style={s.tabs} onLayout={(event) => setTabsWidth(event.nativeEvent.layout.width - 6)}>{tabsWidth > 0 && <Animated.View pointerEvents="none" style={[s.tabIndicator, { width: tabsWidth / TRACK_TABS.length, transform: [{ translateX: tabIndicator }] }]} />}{TRACK_TABS.map((x) => <Pressable key={x} onPress={() => setTab(x)} style={s.tab}><Text style={[s.tabText, tab === x && s.tabTextActive]}>{x}</Text></Pressable>)}</View><ScrollView contentContainerStyle={s.content} onTouchStart={(event) => { swipeStartX.current = event.nativeEvent.pageX; }} onTouchEnd={(event) => handleTabSwipeEnd(event.nativeEvent.pageX)}><Animated.View style={[s.stack, { opacity: tabOpacity, transform: [{ translateY: tabOffset }] }]}><View style={s.emptySyllabus}><View style={s.emptySyllabusIcon}><MaterialCommunityIcons name="book-plus-outline" size={22} color={colors.accent} /></View><Text style={s.emptySyllabusTitle}>No syllabus yet</Text><Text style={s.emptySyllabusCopy}>Add subjects one by one, or import your complete syllabus JSON.</Text><View style={s.emptySyllabusActions}><Pressable onPress={() => setDialog("subject")} style={s.emptySyllabusAction}><MaterialCommunityIcons name="plus" color={colors.buttonInk} size={17} /><Text style={s.emptySyllabusActionText}>Add subject</Text></Pressable><Pressable disabled={importingSyllabus} onPress={() => void importSyllabus()} style={[s.emptySyllabusImport, importingSyllabus && s.disabled]}>{importingSyllabus ? <ActivityIndicator size="small" color={colors.accent} /> : <MaterialCommunityIcons name="file-upload-outline" color={colors.accent} size={17} />}<Text style={s.emptySyllabusImportText}>Import JSON</Text></Pressable></View>{syllabusImportError ? <Text style={s.emptySyllabusError}>{syllabusImportError}</Text> : null}</View></Animated.View></ScrollView><Modal transparent visible={dialog === "subject"} animationType="fade" onRequestClose={() => !savingAction && setDialog(null)}><Pressable style={s.backdrop} onPress={() => !savingAction && setDialog(null)}><Pressable style={s.dialog} onPress={() => undefined}><Text style={s.dialogTitle}>Add subject</Text><Text style={s.dialogCopy}>Create the first subject for your tracker.</Text><TextInput autoFocus editable={!savingAction} style={s.input} value={name} onChangeText={setName} placeholder="Subject name" placeholderTextColor={colors.subdued} /><Actions loading={savingAction} onCancel={() => setDialog(null)} onSave={() => void submitDialog()} label="Add subject" /></Pressable></Pressable></Modal></View>;
  return <View style={s.page}><View style={s.header}><Text style={s.eyebrow}>STUDY TRACKER</Text><Text style={s.title}>{examName?.trim() || "Your tracker"}</Text></View><View style={s.tabs} onLayout={(event) => setTabsWidth(event.nativeEvent.layout.width - 6)}>{tabsWidth > 0 && <Animated.View pointerEvents="none" style={[s.tabIndicator, { width: tabsWidth / TRACK_TABS.length, transform: [{ translateX: tabIndicator }] }]} />}{TRACK_TABS.map((x) => <Pressable key={x} onPress={() => setTab(x)} style={s.tab}><Text style={[s.tabText, tab === x && s.tabTextActive]}>{x}</Text></Pressable>)}</View><ScrollView contentContainerStyle={s.content} onTouchStart={(event) => { swipeStartX.current = event.nativeEvent.pageX; }} onTouchEnd={(event) => handleTabSwipeEnd(event.nativeEvent.pageX)}><Animated.View style={[s.stack, { opacity: tabOpacity, transform: [{ translateY: tabOffset }] }]}>
    {tab !== "Mock Test" && <><View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><SubjectFilterChips subjects={data.subjects} filter={filter} onChange={setFilter} />{tab === "Syllabus" && <Pressable onPress={() => setDialog("subject")} style={s.add}><MaterialCommunityIcons name="plus" color={colors.accent} size={17} /><Text style={s.addText}>Subject</Text></Pressable>}</View>{tab === "Syllabus" && <View style={s.overview}><View style={s.row}><Text style={s.overviewTitle}>Overall syllabus</Text><ProgressCount done={complete} total={total} containerStyle={s.overviewCountFlow} textStyle={s.overviewCount} /></View><Bar value={pct(complete, total)} /></View>}{tab === "Revision" && <View style={s.overview}><View style={s.row}><Text style={s.overviewTitle}>Overall revision</Text><ProgressCount done={revisionOverall} total={revisionTotal} containerStyle={s.overviewCountFlow} textStyle={s.overviewCount} /></View><Bar value={pct(revisionOverall, revisionTotal)} /></View>}</>}
    {tab === "Syllabus" && pinned.length > 0 && <View style={[s.pinnedCard, { marginBottom: -6 }]}><Text style={s.sectionLabel}>QUICK ACCESS</Text><PinnedChapterGrid chapters={pinned.map(({ chapter }) => chapter)} onOpen={(id) => { const item = pinned.find(({ chapter }) => chapter.id === id); if (item) openChapter(item.subject, id); }} /></View>}
    {tab === "Syllabus" && subjects.map((subject) => <SubjectCard key={subject.id} subject={subject} expanded={openSubjects.includes(subject.id)} pinned={data.pinnedChapterIds} reordering={reorderingSubjectId === subject.id} onToggle={() => toggleSubject(subject.id)} onToggleReorder={() => { setOpenSubjects((current) => current.includes(subject.id) ? current : [subject.id]); setReorderingSubjectId((current) => current === subject.id ? "" : subject.id); }} onMove={(chapterId, offset) => moveChapter(subject.id, chapterId, offset)} onOpen={(chapterId) => openChapter(subject, chapterId)} onTogglePin={togglePinnedChapter} onAddChapter={() => { setDialogSubjectId(subject.id); setDialog("chapter"); }} />)}
    {tab === "Revision" && subjects.map((subject) => <RevisionCard key={subject.id} subject={subject} revision={revision(subject.id)} expanded={openSubjects.includes(subject.id)} pinned={data.pinnedChapterIds} onToggle={() => toggleSubject(subject.id)} onOpen={(chapterId) => openChapter(subject, chapterId)} onTogglePin={togglePinnedChapter} onAddCycle={() => { if (!subject.chapters.length) return; setDialogSubjectId(subject.id); setDialog("revision"); }} />)}
    {tab === "Mock Test" && <>
      <View style={s.row}>
        <Text style={s.cardTitle}>Test targets</Text>
        <View style={s.mockActions}>
        {onOpenAnalysis && <Pressable onPress={onOpenAnalysis} style={s.add}>
          <MaterialCommunityIcons name="chart-line" color={colors.accent} size={16} />
          <Text style={s.addText}>Analysis</Text>
        </Pressable>}
        <Pressable onPress={() => setMockDialog(true)} style={s.add}>
          <MaterialCommunityIcons name="clipboard-edit-outline" color={colors.accent} size={16} />
          <Text style={s.addText}>Log test</Text>
        </Pressable>
        </View>
      </View>
      <View style={[s.card, { backgroundColor: "transparent", borderWidth: 0, borderRadius: 0, paddingHorizontal: 0 }]}>
        <Text style={s.cardTitle}>Sectional tests</Text>
        {data.subjects.map((subject) => <Target key={subject.id} label={subject.name} target={subject.target} done={mocks.filter((x) => x.type === "Sectional" && x.subject === subject.name).length} onChange={(target) => save({ ...data, subjects: data.subjects.map((x) => x.id === subject.id ? { ...x, target } : x) })} />)}
      </View>
      <View style={[s.card, { backgroundColor: "transparent", borderWidth: 0, borderRadius: 0, paddingHorizontal: 0 }]}>
        <Text style={s.cardTitle}>Full mock targets</Text>
        <Target label="Pre" target={data.fullMockTargets.pre} done={mocks.filter((x) => x.type === "Pre").length} onChange={(pre) => save({ ...data, fullMockTargets: { ...data.fullMockTargets, pre } })} />
        <Target label="Mains" target={data.fullMockTargets.mains} done={mocks.filter((x) => x.type === "Mains").length} onChange={(mains) => save({ ...data, fullMockTargets: { ...data.fullMockTargets, mains } })} />
      </View>
    </>}
  </Animated.View></ScrollView>
  <Modal transparent visible={dialog !== null} animationType="fade" onRequestClose={() => !savingAction && setDialog(null)}><Pressable style={s.backdrop} onPress={() => !savingAction && setDialog(null)}><Pressable style={s.dialog} onPress={() => undefined}><Text style={s.dialogTitle}>{dialog === "subject" ? "Add subject" : dialog === "chapter" ? "Add chapter" : "Add revision cycle"}</Text><Text style={s.dialogCopy}>{dialog === "chapter" ? "Every chapter has its own lecture progress." : dialog === "revision" ? "Set a revision target for every chapter." : "Create a subject for your tracker."}</Text><TextInput autoFocus editable={!savingAction} style={s.input} value={name} onChangeText={setName} placeholder={dialog === "subject" ? "Subject name" : dialog === "chapter" ? "Chapter name" : "e.g. Revision 1"} placeholderTextColor={colors.subdued} />{dialog !== "subject" && <TextInput editable={!savingAction} style={s.input} value={totalInput} onChangeText={setTotalInput} keyboardType="number-pad" placeholder={dialog === "chapter" ? "Total lectures" : "Revisions per chapter"} placeholderTextColor={colors.subdued} />}<Actions loading={savingAction} onCancel={() => setDialog(null)} onSave={() => void submitDialog()} label={dialog === "subject" ? "Add subject" : dialog === "chapter" ? "Add chapter" : "Add cycle"} /></Pressable></Pressable></Modal>
  <MockTestLogDialog visible={mockDialog} subjects={data.subjects.map((subject) => subject.name)} onClose={() => setMockDialog(false)} onSave={(entry) => { saveMocks([...mocks, entry]); }} />
  <Modal transparent visible={Boolean(selected && chosen && chosenSubject)} animationType="slide" onRequestClose={() => setSelected(null)}>
    <Pressable style={s.drawerBackdrop} onPress={() => setSelected(null)}>
      <ScrollView style={[s.drawer, { maxHeight: "82%", alignSelf: "stretch", flexGrow: 0, flexShrink: 1 }]} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
        {selected && chosen && chosenSubject && <>
          <View style={s.grip} />
          <View style={s.drawerTop}><View><Text style={[s.drawerTitle, { fontSize: 22 }]}>{chosen.name}</Text></View><Pressable onPress={() => setDeleteConfirm(true)} style={s.drawerClose}><MaterialCommunityIcons name="trash-can-outline" size={20} color="#fca5a5" /></Pressable></View>
          <View style={[s.lectureSummary, { marginTop: 16 }]}><View style={s.lectureFlow}><NumberFlow value={chosen.completed} containerStyle={s.flowNumber} style={s.lectureText} /><Text style={s.lectureText}> / </Text><NumberFlow value={chosen.total} containerStyle={s.flowNumber} style={s.lectureText} /><Text style={s.lectureText}> lectures</Text></View><NumberFlow value={pct(chosen.completed, chosen.total)} suffix="%" containerStyle={s.flowNumber} style={s.lecturePercent} /></View>
          <SmoothBar value={exactPct(chosen.completed, chosen.total)} />
          <View style={[s.counterRow, { marginTop: 13 }]}><View style={[s.counterBox, { width: 66, height: 36, borderRadius: 10 }]}><NumberFlow value={chosen.completed} containerStyle={s.flowNumber} style={{ ...s.counterValue, fontSize: 16 }} /></View><Pressable style={[s.step, { width: 33, height: 33, borderRadius: 17 }]} onPress={() => updateChapter(selected.subjectId, selected.chapterId, (item) => ({ ...item, completed: Math.min(item.total, item.completed + 1) }))}><MaterialCommunityIcons name="plus" size={18} color={colors.buttonInk} /></Pressable><View style={s.lectureFlow}><Text style={[s.counterOf, { fontSize: 11 }]}>of </Text><NumberFlow value={chosen.total} containerStyle={s.flowNumber} style={{ ...s.counterOf, fontSize: 11 }} /></View></View>
          {editingChapter ? <Animated.View style={{ overflow: "hidden", opacity: editReveal, maxHeight: editReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 155] }), transform: [{ translateY: editReveal.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}><View style={s.chapterEditPanel}><View style={s.editRow}><TextInput editable={!savingChapter} style={[s.input, s.editName]} value={name} onChangeText={setName} placeholder="Chapter name" placeholderTextColor={colors.muted} /><TextInput editable={!savingChapter} style={[s.input, s.editTotal]} value={totalInput} onChangeText={setTotalInput} placeholder="Lectures" keyboardType="number-pad" placeholderTextColor={colors.muted} /></View><Pressable disabled={savingChapter} style={[s.saveEdit, savingChapter && s.disabled]} onPress={() => void saveChapterChanges()}>{savingChapter ? <ActivityIndicator size="small" color={colors.buttonInk} /> : <Text style={s.saveText}>Save changes</Text>}</Pressable></View></Animated.View> : <View style={[s.drawerActions, { marginTop: 13, gap: 8 }]}><Pressable style={[s.drawerAction, { height: 39, borderRadius: 10 }]} onPress={() => setEditingChapter(true)}><Text style={[s.drawerActionText, { fontSize: 12 }]}>Edit chapter</Text></Pressable><Pressable style={[s.drawerAction, { height: 39, borderRadius: 10 }]} onPress={togglePin}><FavouriteStar filled={data.pinnedChapterIds.includes(chosen.id)} size={16} color={data.pinnedChapterIds.includes(chosen.id) ? colors.accent : colors.muted} /><Text style={[s.drawerActionText, { fontSize: 12 }]}>{data.pinnedChapterIds.includes(chosen.id) ? "Unpin" : "Pin"}</Text></Pressable></View>}
          {revision(selected.subjectId).types.length > 0 && <View style={[s.revisionPanel, { marginTop: 14, padding: 12 }]}><Text style={s.overline}>REVISION</Text><RevisionEditor value={revision(selected.subjectId)} chapterId={selected.chapterId} onChange={(type, value) => setRevision(selected.subjectId, (old) => ({ ...old, done: { ...old.done, [selected.chapterId]: { ...(old.done[selected.chapterId] || {}), [type.id]: value } } }))} /></View>}
        </>}
      </ScrollView>
    </Pressable>
  </Modal>
  <DestructiveDialog visible={deleteConfirm} title="Are you sure you want to delete this chapter?" busy={deletingChapter} confirmLabel="Yes, delete" onCancel={() => setDeleteConfirm(false)} onConfirm={deleteSelectedChapter} />
  </View>;
}

function SubjectFilterChips({ subjects, filter, onChange }: { subjects: Subject[]; filter: string; onChange: (value: string) => void }) {
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const [layoutVersion, setLayoutVersion] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;
  const previousTarget = useRef<{ filter: string; x: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const active = layouts.current[filter];
    if (!active) return;
    const previous = previousTarget.current;
    if (previous?.filter === filter && previous.x === active.x && previous.width === active.width) return;
    previousTarget.current = { filter, ...active };
    indicatorX.stopAnimation();
    indicatorWidth.stopAnimation();
    if (!previous || previous.filter === filter) {
      indicatorX.setValue(active.x);
      indicatorWidth.setValue(active.width);
      return;
    }
    Animated.parallel([
      Animated.spring(indicatorX, { toValue: active.x, damping: 18, stiffness: 220, mass: 0.65, useNativeDriver: false }),
      Animated.timing(indicatorWidth, { toValue: active.width, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, [filter, indicatorWidth, indicatorX, layoutVersion]);
  useEffect(() => () => { indicatorX.stopAnimation(); indicatorWidth.stopAnimation(); }, [indicatorX, indicatorWidth]);
  const options = [{ id: "all", name: "All" }, ...subjects];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.chips}><View style={s.subjectChipRow}>{layoutVersion > 0 && <Animated.View pointerEvents="none" style={[s.subjectChipIndicator, { width: indicatorWidth, transform: [{ translateX: indicatorX }] }]} />}{options.map((subject) => <Chip key={subject.id} label={subject.name} active={filter === subject.id} onPress={() => onChange(subject.id)} onLayout={(event) => { const { x, width } = event.nativeEvent.layout; const previous = layouts.current[subject.id]; if (!previous || previous.x !== x || previous.width !== width) { layouts.current[subject.id] = { x, width }; setLayoutVersion((version) => version + 1); } }} />)}</View></ScrollView>;
}
function Chip({ label, active, onPress, onLayout }: { label: string; active: boolean; onPress: () => void; onLayout?: (event: any) => void }) { return <Pressable onPress={onPress} onLayout={onLayout} style={s.chip}><Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text></Pressable>; }
function AccordionChevron({ open }: { open: boolean }) {
  const rotation = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rotation, { toValue: open ? 1 : 0, duration: 210, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [open, rotation]);
  return <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}><MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} /></Animated.View>;
}
function Bar({ value, style }: { value: number; style?: any }) {
  return <LiquidProgressBar progress={value / 100} color={colors.accent} height={6} style={[s.bar, style]} />;
}
function SmoothBar({ value }: { value: number }) {
  return <Bar value={value} />;
}
function TrackNumber({ value, suffix = "", style }: { value: number; suffix?: string; style: any }) {
  const [displayedValue, setDisplayedValue] = useState(value);
  const [isAnimated, setIsAnimated] = useState(false);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (value === displayedValue) return;
    setIsAnimated(true);
    frame.current = requestAnimationFrame(() => setDisplayedValue(value));
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [displayedValue, value]);
  if (!isAnimated) return <Text style={style}>{`${displayedValue}${suffix}`}</Text>;
  return <NumberFlow value={displayedValue} suffix={suffix} continuous={false} containerStyle={s.flowNumber} style={style} />;
}
function ProgressCount({ done, total, label = "", containerStyle = s.chapterProgressFlow, textStyle = s.chapterProgressText }: { done: number; total: number; label?: string; containerStyle?: any; textStyle?: any }) {
  const { marginTop: _marginTop, marginBottom: _marginBottom, marginVertical: _marginVertical, margin: _margin, ...flatTextStyle } = StyleSheet.flatten(textStyle);
  const fontSize = Number(flatTextStyle.fontSize ?? 12);
  const resolvedTextStyle = { ...flatTextStyle, includeFontPadding: false, lineHeight: fontSize + 2 };
  return <View style={containerStyle}><TrackNumber value={done} style={resolvedTextStyle} /><Text style={resolvedTextStyle}>/</Text><TrackNumber value={total} style={resolvedTextStyle} />{label ? <Text style={resolvedTextStyle}>{label}</Text> : null}<Text style={resolvedTextStyle}> · </Text><TrackNumber value={pct(done, total)} suffix="%" style={resolvedTextStyle} /></View>;
}
function Collapse({ open, children }: { open: boolean; children: ReactNode }) { const value = useRef(new Animated.Value(open ? 1 : 0)).current; const [mounted, setMounted] = useState(open); useEffect(() => { if (open) { setMounted(true); Animated.timing(value, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); } else if (mounted) Animated.timing(value, { toValue: 0, duration: 340, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(({ finished }) => { if (finished) setMounted(false); }); }, [mounted, open, value]); if (!mounted) return null; return <Animated.View style={{ paddingTop: 8, overflow: "hidden", opacity: value, maxHeight: value.interpolate({ inputRange: [0, 1], outputRange: [0, 908] }), transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }}>{children}</Animated.View>; }
function SubjectCard({ subject, expanded, pinned, reordering, onToggle, onToggleReorder, onMove, onOpen, onTogglePin, onAddChapter }: { subject: Subject; expanded: boolean; pinned: string[]; reordering: boolean; onToggle: () => void; onToggleReorder: () => void; onMove: (id: string, offset: number) => void; onOpen: (id: string) => void; onTogglePin: (id: string) => void; onAddChapter: () => void }) {
  const total = subject.chapters.reduce((x, y) => x + y.total, 0);
  const done = subject.chapters.reduce((x, y) => x + y.completed, 0);
return <View style={[s.subjectCard, { paddingVertical: 9 }]}><View style={s.row}><Pressable onPress={onToggle} style={[s.accordionWide, { paddingBottom: 4 }]}><AccordionChevron open={expanded} /><View><Text style={s.cardTitle}>{subject.name}</Text><ProgressCount done={done} total={total} containerStyle={s.cardMetaFlow} textStyle={s.cardMeta} /></View></Pressable><Pressable onPress={onToggleReorder} style={[s.reorderButton, reordering && s.reorderButtonActive]}><MaterialCommunityIcons name="sort" size={16} color={reordering ? colors.accentDeep : colors.muted} /></Pressable><Pressable onPress={onAddChapter} style={s.cycleAdd}><MaterialCommunityIcons name="plus" size={18} color={colors.accent} /></Pressable></View><View style={{ marginTop: -5 }}><Bar value={pct(done, total)} /></View><Collapse open={expanded}>{reordering ? <ChapterReorderList chapters={subject.chapters} rowStyle={s.chapter} renderChapter={(chapter) => <View style={s.chapterContent}><ChapterContent chapter={chapter} /></View>} onMove={onMove} /> : <NativeScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }} contentContainerStyle={{ paddingTop: 2 }}>{subject.chapters.map((chapter) => <View key={chapter.id} style={s.chapter}><Pressable onPress={() => onOpen(chapter.id)} style={s.chapterContent}><ChapterContent chapter={chapter} /></Pressable><Pressable onPress={() => onTogglePin(chapter.id)} hitSlop={6} style={[s.chapterPin, pinned.includes(chapter.id) && s.chapterPinActive]}><FavouriteStar filled={pinned.includes(chapter.id)} size={16} color={pinned.includes(chapter.id) ? colors.accent : colors.muted} /></Pressable></View>)}</NativeScrollView>}</Collapse></View>;
}
function ChapterContent({ chapter }: { chapter: Chapter }) { return <><View style={s.chapterRowMain}><Text style={s.chapterRowName} numberOfLines={1}>{chapter.name}</Text><Bar value={pct(chapter.completed, chapter.total)} style={s.chapterRowBar} /></View><View style={s.chapterRowCount}><TrackNumber value={chapter.completed} style={s.chapterRowMeta} /><Text style={s.chapterRowMeta}>/</Text><TrackNumber value={chapter.total} style={s.chapterRowMeta} /></View><View style={s.chapterRowPercent}><TrackNumber value={pct(chapter.completed, chapter.total)} suffix="%" style={s.chapterRowMeta} /></View></>; }
function RevisionCard({ subject, revision, expanded, pinned, onToggle, onOpen, onTogglePin, onAddCycle }: { subject: Subject; revision: Revision; expanded: boolean; pinned: string[]; onToggle: () => void; onOpen: (id: string) => void; onTogglePin: (id: string) => void; onAddCycle: () => void }) { const total = subject.chapters.length * revision.types.reduce((x, y) => x + y.target, 0); const done = subject.chapters.reduce((x, chapter) => x + revision.types.reduce((sum, type) => sum + Math.min(type.target, revision.done[chapter.id]?.[type.id] || 0), 0), 0); const hasChapters = subject.chapters.length > 0; return <View style={[s.subjectCard, { paddingVertical: 9 }]}><View style={s.row}><Pressable onPress={onToggle} style={[s.accordionWide, { paddingBottom: 4 }]}><AccordionChevron open={expanded} /><View><Text style={s.cardTitle}>{subject.name}</Text><ProgressCount done={done} total={total} label=" revisions" containerStyle={s.cardMetaFlow} textStyle={s.cardMeta} /></View></Pressable>{hasChapters && <Pressable onPress={onAddCycle} style={s.cycleAdd}><MaterialCommunityIcons name="plus" size={18} color={colors.accent} /></Pressable>}</View><View style={{ marginTop: -5 }}><Bar value={pct(done, total)} /></View><Collapse open={expanded}>{!hasChapters ? <Text style={s.empty}>Add a chapter before creating revision cycles.</Text> : revision.types.length ? <NativeScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }} contentContainerStyle={{ paddingTop: 2 }}>{subject.chapters.map((chapter) => { const chapterTotal = revision.types.reduce((sum, type) => sum + type.target, 0); const chapterDone = revision.types.reduce((sum, type) => sum + Math.min(type.target, revision.done[chapter.id]?.[type.id] || 0), 0); const isPinned = pinned.includes(chapter.id); return <View key={chapter.id} style={s.chapter}><Pressable onPress={() => onOpen(chapter.id)} style={s.chapterContent}><ChapterContent chapter={{ ...chapter, completed: chapterDone, total: chapterTotal }} /></Pressable><Pressable onPress={() => onTogglePin(chapter.id)} hitSlop={6} style={[s.chapterPin, isPinned && s.chapterPinActive]}><FavouriteStar filled={isPinned} size={16} color={isPinned ? colors.accent : colors.muted} /></Pressable></View>; })}</NativeScrollView> : <Text style={s.empty}>Add a revision cycle for {subject.name}.</Text>}</Collapse></View>; }
function RevisionEditor({ value, chapterId, onChange }: { value: Revision; chapterId: string; onChange: (type: RevisionType, done: number) => void }) { return <View>{value.types.map((type) => <RevisionCycle key={type.id} type={type} done={value.done[chapterId]?.[type.id] || 0} onChange={onChange} />)}</View>; }
function RevisionCycle({ type, done, onChange }: { type: RevisionType; done: number; onChange: (type: RevisionType, done: number) => void }) { const fill = useRef(new Animated.Value(0)).current; useEffect(() => { fill.setValue(0); Animated.timing(fill, { toValue: done, duration: Math.max(220, Math.min(900, done * 130)), easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [done, fill]); return <View style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,.06)" }}><Text style={s.chapterName} numberOfLines={1}>{type.name}</Text><View style={[s.dots, { marginTop: 9 }]}>{Array.from({ length: type.target }, (_, i) => <Animated.View key={i} style={[s.dot, { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: fill.interpolate({ inputRange: [i, i + 1], outputRange: ["#242424", colors.accent], extrapolate: "clamp" }) }]}><Pressable onPress={() => onChange(type, i + 1 === done ? i : i + 1)} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}><Text style={{ color: i < done ? colors.accentDeep : "#a1a1aa", fontSize: 10, fontWeight: "700" }}>{i + 1}</Text></Pressable></Animated.View>)}</View></View>; }
function Target({ label, done, target, onChange }: { label: string; done: number; target: number; onChange: (target: number) => void }) { return <View style={s.target}><Text style={s.targetLabel}>{label}</Text><View style={s.targetBar}><View style={[s.targetFill, { width: `${pct(done, target)}%` }]} /></View><View style={s.targetCountFlow}><TrackNumber value={done} style={s.targetCountText} /><Text style={s.targetCountText}>/</Text><TrackNumber value={target} style={s.targetCountText} /></View><Pressable style={s.targetButton} onPress={() => onChange(Math.max(0, target - 1))}><Text style={s.targetButtonText}>−</Text></Pressable><Pressable style={s.targetButton} onPress={() => onChange(target + 1)}><Text style={s.targetButtonText}>+</Text></Pressable></View>; }
function Actions({ label, loading, onCancel, onSave }: { label: string; loading?: boolean; onCancel: () => void; onSave: () => void }) { return <View style={s.actions}><Pressable disabled={loading} onPress={onCancel}><Text style={[s.cancel, loading && s.disabled]}>Cancel</Text></Pressable><Pressable disabled={loading} style={[s.save, loading && s.disabled]} onPress={onSave}>{loading ? <ActivityIndicator size="small" color={colors.buttonInk} /> : <Text style={s.saveText}>{label}</Text>}</Pressable></View>; }

const s = Object.assign(createThemedStyles({
  page:{flex:1,backgroundColor:"transparent"}, header:{padding:16,paddingBottom:10}, eyebrow:{color:"#818cf8",fontSize:10,fontWeight:"800",letterSpacing:1.8}, title:{color:colors.text,fontSize:22,fontWeight:"800",marginTop:3}, tabs:{position:"relative",flexDirection:"row",marginHorizontal:16,padding:3,borderRadius:16,backgroundColor:"#1c1c1c"}, tabIndicator:{position:"absolute",top:3,bottom:3,left:3,borderRadius:13,backgroundColor:"#303030"},tab:{zIndex:1,flex:1,alignItems:"center",borderRadius:13,paddingVertical:9},tabText:{color:colors.subdued,fontSize:12,fontWeight:"700"},tabTextActive:{color:colors.text}, content:{padding:16,paddingBottom:70},stack:{gap:10}, pinnedCard:{paddingVertical:2},reorderButton:{width:30,height:30,marginLeft:8,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:"#303030"},reorderButtonActive:{backgroundColor:colors.accent},reorderHint:{color:colors.muted,fontSize:10,marginTop:10,marginBottom:2},reorderControls:{flexDirection:"row",gap:4},orderControl:{width:28,height:28,alignItems:"center",justifyContent:"center",borderRadius:8,backgroundColor:"#303030"},orderDisabled:{opacity:0.28}, chips:{paddingBottom:3},subjectChipRow:{position:"relative",flexDirection:"row",gap:7},subjectChipIndicator:{position:"absolute",top:0,bottom:0,left:0,borderRadius:14,backgroundColor:colors.accent},chip:{zIndex:1,borderRadius:14,paddingHorizontal:14,paddingVertical:9,backgroundColor:"transparent"},chipActive:{},chipText:{color:colors.muted,fontSize:12,fontWeight:"700"},chipTextActive:{color:colors.accentDeep},
  overview:{paddingVertical:14,paddingHorizontal:1},overviewTitle:{color:colors.text,fontSize:17,fontWeight:"800"},overviewCount:{color:colors.muted,fontSize:12,fontWeight:"700"},emptySyllabus:{alignItems:"center",marginTop:26,borderRadius:18,borderWidth:1,borderStyle:"dashed",borderColor:"#3a3a3a",paddingHorizontal:26,paddingVertical:30,backgroundColor:"rgba(255,255,255,.02)"},emptySyllabusIcon:{width:46,height:46,alignItems:"center",justifyContent:"center",borderRadius:15,backgroundColor:"#162c45"},emptySyllabusTitle:{color:colors.text,fontSize:17,fontWeight:"700",marginTop:13},emptySyllabusCopy:{maxWidth:270,color:colors.muted,fontSize:12,lineHeight:18,textAlign:"center",marginTop:5},emptySyllabusActions:{flexDirection:"row",alignItems:"center",gap:8,marginTop:17},emptySyllabusAction:{flexDirection:"row",alignItems:"center",gap:5,borderRadius:11,paddingHorizontal:14,paddingVertical:10,backgroundColor:colors.button},emptySyllabusActionText:{color:colors.buttonInk,fontSize:12,fontWeight:"700"},emptySyllabusImport:{minHeight:38,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,borderRadius:11,borderWidth:1,borderColor:colors.accent + "66",paddingHorizontal:12,backgroundColor:"#162c45"},emptySyllabusImportText:{color:colors.accent,fontSize:12,fontWeight:"700"},emptySyllabusError:{maxWidth:280,color:"#fca5a5",fontSize:10,lineHeight:15,textAlign:"center",marginTop:10},card:{borderRadius:17,padding:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},subjectCard:{paddingVertical:13,borderBottomWidth:1,borderColor:"rgba(255,255,255,.08)"},row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},mockActions:{flexDirection:"row",alignItems:"center",gap:7},sectionLabel:{color:colors.muted,fontSize:12,fontWeight:"800",letterSpacing:1.4},cardTitle:{color:colors.text,fontSize:16,fontWeight:"800"},cardMeta:{color:colors.muted,fontSize:11,marginTop:3},add:{flexDirection:"row",alignItems:"center",gap:3,borderRadius:12,borderWidth:1,borderColor:colors.accent + "66",paddingHorizontal:10,paddingVertical:7,backgroundColor:"transparent"},addText:{color:colors.accent,fontSize:11,fontWeight:"600"},addDark:{flexDirection:"row",alignItems:"center",gap:3,borderRadius:10,padding:8,backgroundColor:"#303030"},addDarkText:{color:colors.text,fontSize:11,fontWeight:"800"},bar:{height:5,overflow:"hidden",borderRadius:4,backgroundColor:"#343434",marginTop:10},fill:{height:"100%",borderRadius:4,backgroundColor:colors.accent},accordionWide:{flex:1,flexDirection:"row",alignItems:"center",gap:8,paddingBottom:9},cycleAdd:{width:30,height:30,marginLeft:10,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:"#162c45"},chapter:{minHeight:56,paddingLeft:8,flexDirection:"row",alignItems:"center",gap:8},chapterDropTarget:{backgroundColor:"rgba(96,165,250,.12)",borderTopColor:colors.accent,borderTopWidth:2},dragHandle:{width:40,height:40,alignItems:"center",justifyContent:"center",borderRadius:11,backgroundColor:"#2a2a2a"},dragHandleActive:{backgroundColor:colors.accent + "22"},chapterContent:{flex:1,minWidth:0,paddingVertical:9,flexDirection:"row",alignItems:"center",gap:8},chapterRowMain:{flex:1,minWidth:0},chapterRowName:{color:"#e4e4e7",fontSize:14,fontWeight:"500"},chapterRowBar:{marginTop:5},chapterRowCount:{width:50,flexDirection:"row",justifyContent:"flex-end",alignItems:"center",flexShrink:0},chapterRowPercent:{width:32,flexDirection:"row",justifyContent:"flex-end",alignItems:"center",flexShrink:0},chapterRowMeta:{color:colors.muted,fontSize:12,fontFamily:"monospace"},chapterText:{flex:1,minWidth:0},chapterTop:{flexDirection:"row",alignItems:"center",gap:10},chapterTitle:{flexDirection:"row",alignItems:"center",gap:6},chapterName:{color:"#e4e4e7",fontSize:13,fontWeight:"700",flex:1,minWidth:0},chapterProgress:{color:colors.muted,fontSize:10,fontWeight:"700",flexShrink:0},chapterPin:{width:28,height:28,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:"#242424"},chapterPinActive:{backgroundColor:"#242424"},pills:{flexDirection:"row",flexWrap:"wrap",gap:4,marginTop:6},pill:{paddingHorizontal:6,paddingVertical:3,borderRadius:6,backgroundColor:"#303030"},pillDone:{backgroundColor:"#162c45"},pillText:{color:"#d4d4d8",fontSize:9,fontWeight:"700"},empty:{color:colors.muted,fontSize:12,marginTop:13},note:{color:colors.muted,fontSize:12,flex:1},
  target:{flexDirection:"row",alignItems:"center",gap:7,minHeight:46,borderTopWidth:1,borderColor:"rgba(255,255,255,.06)"},targetLabel:{width:64,color:"#e4e4e7",fontSize:12},targetBar:{flex:1,height:5,borderRadius:4,overflow:"hidden",backgroundColor:"#343434"},targetFill:{height:"100%",backgroundColor:colors.accent},targetCount:{width:30,textAlign:"right",color:colors.muted,fontSize:10},targetButton:{width:24,height:24,borderRadius:8,alignItems:"center",justifyContent:"center",backgroundColor:"#303030"},targetButtonText:{color:colors.text,fontSize:16},backdrop:{flex:1,justifyContent:"center",padding:20,backgroundColor:"rgba(0,0,0,.72)"},dialog:{padding:20,borderRadius:20,backgroundColor:"#202020",borderWidth:1,borderColor:colors.border},dialogTitle:{color:colors.text,fontSize:20,fontWeight:"800"},dialogCopy:{color:colors.muted,fontSize:13,marginTop:4},input:{height:46,marginTop:12,borderRadius:12,paddingHorizontal:13,color:colors.text,backgroundColor:"#151515",borderWidth:1,borderColor:"#3f3f46"},actions:{flexDirection:"row",justifyContent:"flex-end",alignItems:"center",gap:20,marginTop:17},cancel:{color:"#e4e4e7",fontWeight:"700"},save:{minWidth:86,minHeight:42,alignItems:"center",justifyContent:"center",borderRadius:12,paddingHorizontal:14,paddingVertical:11,backgroundColor:colors.button},saveText:{color:colors.buttonInk,fontWeight:"600"},disabled:{opacity:0.65},drawerBackdrop:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(0,0,0,.72)"},drawer:{borderTopLeftRadius:24,borderTopRightRadius:24,padding:18,paddingBottom:22,backgroundColor:"#1c1c1c",borderWidth:1,borderColor:colors.border},grip:{width:38,height:4,borderRadius:3,alignSelf:"center",marginBottom:13,backgroundColor:"#55555d"},drawerTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start"},drawerClose:{padding:4},overline:{color:"#a1a1aa",fontSize:10,fontWeight:"800",letterSpacing:1.7,marginTop:0},drawerTitle:{color:colors.text,fontSize:25,fontWeight:"800",marginTop:5,maxWidth:270},lectureSummary:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:24},lectureText:{color:"#b9b9c0",fontSize:15,fontFamily:"monospace"},lecturePercent:{color:"#b9b9c0",fontSize:15,fontFamily:"monospace"},counterRow:{flexDirection:"row",alignItems:"center",gap:11,marginTop:23},counterBox:{width:104,height:54,borderRadius:14,alignItems:"center",justifyContent:"center",backgroundColor:"#242424"},counterValue:{color:colors.text,fontSize:23,fontWeight:"700"},counterOf:{color:"#b9b9c0",fontSize:15},step:{width:42,height:42,borderRadius:21,alignItems:"center",justifyContent:"center",backgroundColor:colors.button},drawerActions:{flexDirection:"row",gap:10,marginTop:22},drawerAction:{height:50,flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6,borderRadius:13,backgroundColor:"#242424"},drawerActionText:{color:colors.text,fontSize:13,fontWeight:"600"},chapterEditPanel:{marginTop:16},revisionPanel:{marginTop:20,borderRadius:18,padding:14,backgroundColor:"#151515"},cycle:{minHeight:44,flexDirection:"row",alignItems:"center",gap:10,borderBottomWidth:1,borderColor:"rgba(255,255,255,.06)"},dots:{flexDirection:"row",gap:7,flexWrap:"wrap",marginTop:10},dot:{width:31,height:31,borderRadius:16,borderWidth:1,borderColor:"#303030",backgroundColor:"#242424"},dotDone:{borderColor:colors.accent,backgroundColor:colors.accent},editRow:{flexDirection:"row",gap:8},editName:{flex:1},editTotal:{width:84},loadEdit:{marginTop:10},loadEditText:{color:colors.muted,fontSize:11},saveEdit:{marginTop:10,borderRadius:11,paddingVertical:12,alignItems:"center",backgroundColor:colors.button},deleteChapter:{alignSelf:"center",flexDirection:"row",alignItems:"center",gap:6,marginTop:13,padding:7},deleteChapterText:{color:"#fca5a5",fontSize:12,fontWeight:"700"}
}), {
  targetCountFlow: { width: 30, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "flex-end" as const },
  targetCountText: { color: colors.muted, fontSize: 10 },
  trackLoading: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const },
  overviewCountFlow: { flexDirection: "row" as const, alignItems: "center" as const, flexShrink: 0 },
  lectureFlow: { flexDirection: "row" as const, alignItems: "center" as const },
  cardMetaFlow: { flexDirection: "row" as const, alignItems: "center" as const, marginTop: 3 },
  chapterProgressFlow: { flexDirection: "row" as const, alignItems: "center" as const, flexShrink: 0 },
  flowNumber: { alignSelf: "center" as const, flexShrink: 0 },
  chapterProgressText: { color: colors.muted, fontSize: 10, fontWeight: "700" as const },
});

