// @ts-nocheck
import { useAndroidBack } from "../hooks/use-android-back";
import { createThemedStyles } from "../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { User } from "firebase/auth";
import { pruneUnlockQuiz, advanceUnlockQuiz, answerUnlockQuiz, releaseUnlockQuizReview, startUnlockQuiz, RANDOM_RECALL_SCOPE, type QuickRecallScope, type UnlockQuizState } from "../domain/unlock-quiz";
import { watchPracticeEntities, loadQuickRecallSeed, recordQuickRecallPractice, writeQuestionLearning } from "../lib/firebase";
import { colors } from "../theme";
import { dateKey } from "../domain/tasks";
import { RecallScopeDropdown } from "./RecallScopeDropdown";

import { ALL_RECALL_EXERCISES, RECALL_QUESTION_COUNTS, type RecallQuestionCount } from "../domain/recall-selection";

const choices = ["A", "B", "C", "D"] as const;

export function QuickRecallScreen({ user, onClose, onGoProfile }: { user: User | null; onClose: () => void; onGoProfile: () => void }) {
  const [quiz, setQuiz] = useState<UnlockQuizState | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(true);
  const [questionCount, setQuestionCount] = useState<RecallQuestionCount>(3);
  const [seed, setSeed] = useState<any>(null);
  const [scope, setScope] = useState<QuickRecallScope>({ subjectId: RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE, exerciseId: ALL_RECALL_EXERCISES });
  const [menu, setMenu] = useState<"subject" | "chapter" | "exercise" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  useAndroidBack(() => {
    if (menu) { setMenu(null); return; }
    if (!setup) { setQuiz(null); setSetup(true); return; }
    onClose();
  });
  const load = async () => {
    setLoading(true);
    try { setQuiz(await startUnlockQuiz(scope, questionCount)); setSetup(false); } finally { setLoading(false); }
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
  useEffect(() => {
    if (!user) return;
    let active = true;
    const stop = watchPracticeEntities(user, "practiceSubjects", (subjects) => {
      setSeed((current) => current ? { ...current, subjects } : current);
      void pruneUnlockQuiz(subjects as any).then((next) => { if (active && next) setQuiz(next); });
    });
    return () => { active = false; stop(); };
  }, [user?.uid]);
  const answer = async (choice: "A" | "B" | "C" | "D") => {
    if (!quiz || quiz.status !== "active") return;
    const question = quiz.questions[quiz.index];
    const correct = choice === question.correctAnswer;
    const next = await answerUnlockQuiz(choice, question.id);
    setQuiz(next);
    if (!user || !next || next.selected !== choice || next.questions[next.index]?.id !== question.id) return;
    void writeQuestionLearning(user, { stats: next.stats });
    void recordQuickRecallPractice(user, { runId: `${next.runId}:${next.index}`, date: dateKey(), startedAt: next.startedAt, questions: [question], answers: [choice] });
  };
  const next = async () => setQuiz(await advanceUnlockQuiz());
  if (loading) return <View style={styles.page}><View style={styles.loader}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Preparing quick recall…</Text></View></View>;
  const hasRecallQuestions = (chapter: any) => Array.isArray(chapter?.exercises) && chapter.exercises.some((exercise: any) => Array.isArray(exercise?.questions) && exercise.questions.some((question: any) => question?.id && question?.question && Array.isArray(question?.options) && question.options.length === 4 && ["A", "B", "C", "D"].includes(question?.correctAnswer)));
  const subjects = Array.isArray(seed?.subjects) ? seed.subjects.map((item: any) => ({ id: String(item.id ?? item.name), name: String(item.name ?? "Subject"), chapters: (Array.isArray(item.chapters) ? item.chapters : []).filter(hasRecallQuestions) })).filter((item: any) => item.id && item.chapters.length) : [];
  const selectedSubject = subjects.find((item) => item.id === scope.subjectId);
  const chapters = selectedSubject?.chapters?.map((item: any) => String(item?.name ?? "")).filter(Boolean) ?? [];
  const subjectName = selectedSubject?.name ?? "Random";
  const subjectOptions = [{ value: RANDOM_RECALL_SCOPE, label: "Random" }, ...subjects.map((item) => ({ value: item.id, label: item.name }))];
  const chapterOptions = [{ value: RANDOM_RECALL_SCOPE, label: "Random" }, ...chapters.map((chapter) => ({ value: chapter, label: chapter }))];
  const selectedChapter = selectedSubject?.chapters.find((item: any) => item.name === scope.chapter);
  const exerciseOptions = [{ value: ALL_RECALL_EXERCISES, label: "All exercises" }, ...(selectedChapter?.exercises ?? [])
    .filter((exercise: any) => hasRecallQuestions({ exercises: [exercise] }))
    .map((exercise: any) => ({ value: String(exercise.id ?? exercise.name ?? "Exercise 1"), label: String(exercise.name ?? "Exercise 1") }))];
  if (setup && !subjects.length) return <View style={styles.page}><View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}><View style={{ width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#162c45", marginBottom: 14 }}><MaterialCommunityIcons name="creation-outline" size={25} color={colors.accent} /></View><Text style={styles.kicker}>QUICK RECALL</Text><Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 8, textAlign: "center" }}>No question-based exercise yet</Text><Pressable style={{ height: 40, marginTop: 20, borderRadius: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent }} onPress={onClose}><MaterialCommunityIcons name="arrow-left" size={16} color={colors.accentDeep} /><Text style={{ color: colors.accentDeep, fontWeight: "700", fontSize: 12 }}>Back to practice</Text></Pressable></View></View>;
  if (setup) return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.setupHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to practice" onPress={onClose} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <View>
            <Text style={styles.kicker}>QUICK RECALL</Text>
            <Text style={styles.setupTitle}>Choose your focus</Text>
          </View>
        </View>
        <RecallScopeDropdown label="Subject" value={scope.subjectId} open={menu === "subject"} options={subjectOptions}
          onToggle={() => setMenu(menu === "subject" ? null : "subject")}
          onSelect={(value) => { setScope({ subjectId: value, chapter: RANDOM_RECALL_SCOPE, exerciseId: ALL_RECALL_EXERCISES }); setMenu(null); }} />
        <RecallScopeDropdown label="Chapter" value={scope.chapter} disabled={!selectedSubject} open={menu === "chapter"} options={chapterOptions}
          onToggle={() => selectedSubject && setMenu(menu === "chapter" ? null : "chapter")}
          onSelect={(value) => { setScope((current) => ({ ...current, chapter: value, exerciseId: ALL_RECALL_EXERCISES })); setMenu(null); }} />
        <RecallScopeDropdown label="Exercise" value={scope.exerciseId ?? ALL_RECALL_EXERCISES} disabled={!selectedChapter} open={menu === "exercise"} options={exerciseOptions}
          onToggle={() => selectedChapter && setMenu(menu === "exercise" ? null : "exercise")}
          onSelect={(exerciseId) => { setScope((current) => ({ ...current, exerciseId })); setMenu(null); }} />
        <Text style={styles.setupLabel}>QUESTIONS</Text>
        <View style={styles.countOptions}>
          {RECALL_QUESTION_COUNTS.map((count) => <Pressable key={count} accessibilityRole="radio"
            accessibilityLabel={count + " questions"} accessibilityState={{ selected: questionCount === count }}
            onPress={() => { setQuestionCount(count); setMenu(null); }}
            style={[styles.countOption, questionCount === count && styles.countOptionSelected]}>
            <Text style={[styles.countText, questionCount === count && styles.countTextSelected]}>{count}</Text>
          </Pressable>)}
        </View>
        <Pressable style={styles.start} onPress={() => void load()}>
          <Text style={styles.nextText}>Start recall</Text><MaterialCommunityIcons name="arrow-right" size={17} color={colors.accentDeep} />
        </Pressable>
      </View>
    </ScrollView>
  </View>;
  if (!quiz?.questions.length) return <View style={styles.page}><View style={styles.card}><Text style={styles.kicker}>QUICK RECALL</Text><Text style={styles.empty}>Add question-based exercises first.</Text><Pressable onPress={onClose}><Text style={styles.link}>Open practice</Text></Pressable></View></View>;
  if (quiz.status === "complete") return <View style={styles.page}><View style={[styles.card, styles.center]}><View style={styles.completeIcon}><MaterialCommunityIcons name="creation-outline" size={23} color={colors.accent} /></View><Text style={styles.kicker}>RECALL FINISHED</Text><Text style={styles.score}>{quiz.correct}/{quiz.questions.length} correct</Text><Text style={styles.muted}>{quiz.subject} · saved to today’s practice</Text><View style={styles.actions}><Pressable style={styles.outline} onPress={onGoProfile}><Text style={styles.outlineText}>View profile</Text></Pressable><Pressable style={styles.primary} onPress={() => { setQuiz(null); setSetup(true); }}><Text style={styles.primaryText}>Again</Text></Pressable></View></View></View>;
  const question = quiz.questions[quiz.index];
  const selected = quiz.selected;
  const review = quiz.status === "review" || quiz.status === "correction";
  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content}><View style={styles.card}><View style={styles.metaRow}><View><Text style={styles.kicker}>{quiz.subject}</Text><Text style={styles.questionCount}>{quiz.index + 1}/{quiz.questions.length}</Text></View>{quiz.status === "correction" && <Text style={styles.timer}>{secondsLeft}s</Text>}</View><Text style={styles.question}>{question.question}</Text><View style={styles.options}>{choices.map((choice, index) => { const isCorrect = review && choice === question.correctAnswer; const wrong = review && choice === selected && choice !== question.correctAnswer; return <Pressable disabled={Boolean(selected)} key={choice} onPress={() => void answer(choice)} style={[styles.option, isCorrect && styles.correct, wrong && styles.wrong]}><Text style={styles.optionKey}>{choice}</Text><Text style={styles.optionText}>{question.options[index]}</Text>{isCorrect && <MaterialCommunityIcons name="check" size={17} color="#86efac" />}</Pressable>; })}</View>{selected && <><View style={styles.explanation}><Text style={styles.explanationText}>{question.explanation || `Correct answer: ${question.correctAnswer}`}</Text></View><Pressable disabled={quiz.status !== "review"} onPress={() => void next()} style={[styles.next, quiz.status !== "review" && styles.disabled]}><Text style={styles.nextText}>{quiz.status === "correction" ? `Next in ${secondsLeft}s` : quiz.index + 1 === quiz.questions.length ? "Finish" : "Next"}</Text><MaterialCommunityIcons name="arrow-right" size={17} color={colors.accentDeep} /></Pressable></>}</View></ScrollView></View>;
}

const styles = createThemedStyles({
  setupHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#282828", borderWidth: 1, borderColor: "#3a3a3a" },
  countOptions: { flexDirection: "row", gap: 8 },
  countOption: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#3f3f46", backgroundColor: "#202020" },
  countOptionSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  countText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  countTextSelected: { color: colors.accentDeep },
 page: { flex: 1, backgroundColor: colors.background }, content: { padding: 13, paddingTop: 18, paddingBottom: 100 }, card: { borderRadius: 16, padding: 16, backgroundColor: "#1b1b1b" }, setupTitle: { color: colors.text, fontSize: 21, fontWeight: "700", marginTop: 3 }, setupCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }, setupLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.3, fontWeight: "800", marginTop: 20, marginBottom: 7 }, setupSelect: { height: 48, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: "#3f3f46", backgroundColor: "#202020", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, setupSelectOpen: { borderColor: colors.accent, backgroundColor: "#22272a" }, setupSelectDisabled: { opacity: .48 }, setupSelectText: { color: colors.text, fontSize: 14 }, setupSelectMuted: { color: colors.muted }, setupMenu: { marginTop: 5, borderRadius: 11, padding: 4, borderWidth: 1, borderColor: "#3b3b3b", backgroundColor: "#282828" }, setupOption: { minHeight: 39, paddingHorizontal: 10, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, setupOptionActive: { backgroundColor: "#f4f4f5" }, setupOptionText: { color: colors.text, fontSize: 13 }, setupOptionTextActive: { color: "#171717" }, start: { height: 44, marginTop: 23, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent }, metaRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }, questionCount: { marginTop: 4, color: colors.muted, fontSize: 12 }, timer: { minWidth: 44, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, overflow: "hidden", color: "#bfdbfe", backgroundColor: "#172b40", fontSize: 14, fontWeight: "800", textAlign: "center" }, center: { alignItems: "center", paddingVertical: 45 }, completeIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#162c45", marginBottom: 13 }, loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }, kicker: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, question: { marginTop: 15, color: colors.text, fontSize: 19, lineHeight: 28, fontWeight: "600" }, options: { gap: 8, marginTop: 19 }, option: { minHeight: 51, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: "#343434", backgroundColor: "#202020" }, optionKey: { width: 25, height: 25, borderRadius: 13, textAlign: "center", textAlignVertical: "center", color: "#a1a1aa", borderWidth: 1, borderColor: "#3f3f46", fontSize: 11 }, optionText: { flex: 1, color: "#e4e4e7", fontSize: 13, lineHeight: 18 }, correct: { borderColor: "#3f806c", backgroundColor: "#173a33" }, wrong: { borderColor: "#9f3944", backgroundColor: "#3a2023" }, explanation: { marginTop: 13, borderRadius: 10, padding: 11, backgroundColor: "#22272a" }, explanationText: { color: "#d4d4d8", fontSize: 12, lineHeight: 18 }, next: { height: 42, marginTop: 14, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent }, nextText: { color: colors.accentDeep, fontSize: 13, fontWeight: "700" }, disabled: { opacity: .45 }, score: { marginTop: 8, color: colors.text, fontSize: 25, fontWeight: "800" }, muted: { color: colors.muted, fontSize: 13 }, empty: { marginTop: 12, color: colors.text, fontSize: 16 }, link: { marginTop: 17, color: colors.accent, fontSize: 13, fontWeight: "700" }, actions: { flexDirection: "row", gap: 9, marginTop: 19 }, primary: { minWidth: 100, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent }, primaryText: { color: colors.accentDeep, fontWeight: "700" }, outline: { minWidth: 100, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#3f3f46" }, outlineText: { color: colors.text, fontWeight: "700" } });
