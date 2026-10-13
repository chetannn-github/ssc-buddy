// @ts-nocheck
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { User } from "firebase/auth";
import { advanceUnlockQuiz, answerUnlockQuiz, releaseUnlockQuizReview, startUnlockQuiz, RANDOM_RECALL_SCOPE, type QuickRecallScope, type UnlockQuizState } from "../domain/unlock-quiz";
import { loadQuickRecallSeed, recordQuickRecallPractice, writeQuestionLearning } from "../lib/firebase";
import { colors } from "../theme";
import { RecallScopeDropdown } from "./RecallScopeDropdown";

const choices = ["A", "B", "C", "D"] as const;

export function QuickRecallScreen({ user, onClose, onGoProfile }: { user: User | null; onClose: () => void; onGoProfile: () => void }) {
  const [quiz, setQuiz] = useState<UnlockQuizState | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(true);
  const [seed, setSeed] = useState<any>(null);
  const [scope, setScope] = useState<QuickRecallScope>({ subjectId: RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE });
  const [menu, setMenu] = useState<"subject" | "chapter" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const load = async () => {
    setLoading(true);
    try { setQuiz(await startUnlockQuiz(scope)); setSetup(false); } finally { setLoading(false); }
  };
  useEffect(() => { if (user) void loadQuickRecallSeed(user).then(setSeed).finally(() => setLoading(false)); else setLoading(false); }, [user?.uid]);
  useEffect(() => {
    if (quiz?.status !== "correction") { setSecondsLeft(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil(((quiz.lockedUntil ?? Date.now()) - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) void releaseUnlockQuizReview().then(setQuiz);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [quiz?.status, quiz?.lockedUntil]);
  const answer = async (choice: "A" | "B" | "C" | "D") => {
    if (!quiz || quiz.status !== "active") return;
    const question = quiz.questions[quiz.index];
    const correct = choice === question.correctAnswer;
    const next = await answerUnlockQuiz(choice);
    setQuiz(next);
    if (!user || !next) return;
    void writeQuestionLearning(user, { stats: next.stats });
    void recordQuickRecallPractice(user, { runId: `${next.runId}:${next.index}`, date: new Date().toISOString().slice(0, 10), startedAt: next.startedAt, questions: [question], answers: [choice] });
  };
  const next = async () => setQuiz(await advanceUnlockQuiz());
  if (loading) return <View style={styles.page}><View style={styles.loader}><ActivityIndicator color="#60a5fa" /><Text style={styles.muted}>Preparing quick recall…</Text></View></View>;
  const hasRecallQuestions = (chapter: any) => Array.isArray(chapter?.exercises) && chapter.exercises.some((exercise: any) => Array.isArray(exercise?.questions) && exercise.questions.some((question: any) => question?.id && question?.question && Array.isArray(question?.options) && question.options.length === 4 && ["A", "B", "C", "D"].includes(question?.correctAnswer)));
  const subjects = Array.isArray(seed?.subjects) ? seed.subjects.map((item: any) => ({ id: String(item.id ?? item.name), name: String(item.name ?? "Subject"), chapters: (Array.isArray(item.chapters) ? item.chapters : []).filter(hasRecallQuestions) })).filter((item: any) => item.id && item.chapters.length) : [];
  const selectedSubject = subjects.find((item) => item.id === scope.subjectId);
  const chapters = selectedSubject?.chapters?.map((item: any) => String(item?.name ?? "")).filter(Boolean) ?? [];
  const subjectName = selectedSubject?.name ?? "Random";
  const subjectOptions = [{ value: RANDOM_RECALL_SCOPE, label: "Random" }, ...subjects.map((item) => ({ value: item.id, label: item.name }))];
  const chapterOptions = [{ value: RANDOM_RECALL_SCOPE, label: "Random" }, ...chapters.map((chapter) => ({ value: chapter, label: chapter }))];
  if (setup) return <View style={styles.page}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={onClose} style={styles.setupBack}><MaterialCommunityIcons name="arrow-left" size={17} color={colors.muted} /><Text style={styles.setupBackText}>Back</Text></Pressable><View style={styles.card}><Text style={styles.kicker}>QUICK RECALL</Text><Text style={styles.setupTitle}>Choose your focus</Text><Text style={styles.setupCopy}>Random keeps favourites and earlier mistakes first.</Text><RecallScopeDropdown label="Subject" value={scope.subjectId} open={menu === "subject"} options={subjectOptions} onToggle={() => setMenu(menu === "subject" ? null : "subject")} onSelect={(value) => { setScope({ subjectId: value, chapter: RANDOM_RECALL_SCOPE }); setMenu(null); }} /><RecallScopeDropdown label="Chapter" value={scope.chapter} disabled={!selectedSubject} open={menu === "chapter"} options={chapterOptions} onToggle={() => selectedSubject && setMenu(menu === "chapter" ? null : "chapter")} onSelect={(value) => { setScope((current) => ({ ...current, chapter: value })); setMenu(null); }} /><Pressable style={styles.start} onPress={() => void load()}><Text style={styles.nextText}>Start recall</Text><MaterialCommunityIcons name="arrow-right" size={17} color="#082f49" /></Pressable></View></ScrollView></View>;
  if (!quiz?.questions.length) return <View style={styles.page}><View style={styles.card}><Text style={styles.kicker}>QUICK RECALL</Text><Text style={styles.empty}>Add question-based exercises first.</Text><Pressable onPress={onClose}><Text style={styles.link}>Open practice</Text></Pressable></View></View>;
  if (quiz.status === "complete") return <View style={styles.page}><View style={[styles.card, styles.center]}><View style={styles.completeIcon}><MaterialCommunityIcons name="creation-outline" size={23} color="#93c5fd" /></View><Text style={styles.kicker}>RECALL FINISHED</Text><Text style={styles.score}>{quiz.correct}/{quiz.questions.length} correct</Text><Text style={styles.muted}>{quiz.subject} · saved to today’s practice</Text><View style={styles.actions}><Pressable style={styles.outline} onPress={onGoProfile}><Text style={styles.outlineText}>View profile</Text></Pressable><Pressable style={styles.primary} onPress={() => { setQuiz(null); setSetup(true); }}><Text style={styles.primaryText}>Again</Text></Pressable></View></View></View>;
  const question = quiz.questions[quiz.index];
  const selected = quiz.selected;
  const review = quiz.status === "review" || quiz.status === "correction";
  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content}><View style={styles.card}><View style={styles.metaRow}><View><Text style={styles.kicker}>{quiz.subject}</Text><Text style={styles.questionCount}>{quiz.index + 1}/{quiz.questions.length}</Text></View>{quiz.status === "correction" && <Text style={styles.timer}>{secondsLeft}s</Text>}</View><Text style={styles.question}>{question.question}</Text><View style={styles.options}>{choices.map((choice, index) => { const isCorrect = review && choice === question.correctAnswer; const wrong = review && choice === selected && choice !== question.correctAnswer; return <Pressable disabled={Boolean(selected)} key={choice} onPress={() => void answer(choice)} style={[styles.option, isCorrect && styles.correct, wrong && styles.wrong]}><Text style={styles.optionKey}>{choice}</Text><Text style={styles.optionText}>{question.options[index]}</Text>{isCorrect && <MaterialCommunityIcons name="check" size={17} color="#86efac" />}</Pressable>; })}</View>{selected && <><View style={styles.explanation}><Text style={styles.explanationText}>{question.explanation || `Correct answer: ${question.correctAnswer}`}</Text></View><Pressable disabled={quiz.status !== "review"} onPress={() => void next()} style={[styles.next, quiz.status !== "review" && styles.disabled]}><Text style={styles.nextText}>{quiz.status === "correction" ? `Next in ${secondsLeft}s` : quiz.index + 1 === quiz.questions.length ? "Finish" : "Next"}</Text><MaterialCommunityIcons name="arrow-right" size={17} color="#082f49" /></Pressable></>}</View></ScrollView></View>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background }, content: { padding: 13, paddingTop: 18, paddingBottom: 100 }, card: { borderRadius: 16, padding: 16, backgroundColor: "#1b1b1b" }, setupTitle: { color: colors.text, fontSize: 21, fontWeight: "700", marginTop: 9 }, setupCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }, setupLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.3, fontWeight: "800", marginTop: 20, marginBottom: 7 }, setupSelect: { height: 48, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: "#3f3f46", backgroundColor: "#202020", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, setupSelectOpen: { borderColor: "#60a5fa", backgroundColor: "#22272a" }, setupSelectDisabled: { opacity: .48 }, setupSelectText: { color: colors.text, fontSize: 14 }, setupSelectMuted: { color: colors.muted }, setupMenu: { marginTop: 5, borderRadius: 11, padding: 4, borderWidth: 1, borderColor: "#3b3b3b", backgroundColor: "#282828" }, setupOption: { minHeight: 39, paddingHorizontal: 10, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, setupOptionActive: { backgroundColor: "#f4f4f5" }, setupOptionText: { color: colors.text, fontSize: 13 }, setupOptionTextActive: { color: "#171717" }, start: { height: 44, marginTop: 23, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#60a5fa" }, metaRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }, questionCount: { marginTop: 4, color: colors.muted, fontSize: 12 }, timer: { minWidth: 44, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, overflow: "hidden", color: "#bfdbfe", backgroundColor: "#172b40", fontSize: 14, fontWeight: "800", textAlign: "center" }, center: { alignItems: "center", paddingVertical: 45 }, completeIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#162c45", marginBottom: 13 }, loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }, kicker: { color: "#93c5fd", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, question: { marginTop: 15, color: colors.text, fontSize: 19, lineHeight: 28, fontWeight: "600" }, options: { gap: 8, marginTop: 19 }, option: { minHeight: 51, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: "#343434", backgroundColor: "#202020" }, optionKey: { width: 25, height: 25, borderRadius: 13, textAlign: "center", textAlignVertical: "center", color: "#a1a1aa", borderWidth: 1, borderColor: "#3f3f46", fontSize: 11 }, optionText: { flex: 1, color: "#e4e4e7", fontSize: 13, lineHeight: 18 }, correct: { borderColor: "#3f806c", backgroundColor: "#173a33" }, wrong: { borderColor: "#9f3944", backgroundColor: "#3a2023" }, explanation: { marginTop: 13, borderRadius: 10, padding: 11, backgroundColor: "#22272a" }, explanationText: { color: "#d4d4d8", fontSize: 12, lineHeight: 18 }, next: { height: 42, marginTop: 14, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#60a5fa" }, nextText: { color: "#082f49", fontSize: 13, fontWeight: "700" }, disabled: { opacity: .45 }, score: { marginTop: 8, color: colors.text, fontSize: 25, fontWeight: "800" }, muted: { color: colors.muted, fontSize: 13 }, empty: { marginTop: 12, color: colors.text, fontSize: 16 }, link: { marginTop: 17, color: "#60a5fa", fontSize: 13, fontWeight: "700" }, actions: { flexDirection: "row", gap: 9, marginTop: 19 }, primary: { minWidth: 100, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#60a5fa" }, primaryText: { color: "#082f49", fontWeight: "700" }, outline: { minWidth: 100, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#3f3f46" }, outlineText: { color: colors.text, fontWeight: "700" } });
