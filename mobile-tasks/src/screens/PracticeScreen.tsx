// @ts-nocheck
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { File } from "expo-file-system";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet as NativeStyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { snapshotQuestionPaper, applyQuestionDeletions, mergeQuestionDeletions, removeBankQuestion, isQuestionAttempt } from "../domain/question-deletion";
import { ALL_PRACTICE_EXERCISES, ALL_PRACTICE_EXERCISES_LABEL, combineQuestionExercises, samplePracticeQuestions } from "../domain/practice-exercises";
import { QuestionPalette } from "../components/QuestionNavigation";
import { useQuestionSwipe } from "../hooks/use-question-swipe";
import { colors } from "../theme";
import { dateKey } from "../domain/tasks";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
import { deletePracticeEntity, migratePracticeEntities, patchPracticeSettings, readPracticeSettings, syncPracticeEntities, watchPracticeEntities, watchPracticeSettings } from "../lib/firebase";

const ScrollView = (props: any) => (
  <NativeScrollView
    {...props}
    scrollEventThrottle={16}
    onScroll={(event) => {
      if (!props.horizontal) reportVerticalScroll(event.nativeEvent.contentOffset.y);
      props.onScroll?.(event);
    }}
  />
);

// Missing keys fall back to a safe empty style while the screen's shared palette remains intact.
const StyleSheet = {
  ...NativeStyleSheet,
  create: (styles: Record<string, unknown>) =>
    new Proxy(NativeStyleSheet.create(styles), {
      get: (target, key) =>
        typeof key === "string" && !(key in target)
          ? {}
          : (target as Record<string, unknown>)[key as string],
    }),
};

type Option = "A" | "B" | "C" | "D";
type Question = {
  id: string;
  number?: number;
  question: string;
  options: [string, string, string, string];
  correctAnswer: Option;
  explanation?: string;
};
type Exercise = {
  id: string;
  name: string;
  questionCount: number;
  answerKey: Array<Option | null>;
  questions?: Question[];
  attemptOf?: string;
};
type Chapter = { id: string; name: string; exercises: Exercise[] };
type Subject = { deletedQuestionIds?: string[]; id: string; name: string; chapters: Chapter[] };
type Record = {
  id: string;
  createdAt: string;
  /** Canonical web CBT attempt fields. UI-only aliases below are retained while old mobile screens are migrated. */
  date: string;
  testMode: "standard" | "random" | "quick-recall";
  attemptGroupId?: string;
  subjectId: string;
  subject: string;
  chapterId: string;
  chapter: string;
  exerciseId: string;
  exercise: string;
  startNumber: number;
  durationMinutes: number | null;
  timeTakenSeconds: number;
  minutes: number;
  answers: Array<Option | null>;
  answerKey: Array<Option | null>;
  questionNumbers?: number[];
  questionIds?: string[];
  key: Array<Option | null>;
  correct: number;
  wrong: number;
  score: number;
  duration?: number;
  marking?: { positive: number; negative: number };
  questions?: Question[];
};
type Bank = { subjects: Subject[]; marking: { positive: number; negative: number } };
type Phase = "setup" | "key" | "instructions" | "test" | "history" | "bank";
// These are the exact web CBT cache keys. Old mobile keys are read once only for migration.
const STORE = "cbt-subjects";
const HISTORY = "cbt-history";
const FAVOURITES = "cbt-favorite-questions";
const MARKING = "cbt-marking";
const LEGACY_STORE = "ssc-buddy-mobile:practice-bank:v1";
const LEGACY_HISTORY = "ssc-buddy-mobile:practice-history:v1";
const LEGACY_FAVOURITES = "ssc-buddy-mobile:favourite-questions:v1";
/** The Firestore payload is deliberately the web CBT contract, never the mobile view model. */
const toCloudSubjects = (subjects: Subject[]) => subjects.map((subject) => ({
  id: subject.id,
  name: subject.name,
  ...(subject.deletedQuestionIds ? { deletedQuestionIds: subject.deletedQuestionIds } : {}),
  chapters: subject.chapters.map((chapter) => ({
    id: chapter.id,
    name: chapter.name,
    questionCount: null,
    answerKey: null,
    exercises: chapter.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      questionCount: exercise.questionCount,
      answerKey: exercise.answerKey,
      ...(exercise.questions ? { questions: exercise.questions } : {}),
    })),
  })),
}));
const toCloudRecord = (record: Record) => ({
  id: record.id,
  date: record.date || record.createdAt.slice(0, 10),
  createdAt: record.createdAt,
  testMode: record.testMode ?? "standard",
  ...(record.attemptGroupId ? { attemptGroupId: record.attemptGroupId } : {}),
  subjectId: record.subjectId,
  subject: record.subject,
  chapterId: record.chapterId,
  chapter: record.chapter,
  exerciseId: record.exerciseId,
  exercise: record.exercise,
  startNumber: record.startNumber ?? 1,
  durationMinutes: record.durationMinutes ?? record.duration ?? record.minutes,
  timeTakenSeconds: record.timeTakenSeconds ?? Math.max(0, record.minutes * 60),
  answers: record.answers,
  ...(record.questionNumbers ? { questionNumbers: record.questionNumbers } : {}),
  ...(record.questionIds ? { questionIds: record.questionIds } : {}),
  answerKey: record.answerKey ?? record.key,
  ...(record.questions ? { questions: record.questions } : {}),
  correct: record.correct,
  wrong: record.wrong,
  marking: record.marking,
  score: record.score,
});
const choices: Option[] = ["A", "B", "C", "D"];
const examAccent = "#60a5fa";
const examAccentSurface = "#162c45";
const QUESTION_JSON_PROMPT = `Create an SSC Buddy question-bank JSON file. Return ONLY valid JSON, with no markdown or explanation.

Use this exact shape:
[
  {
    "id": "unique-question-id",
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "A",
    "explanation": "Short explanation"
  }
]

Rules: every question needs exactly four options; correctAnswer must be A, B, C, or D; each id must be unique.`;
const examAccentDeep = "#081a31";
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const defaultMarking = { positive: 4, negative: 1 };
const normaliseMarking = (value: unknown) => {
  const candidate = value as Partial<Bank["marking"]> | null;
  const positive = Number(candidate?.positive);
  const negative = Number(candidate?.negative);
  return {
    positive: Number.isFinite(positive) && positive >= 0 ? positive : defaultMarking.positive,
    negative: Number.isFinite(negative) && negative >= 0 ? negative : defaultMarking.negative,
  };
};
const defaultBank: Bank = {
  marking: defaultMarking,
  subjects: [],
};

export function PracticeScreen({ user, onOpenQuickRecall }: { user: any; onOpenQuickRecall: () => void }) {
  useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [bank, setBank] = useState<Bank>(defaultBank);
  const [history, setHistory] = useState<Record[]>([]);
  const [reattemptOf, setReattemptOf] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [start, setStart] = useState("1");
  const [count, setCount] = useState("20");
  const [fixed, setFixed] = useState(true);
  const [random, setRandom] = useState(false);
  const [randomSeed, setRandomSeed] = useState(0);
  const [mixedPaper, setMixedPaper] = useState<Question[] | null>(null);
  const [activeTest, setActiveTest] = useState<Partial<Record> | null>(null);
  const [answerKey, setAnswerKey] = useState<Array<Option | null>>([]);
  const [savingNewKey, setSavingNewKey] = useState(false);
  const [savingAnswerKey, setSavingAnswerKey] = useState(false);
  const [answers, setAnswers] = useState<Array<Option | null>>([]);
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [dialog, setDialog] = useState<"subject" | "chapter" | "exercise" | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [exerciseKind, setExerciseKind] = useState<"key" | "questions">("key");
  const [json, setJson] = useState("");
  const [jsonFileName, setJsonFileName] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [menu, setMenu] = useState<"subject" | "chapter" | "exercise" | null>(null);
  const [bankSubject, setBankSubject] = useState("all");
  const [viewingQuestions, setViewingQuestions] = useState<Exercise | null>(null);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [practiceLoaded, setPracticeLoaded] = useState(false);
  const bankRef = useRef(bank); const historyRef = useRef(history); const favouritesRef = useRef(favourites);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    void (async () => {
      const [subjectsRaw, legacyBankRaw, historyRaw, legacyHistoryRaw, favouritesRaw, legacyFavouritesRaw, markingRaw] = await Promise.all([AsyncStorage.getItem(STORE), AsyncStorage.getItem(LEGACY_STORE), AsyncStorage.getItem(HISTORY), AsyncStorage.getItem(LEGACY_HISTORY), AsyncStorage.getItem(FAVOURITES), AsyncStorage.getItem(LEGACY_FAVOURITES), AsyncStorage.getItem(MARKING)]);
      try {
        const candidate = subjectsRaw ?? legacyBankRaw;
        if (candidate) {
          const parsed = JSON.parse(candidate) as Subject[] | Bank;
          const next = Array.isArray(parsed)
            ? { ...bankRef.current, subjects: parsed }
            : { ...parsed, subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [], marking: normaliseMarking(parsed.marking) };
          bankRef.current = next; setBank(next);
          await AsyncStorage.setItem(STORE, JSON.stringify(next.subjects));
          if (!subjectsRaw && legacyBankRaw) await AsyncStorage.removeItem(LEGACY_STORE);
        }
      } catch {}
      try { if (markingRaw) { const marking = normaliseMarking(JSON.parse(markingRaw)); bankRef.current = { ...bankRef.current, marking }; setBank(bankRef.current); } } catch {}
      try { const candidate = historyRaw ?? legacyHistoryRaw; if (candidate) { const next = JSON.parse(candidate) as Record[]; historyRef.current = next; setHistory(next); await AsyncStorage.setItem(HISTORY, JSON.stringify(next)); if (!historyRaw && legacyHistoryRaw) await AsyncStorage.removeItem(LEGACY_HISTORY); } } catch {}
      try { const candidate = favouritesRaw ?? legacyFavouritesRaw; if (candidate) { const next = JSON.parse(candidate) as string[]; favouritesRef.current = next; setFavourites(next); await AsyncStorage.setItem(FAVOURITES, JSON.stringify(next)); if (!favouritesRaw && legacyFavouritesRaw) await AsyncStorage.removeItem(LEGACY_FAVOURITES); } } catch {}
      setPracticeLoaded(true);
    })();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
  const saveBank = (next: Bank) => {
    const previous = bankRef.current;
    next = { ...next, subjects: next.subjects.map(applyQuestionDeletions), marking: normaliseMarking(next.marking) };
    bankRef.current = next;
    setBank(next);
    void AsyncStorage.setItem(STORE, JSON.stringify(next.subjects));
    void AsyncStorage.setItem(MARKING, JSON.stringify(next.marking));
    return user
      ? syncPracticeEntities(user, "practiceSubjects", toCloudSubjects(previous.subjects) as any, toCloudSubjects(next.subjects) as any)
      : Promise.resolve();
  };
  const saveHistory = (next: Record[]) => {
    const previous = historyRef.current;
    historyRef.current = next;
    setHistory(next);
    void AsyncStorage.setItem(HISTORY, JSON.stringify(next));
    if (user) void syncPracticeEntities(user, "practiceAttempts", previous.map(toCloudRecord) as any, next.map(toCloudRecord) as any);
  };
  const saveFavourites = (next: string[]) => {
    const previous = favouritesRef.current;
    favouritesRef.current = next;
    setFavourites(next);
    void AsyncStorage.setItem(FAVOURITES, JSON.stringify(next));
    if (user) void syncPracticeEntities(user, "practiceFavourites", previous.map((id) => ({ id })) as any, next.map((id) => ({ id })) as any);
  };
  useEffect(() => {
    if (!user || !practiceLoaded) return;
    let stopped = false; const stops: Array<() => void> = [];
    void (async () => {
      await Promise.all([
        migratePracticeEntities(user, "practiceSubjects", toCloudSubjects(bankRef.current.subjects) as any),
        migratePracticeEntities(user, "practiceAttempts", historyRef.current.map(toCloudRecord) as any),
        migratePracticeEntities(user, "practiceFavourites", favouritesRef.current.map((id) => ({ id })) as any),
      ]);
      if (stopped) return;
      const settings = await readPracticeSettings(user);
      if (!settings?.marking || !Number.isFinite(Number((settings.marking as any)?.positive)) || !Number.isFinite(Number((settings.marking as any)?.negative))) {
        await patchPracticeSettings(user, { marking: bankRef.current.marking });
      }
      stops.push(
        watchPracticeEntities(user, "practiceSubjects", (items) => {
          const subjects = items.map((item) => mergeQuestionDeletions(item as any, bankRef.current.subjects.find((local) => local.id === item.id)));
          const next = { ...bankRef.current, subjects }; bankRef.current = next; setBank(next);
          void AsyncStorage.setItem(STORE, JSON.stringify(subjects));
          if (subjects.some((subject) => (subject.deletedQuestionIds ?? []).some((id) => !((items.find((item) => item.id === subject.id) as any)?.deletedQuestionIds ?? []).includes(id)))) void syncPracticeEntities(user, "practiceSubjects", items, toCloudSubjects(subjects) as any).catch(() => undefined);
        }),
        watchPracticeEntities(user, "practiceAttempts", (items) => { const next = items.map((item) => ({ ...item, minutes: Number(item.minutes ?? item.durationMinutes ?? Math.round(Number(item.timeTakenSeconds ?? 0) / 60)), key: item.key ?? item.answerKey ?? [], correct: Number(item.correct ?? 0), wrong: Number(item.wrong ?? 0), score: Number(item.score ?? 0), subject: String(item.subject ?? ""), chapter: String(item.chapter ?? ""), exercise: String(item.exercise ?? "") })) as Record[]; historyRef.current = next; setHistory(next); void AsyncStorage.setItem(HISTORY, JSON.stringify(next)); }),
        watchPracticeEntities(user, "practiceFavourites", (items) => { const next = items.map((item) => item.id); favouritesRef.current = next; setFavourites(next); void AsyncStorage.setItem(FAVOURITES, JSON.stringify(next)); }),
        watchPracticeSettings(user, (settings) => { const marking = normaliseMarking(settings?.marking); const next = { ...bankRef.current, marking }; bankRef.current = next; setBank(next); void AsyncStorage.setItem(MARKING, JSON.stringify(marking)); }),
      );
    })().catch(() => undefined);
    return () => { stopped = true; stops.forEach((stop) => stop()); };
  }, [user?.uid, practiceLoaded]);
  const subject = bank.subjects.find((item) => item.id === subjectId) ?? bank.subjects[0];
  const chapter = subject?.chapters.find((item) => item.id === chapterId) ?? subject?.chapters[0];
  const isAllExercises = exerciseId === ALL_PRACTICE_EXERCISES;
  const combinedExercise = useMemo(() => combineQuestionExercises(chapter?.exercises ?? []), [chapter]);
  const exercise = isAllExercises ? combinedExercise : (chapter?.exercises.find((item) => item.id === exerciseId) ?? chapter?.exercises[0]);
  useEffect(() => {
    if (!subject) return;
    if (!subject.chapters.some((item) => item.id === chapterId))
      setChapterId(subject.chapters[0]?.id ?? "");
  }, [subjectId, subject]);
  useEffect(() => {
    if (!chapter) return;
    if (isAllExercises && combinedExercise) {
      setFixed(true); setStart("1");
      setCount((current) => String(Math.max(1, Math.min(500, combinedExercise.questionCount, Number(current) || 20))));
      return;
    }
    if (!chapter.exercises.some((item) => item.id === exerciseId))
      setExerciseId(chapter.exercises[0]?.id ?? "");
    const active = chapter.exercises.find((item) => item.id === exerciseId) ?? chapter.exercises[0];
    if (active) setCount(String(active.questionCount));
    if (active) setStart("1");
  }, [chapterId, chapter, exerciseId]);
  const exerciseQuestionTotal = exercise?.questions?.length ?? exercise?.questionCount ?? 1;
  const isQuestionExercise = Array.isArray(exercise?.questions);
  const startNumber = isAllExercises || random ? 1 : Math.max(1, Math.min(exerciseQuestionTotal, Number(start) || 1));
  const availableQuestions = isAllExercises || random
    ? exerciseQuestionTotal
    : Math.max(1, exerciseQuestionTotal - startNumber + 1);
  const questionCount = isAllExercises && phase !== "setup" && mixedPaper ? mixedPaper.length : isAllExercises || fixed
    ? Math.max(1, Math.min(isAllExercises ? 500 : availableQuestions, availableQuestions, Number(count) || 1))
    : availableQuestions;
  const duration = Math.max(1, Math.min(180, Number(minutes) || 1));
  const canContinue = Boolean(subject && chapter && exercise && (!isQuestionExercise || exercise.questions.length > 0) && minutes.trim() && (!(isAllExercises || fixed) || count.trim()) && (isQuestionExercise ? (isAllExercises || random || start.trim()) : start.trim()));
  const setupQuestions = useMemo(() => {
    const questions = exercise?.questions ?? [];
    if (isAllExercises) return samplePracticeQuestions(questions, questionCount);
    if (!random) return questions.slice(startNumber - 1, startNumber - 1 + questionCount);
    const shuffle = <T,>(items: T[]) => {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
      }
      return copy;
    };
    // Favourite questions always fill the requested test first; only remaining
    // slots are chosen from ordinary questions, matching the web behaviour.
    const favouriteSet = new Set(favourites);
    const favouriteQuestions = questions.filter((question) => favouriteSet.has(question.id));
    const ordinaryQuestions = questions.filter((question) => !favouriteSet.has(question.id));
    return [...shuffle(favouriteQuestions), ...shuffle(ordinaryQuestions)].slice(0, questionCount);
  }, [exercise?.questions, favourites, isAllExercises, questionCount, random, randomSeed, startNumber]);
  const selectedQuestions = isAllExercises && phase !== "setup" && mixedPaper ? mixedPaper : setupQuestions;
  const title = [subject?.name, chapter?.name, exercise?.name].filter(Boolean).join(" · ");
  const selectSubject = (next: string) => {
    const item = bank.subjects.find((x) => x.id === next);
    setSubjectId(next);
    setChapterId(item?.chapters[0]?.id ?? "");
    setExerciseId(item?.chapters[0]?.exercises[0]?.id ?? "");
    setMenu(null);
  };
  const editExercise = () => {
    if (!exercise || isAllExercises) return;
    setEditingExerciseId(exercise.id);
    setDraft(exercise.name);
    setCount(String(exercise.questionCount));
    setExerciseKind(Array.isArray(exercise.questions) ? "questions" : "key");
    setAnswerKey(exercise.answerKey);
    setJson(
      exercise.questions
        ? JSON.stringify(
            exercise.questions.map((question) => ({
              id: question.id,
              question: question.question,
              options: question.options,
              correctAnswer: choices.indexOf(question.correctAnswer),
              ...(question.explanation ? { explanation: question.explanation } : {}),
            })),
            null,
            2,
          )
        : "",
    );
    setJsonError("");
    setJsonFileName(exercise.questions?.length ? "Current question file" : "");
    setDialog("exercise");
  };
  const chooseQuestionFile = async () => {
    const result = await File.pickFileAsync({ mimeTypes: ["application/json", "text/json"] });
    if (result.canceled) return;
    try {
      const raw = await result.result.text();
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || !parsed.length) throw new Error("Use a non-empty JSON array.");
      setJson(raw); setJsonFileName(result.result.name || "questions.json"); setJsonError("");
    } catch (error) { setJson(""); setJsonFileName(""); setJsonError(error instanceof Error ? error.message : "Choose a valid question JSON file."); }
  };
  const begin = () => {
    if (!exercise || !subject || !chapter)
      return Alert.alert("Select a topic", "Choose a subject, chapter and exercise first.");
    const paper = isAllExercises ? samplePracticeQuestions(exercise.questions ?? [], questionCount) : selectedQuestions;
    if (isAllExercises) setMixedPaper(paper);
    const key = Array.from(
      { length: questionCount },
      (_, index) =>
        paper?.[index]?.correctAnswer ??
        exercise.answerKey[startNumber - 1 + index] ??
        null,
    );
    setActiveTest({
      subjectId: subject.id, subject: subject.name, chapterId: chapter.id, chapter: chapter.name,
      exerciseId: exercise.id, exercise: exercise.name, startNumber,
      duration, durationMinutes: duration, marking: { ...bank.marking },
      testMode: isAllExercises || random ? "random" : "standard",
      ...(isQuestionExercise ? {
        questions: snapshotQuestionPaper(paper),
        questionIds: paper.map((question) => question.id),
        questionNumbers: paper.map((question, index) => isAllExercises ? index + 1 : question.number ?? startNumber + index),
      } : {}),
      answerKey: key, key,
    });
    setAnswerKey(key);
    setPhase("instructions");
  };
  const startTest = () => {
    setAnswers(Array(activeTest?.answerKey?.length ?? questionCount).fill(null));
    setCurrent(0);
    setRemaining((activeTest?.duration ?? duration) * 60);
    setPhase("test");
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(
      () =>
        setRemaining((value) => {
          if (value <= 1) {
            if (timer.current) clearInterval(timer.current);
            return 0;
          }
          return value - 1;
        }),
      1000,
    );
  };
  const submit = () => {
    if (!activeTest) return;
    if (timer.current) clearInterval(timer.current);
    const correct = answers.filter(
      (answer, index) => answer && answerKey[index] && answer === answerKey[index],
    ).length;
    const wrong = answers.filter(
      (answer, index) => answer && answerKey[index] && answer !== answerKey[index],
    ).length;
    const saved: Record = {
      ...activeTest,
      id: makeId(),
      createdAt: new Date().toISOString(),
      date: dateKey(),
      testMode: activeTest.testMode,
      ...(activeTest.testMode === "random" ? { attemptGroupId: reattemptOf ?? makeId() } : {}),
      subjectId: activeTest.subjectId,
      subject: activeTest.subject,
      chapterId: activeTest.chapterId,
      chapter: activeTest.chapter,
      exerciseId: activeTest.exerciseId,
      exercise: activeTest.exercise,
      startNumber: activeTest.startNumber,
      durationMinutes: activeTest.duration,
      timeTakenSeconds: Math.max(0, activeTest.duration * 60 - remaining),
      minutes: activeTest.duration - Math.floor(remaining / 60),
      answers,
      answerKey,
      key: answerKey,
      correct,
      wrong,
      score: correct * activeTest.marking.positive - wrong * activeTest.marking.negative,
      duration: activeTest.duration,
      marking: activeTest.marking,
      questions: activeTest.questions,
      attemptOf: reattemptOf ?? undefined,
    };
    const next = [saved, ...history];
    saveHistory(next);
    setReattemptOf(null);
    setPhase("history");
  };
  const saveKey = async (nextPhase: "setup" | "instructions" = "instructions") => {
    if (!exercise || !subject || !chapter) return;
    if (savingAnswerKey) return;
    setSavingAnswerKey(true);
    const next: Bank = {
      ...bank,
      subjects: bank.subjects.map((item) =>
        item.id !== subject.id
          ? item
          : {
              ...item,
              chapters: item.chapters.map((itemChapter) =>
                itemChapter.id !== chapter.id
                  ? itemChapter
                  : {
                      ...itemChapter,
                      exercises: itemChapter.exercises.map((itemExercise) =>
                        itemExercise.id === exercise.id
                          ? { ...itemExercise, answerKey }
                          : itemExercise,
                      ),
                    },
              ),
            },
      ),
    };
    // Wait for the canonical practiceSubjects write before leaving the key
    // editor. This makes a key edit durable even if the user immediately
    // changes tab or closes the app.
    try {
      await saveBank(next);
      setSavingNewKey(false);
      if (nextPhase === "instructions") {
        const key = answerKey.slice(startNumber - 1, startNumber - 1 + questionCount);
        setActiveTest({ subjectId: subject.id, subject: subject.name, chapterId: chapter.id, chapter: chapter.name, exerciseId: exercise.id, exercise: exercise.name, startNumber, duration, durationMinutes: duration, marking: { ...bank.marking }, testMode: "standard", answerKey: key, key });
        setAnswerKey(key);
      }
      setPhase(nextPhase);
    } finally {
      setSavingAnswerKey(false);
    }
  };
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    let openKeyEditor = false;
    if (dialog === "subject") {
      const next = { id: makeId(), name: value, chapters: [] as Chapter[] };
      saveBank({ ...bank, subjects: [...bank.subjects, next] });
      setSubjectId(next.id);
      setChapterId("");
      setExerciseId("");
    }
    if (dialog === "chapter" && subject) {
      const next = { id: makeId(), name: value, exercises: [] as Exercise[] };
      saveBank({
        ...bank,
        subjects: bank.subjects.map((item) =>
          item.id === subject.id ? { ...item, chapters: [...item.chapters, next] } : item,
        ),
      });
      setChapterId(next.id);
      setExerciseId("");
    }
    if (dialog === "exercise" && subject && chapter) {
      let questions: Question[] | undefined;
      if (exerciseKind === "questions") {
        try {
          const parsed = JSON.parse(json) as unknown;
          if (!Array.isArray(parsed) || !parsed.length)
            throw new Error("Use a non-empty JSON array.");
          questions = parsed.map((item, index) => {
            const question = item as Partial<Question> & { correctAnswer?: number | Option };
            const answer =
              typeof question.correctAnswer === "number"
                ? choices[question.correctAnswer]
                : question.correctAnswer;
            if (
              !question.question ||
              !Array.isArray(question.options) ||
              question.options.length !== 4 ||
              !answer
            )
              throw new Error(`Question ${index + 1} is invalid.`);
            return {
              id: question.id || makeId(),
              question: question.question,
              options: question.options as [string, string, string, string],
              correctAnswer: answer,
              explanation: question.explanation,
            };
          });
        } catch (error) {
          setJsonError(error instanceof Error ? error.message : "Invalid JSON.");
          return;
        }
      }
      const quantity = questions?.length ?? Math.max(1, Math.min(500, Number(count) || 20));
      const existing = chapter.exercises.find((item) => item.id === editingExerciseId);
      const next = {
        id: existing?.id ?? makeId(),
        name: value,
        questionCount: quantity,
        answerKey: questions
          ? questions.map((item) => item.correctAnswer)
          : Array.from({ length: quantity }, (_, index) => existing?.answerKey[index] ?? null),
        questions,
      };
      saveBank({
        ...bank,
        subjects: bank.subjects.map((item) =>
          item.id !== subject.id
            ? item
            : {
                ...item,
                chapters: item.chapters.map((itemChapter) =>
                  itemChapter.id === chapter.id
                    ? {
                        ...itemChapter,
                        exercises: existing
                          ? itemChapter.exercises.map((itemExercise) =>
                              itemExercise.id === existing.id ? next : itemExercise,
                            )
                          : [...itemChapter.exercises, next],
                      }
                    : itemChapter,
                ),
              },
        ),
      });
      setExerciseId(next.id);
      if (exerciseKind === "key") {
        setCount(String(quantity));
        setAnswerKey(next.answerKey);
        setSavingNewKey(true);
        openKeyEditor = true;
      }
    }
    setDraft("");
    setJson("");
    setJsonFileName("");
    setJsonError("");
    setEditingExerciseId(null);
    setDialog(null);
    if (openKeyEditor) setPhase("key");
  };
  if (!practiceLoaded) return <View style={s.page}><View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="small" color="#60a5fa" /></View></View>;
  if (phase === "history")
    return (
      <History
        records={history}
        subjects={bank.subjects}
        onBack={() => {
          setReattemptOf(null);
          setPhase("setup");
        }}
        onDelete={(id) => {
          const next = history.filter((record) => record.id !== id);
          saveHistory(next);
          // Keep the list diff sync for consistency, but also delete this
          // attempt directly from its canonical Firestore document.
          if (user) void deletePracticeEntity(user, "practiceAttempts", id);
        }}
        onUpdate={(updated) => {
          const next = history.map((record) => (record.id === updated.id ? updated : record));
          saveHistory(next);
        }}
        onReattempt={(record) => {
          if (isQuestionAttempt(record)) {
            if (!record.questions?.length || record.questions.length !== record.answers.length) return Alert.alert("Paper unavailable", "This attempt does not contain a complete saved paper.");
            setActiveTest({ ...record, duration: record.durationMinutes ?? record.duration ?? 30, answerKey: record.answerKey ?? record.key, key: record.answerKey ?? record.key, marking: record.marking ?? bank.marking });
            setAnswerKey(record.answerKey ?? record.key);
            setReattemptOf(record.attemptGroupId ?? record.id);
            setPhase("instructions");
            return;
          }
          setReattemptOf(
            record.testMode === "random" ? (record.attemptGroupId ?? record.id) : record.id,
          );
          const nextSubject = bank.subjects.find((item) => item.name === record.subject);
          const nextChapter = nextSubject?.chapters.find((item) => item.name === record.chapter);
          const nextExercise = nextChapter?.exercises.find((item) => item.name === record.exercise);
          if (nextSubject) setSubjectId(nextSubject.id);
          if (nextChapter) setChapterId(nextChapter.id);
          if (record.exerciseId === ALL_PRACTICE_EXERCISES || record.exercise === ALL_PRACTICE_EXERCISES_LABEL) setExerciseId(ALL_PRACTICE_EXERCISES);
          else if (nextExercise) setExerciseId(nextExercise.id);
          setMinutes(String(record.duration ?? Math.max(1, record.minutes)));
          setCount(String(record.answers.length));
          setStart("1");
          setRandom(record.testMode === "random");
          setFixed(true);
          setPhase("setup");
        }}
      />
    );
  if (phase === "bank")
    return (
      <QuestionBank
        subjects={bank.subjects}
        filter={bankSubject}
        onFilter={setBankSubject}
        favourites={favourites}
        onToggleFavourite={(questionId) => {
          const next = favourites.includes(questionId)
            ? favourites.filter((id) => id !== questionId)
            : [...favourites, questionId];
          saveFavourites(next);
        }}
        onDeleteQuestion={(exerciseId, questionId) => {
          const next = { ...bankRef.current, subjects: bankRef.current.subjects.map((item) => removeBankQuestion(item, exerciseId, questionId)) };
          void saveBank(next).catch(() => Alert.alert("Sync pending", "Connect to sync this change."));
          const stillUsed = next.subjects.some((item) => item.chapters.some((chapter) => chapter.exercises.some((exercise) => exercise.questions?.some((question) => question.id === questionId))));
          if (!stillUsed) saveFavourites(favouritesRef.current.filter((id) => id !== questionId));
        }}
        viewing={viewingQuestions}
        onView={setViewingQuestions}
        onBack={() => {
          setViewingQuestions(null);
          setPhase("setup");
        }}
      />
    );
  if (phase === "key")
    return (
      <KeyScreen
        count={answerKey.length || questionCount}
        values={answerKey}
        saving={savingAnswerKey}
        onChange={setAnswerKey}
        onBack={() => {
          setSavingNewKey(false);
          setPhase("setup");
        }}
        onSave={() => saveKey(savingNewKey ? "setup" : "instructions")}
      />
    );
  if (phase === "instructions")
    return (
      <Instructions
        title={[activeTest?.subject, activeTest?.chapter, activeTest?.exercise].filter(Boolean).join(" · ")}
        duration={activeTest?.duration ?? duration}
        count={activeTest?.answerKey?.length ?? questionCount}
        marking={activeTest?.marking ?? bank.marking}
        onBack={() => setPhase("setup")}
        onStart={startTest}
      />
    );
  if (phase === "test")
    return (
      <TestScreen
        title={[activeTest?.subject, activeTest?.chapter, activeTest?.exercise].filter(Boolean).join(" · ")}
        seconds={remaining}
        current={current}
        count={activeTest?.answerKey?.length ?? questionCount}
        questions={activeTest?.questions}
        answers={answers}
        onPick={(choice) =>
          setAnswers((value) =>
            value.map((answer, index) =>
              index === current ? (answer === choice ? null : choice) : answer,
            ),
          )
        }
        onCurrent={setCurrent}
        onSubmit={submit}
      />
    );
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>PRACTICE SESSION</Text>
          <Text style={s.title}>Practice</Text>
        </View>
        <View style={s.headerActions}>
          <Pressable accessibilityLabel="Open quick recall" onPress={onOpenQuickRecall} style={s.linkButton}>
            <MaterialCommunityIcons name="creation-outline" color={colors.muted} size={20} />
          </Pressable>
          <Pressable accessibilityLabel="Open question bank" onPress={() => setPhase("bank")} style={s.linkButton}>
            <MaterialCommunityIcons
              name="book-open-page-variant-outline"
              color={colors.muted}
              size={20}
            />
          </Pressable>
          <Pressable accessibilityLabel="Open previous sessions" onPress={() => setPhase("history")} style={s.linkButton}>
            <MaterialCommunityIcons name="history" color={colors.muted} size={20} />
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => setMenu(null)} onTouchStart={() => { if (menu) setMenu(null); }}>
        <SetupSelect
          label="Subject"
          value={subject?.name ?? "Select subject"}
          open={menu === "subject"}
          onPress={() => setMenu(menu === "subject" ? null : "subject")}
          items={bank.subjects.map((x) => ({ id: x.id, label: x.name }))}
          onSelect={selectSubject}
          onAdd={() => { setMenu(null); setDialog("subject"); }}
        />
        <SetupSelect
          label="Chapter"
          value={chapter?.name ?? "Select chapter"}
          open={menu === "chapter"}
          onPress={() => setMenu(menu === "chapter" ? null : "chapter")}
          items={subject?.chapters.map((x) => ({ id: x.id, label: x.name })) ?? []}
          onSelect={(value) => {
            setChapterId(value);
            setExerciseId(subject?.chapters.find((x) => x.id === value)?.exercises[0]?.id ?? "");
            setMenu(null);
          }}
          onAdd={() => { setMenu(null); setDialog("chapter"); }}
          disabled={!subject}
        />
        <SetupSelect
          label="Exercise"
          value={exercise?.name ?? "Select exercise"}
          open={menu === "exercise"}
          onPress={() => setMenu(menu === "exercise" ? null : "exercise")}
          items={[...(combinedExercise ? [{ id: ALL_PRACTICE_EXERCISES, label: `${ALL_PRACTICE_EXERCISES_LABEL} · ${combinedExercise.questionCount}Q` }] : []), ...(chapter?.exercises.map((x) => ({ id: x.id, label: x.name })) ?? [])]}
          onSelect={(value) => {
            setExerciseId(value);
            setMenu(null);
          }}
          onAdd={() => { setMenu(null); setJson(""); setJsonFileName(""); setJsonError(""); setDialog("exercise"); }}
          disabled={!chapter}
        />
        {exercise && !isAllExercises ? (
          <Pressable onPress={editExercise} style={s.exerciseEdit}>
            <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.accent} />
            <Text style={s.exerciseEditText} numberOfLines={1}>
              Edit answer key
            </Text>
          </Pressable>
        ) : null}
        {isQuestionExercise && !exercise.questions.length && <Text style={s.bankSubhead}>No questions left in this exercise. Add questions or select another exercise.</Text>}
        <View style={s.practiceSetupCard}>
          <Text style={s.label}>TIMING</Text>
          <TextInput
            value={minutes}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, "");
              setMinutes(digits === "" ? "" : String(Math.min(180, Number(digits))));
            }}
            onBlur={() => setMinutes(String(duration))}
            keyboardType="number-pad"
            maxLength={3}
            style={[s.input, s.timingInput]}
            placeholder="Minutes"
            placeholderTextColor={colors.subdued}
          />
          <View style={[s.presetRow, s.timingPresetRow]}>
            {[15, 30, 45, 60].map((value) => (
              <Pressable
                key={value}
                onPress={() => setMinutes(String(value))}
                style={[s.preset, s.timingPreset, Number(minutes) === value && s.presetActive]}
              >
                <Text allowFontScaling={false} style={[s.presetText, s.timingPresetText, Number(minutes) === value && s.presetTextActive]}>
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
          {!isAllExercises && <><TextInput
            value={start}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, "");
              const nextStart = Math.max(1, Math.min(exerciseQuestionTotal, Number(digits) || 1));
              const nextAvailable = Math.max(1, exerciseQuestionTotal - nextStart + 1);
              setStart(digits === "" ? "" : String(nextStart));
              setCount((current) => current === "" ? current : String(Math.max(1, Math.min(nextAvailable, Number(current) || 1))));
            }}
            onBlur={() => { setStart(String(startNumber)); setCount(String(questionCount)); }}
            editable={!(isQuestionExercise && random)}
            keyboardType="number-pad"
            maxLength={String(exerciseQuestionTotal).length}
            style={[s.input, isQuestionExercise && random && s.inputDisabled]}
            placeholder="Start question no."
            placeholderTextColor={colors.subdued}
          />
          <Text style={s.helper}>{isQuestionExercise && random ? "Random test selects from the entire exercise." : `Numbering begins at Q${startNumber}. Chapter total ${exerciseQuestionTotal}.`}</Text></>}
        <View style={s.configDivider} />
        <View style={s.configSection}>
          <Text style={s.label}>QUESTIONS</Text>
          {isQuestionExercise && !isAllExercises && <View style={s.modeRow}>
            <Pressable onPress={() => setRandom(false)} style={[s.mode, !random && s.modeActive]}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[s.modeText, !random && s.modeTextActive]}>Sequential</Text>
            </Pressable>
            <Pressable
              disabled={!exercise?.questions?.length}
              onPress={() => {
                setRandom(true);
                setFixed(true);
                setStart("1");
                setRandomSeed((seed) => seed + 1);
              }}
              style={[s.mode, random && s.modeActive, !exercise?.questions?.length && s.disabled]}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[s.modeText, random && s.modeTextActive]}>Random</Text>
            </Pressable>
          </View>}
          {!isAllExercises && <View style={s.modeRow}>
            <Pressable
              disabled={random}
              onPress={() => setFixed(false)}
              style={[s.mode, !fixed && s.modeActive, random && s.disabled]}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[s.modeText, !fixed && s.modeTextActive]}>Unlimited</Text>
            </Pressable>
            <Pressable onPress={() => setFixed(true)} style={[s.mode, fixed && s.modeActive]}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[s.modeText, fixed && s.modeTextActive]}>Fixed count</Text>
            </Pressable>
          </View>}
          {(isAllExercises || fixed) && (
            <TextInput
              value={count}
              onChangeText={(value) => {
                const digits = value.replace(/\D/g, "");
                setCount(
                  digits === ""
                    ? ""
                    : String(Math.max(1, Math.min(isAllExercises ? 500 : availableQuestions, availableQuestions, Number(digits) || 1))),
                );
              }}
              onBlur={() => setCount(String(questionCount))}
              keyboardType="number-pad"
              maxLength={String(exerciseQuestionTotal).length}
              style={s.input}
              placeholder="Question count"
              placeholderTextColor={colors.subdued}
            />
          )}
          <Text style={s.helper}>
            {isAllExercises ? `${questionCount} questions mixed from all question-based exercises (${exerciseQuestionTotal} available).` : random
              ? "Random test starts at 1. Favourites are selected first."
              : fixed
                ? `Questions Q${startNumber}–Q${startNumber + questionCount - 1} of ${exerciseQuestionTotal}`
                : "Solve until the timer ends."}
          </Text>
        </View>
        <View style={s.configDivider} />
        <MarkingCard embedded marking={bank.marking} onSave={(marking) => saveBank({ ...bank, marking })} />
        <Pressable disabled={!canContinue} style={[s.primary, s.setupContinue, !canContinue && s.disabled]} onPress={begin}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[s.primaryText, s.primaryWideText]}>Continue to instructions</Text>
          <MaterialCommunityIcons name="arrow-right" size={19} color={examAccentDeep} />
        </Pressable>
        </View>
      </ScrollView>
      <AddDialog
        visible={dialog !== null}
        title={
          dialog === "subject"
            ? "Add subject"
            : dialog === "chapter"
              ? "Add chapter"
              : "Add exercise"
        }
        value={draft}
        onChange={setDraft}
        kind={exerciseKind}
        onKind={setExerciseKind}
        count={count}
        onCount={setCount}
        json={json}
        onJson={setJson}
        jsonFileName={jsonFileName}
        onChooseQuestionFile={() => void chooseQuestionFile()}
        error={jsonError}
        editing={editingExerciseId !== null}
        onClose={() => {
          setDialog(null);
          setJsonError("");
          setJsonFileName("");
          setEditingExerciseId(null);
        }}
        onSave={add}
      />
    </KeyboardAvoidingView>
  );
}

function SetupSelect({
  label,
  value,
  open,
  items,
  disabled,
  onPress,
  onSelect,
  onAdd,
}: {
  label: string;
  value: string;
  open: boolean;
  items: { id: string; label: string }[];
  disabled?: boolean;
  onPress: () => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
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

  return (
    <View style={[s.selectGroup, open && s.selectGroupOpen]}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Pressable disabled={disabled} onPress={onPress} style={[s.select, disabled && s.disabled]}>
        <Text numberOfLines={1} style={[s.selectText, !items.length && s.selectPlaceholder]}>{value}</Text>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.muted}
        />
      </Pressable>
      {renderMenu && (
        <Animated.View style={[s.menu, { opacity: visibility, transform: [{ translateY: visibility.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }, { scale: visibility.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]} pointerEvents={open ? "auto" : "none"}>
          <NativeScrollView nestedScrollEnabled style={s.menuList} keyboardShouldPersistTaps="handled">
            {items.map((item) => (
              <Pressable key={item.id} onPress={() => onSelect(item.id)} style={[s.menuItem, item.label === value && s.menuItemSelected]}>
                <Text numberOfLines={1} style={[s.menuText, item.label === value && s.menuTextSelected]}>{item.label}</Text>
                {item.label === value && <MaterialCommunityIcons name="check" size={16} color="#171717" />}
              </Pressable>
            ))}
          </NativeScrollView>
          <Pressable onPress={onAdd} style={s.addItem}>
            <MaterialCommunityIcons name="plus" size={16} color={colors.accent} />
            <Text style={s.addItemText}>Add {label.toLowerCase()}</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}
function KeyScreen({
  count,
  values,
  onChange,
  onBack,
  onSave,
  saving,
}: {
  count: number;
  values: Array<Option | null>;
  onChange: (value: Array<Option | null>) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const filled = values.filter(Boolean).length;
  const complete = filled === count;
  return (
    <View style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>ANSWER KEY</Text>
          <Text style={s.title}>
            {filled}/{count} filled
          </Text>
        </View>
        <Pressable onPress={onBack}>
          <Text style={s.back}>Back</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.helper}>
          Fill all answers to save this exercise. Answer keys cannot be skipped.
        </Text>
        {Array.from({ length: count }, (_, index) => (
          <View key={index} style={s.keyRow}>
            <Text style={s.keyQuestion}>Q{index + 1}</Text>
            <View style={s.optionRow}>
              {choices.map((choice) => (
                <Pressable
                  key={choice}
                  onPress={() =>
                    onChange(
                      values.map((value, i) =>
                        i === index ? (value === choice ? null : choice) : value,
                      ),
                    )
                  }
                  style={[s.option, values[index] === choice && s.optionActive]}
                >
                  <Text style={[s.optionText, values[index] === choice && s.optionTextActive]}>
                    {choice}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <Pressable
          disabled={!complete || saving}
          style={[s.primary, (!complete || saving) && s.disabled]}
          onPress={onSave}
        >
          {saving ? <ActivityIndicator size="small" color={colors.accentDeep} /> : <Text style={s.primaryText}>Save answer key</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}
function MarkingCard({
  marking,
  onSave,
  embedded = false,
}: {
  marking: Bank["marking"];
  onSave: (next: Bank["marking"]) => void;
  embedded?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [positive, setPositive] = useState(String(marking.positive));
  const [negative, setNegative] = useState(String(marking.negative));
  const clean = (value: string) => value.replace(/[^0-9.]/g, "");
  const beginEditing = () => {
    setPositive(String(marking.positive));
    setNegative(String(marking.negative));
    setEditing(true);
  };
  const save = () => {
    onSave({
      positive: Math.max(0, Number(positive) || 0),
      negative: Math.max(0, Number(negative) || 0),
    });
    setEditing(false);
  };
  return (
    <View style={embedded ? s.markingEmbedded : s.card}>
      <Pressable onPress={editing ? save : beginEditing} style={s.markingHeader}>
        <Text style={s.label}>MARKING SCHEME</Text>
        <Text style={s.markingInlineValue}>{editing ? "Done" : `+${marking.positive} / −${marking.negative}`}</Text>
      </Pressable>
      {editing ? (
        <View style={s.markingInputs}>
          <View style={s.markingField}>
            <Text style={s.markingFieldLabel}>Correct +</Text>
            <TextInput
              value={positive}
              onChangeText={(value) => setPositive(clean(value))}
              keyboardType="decimal-pad"
              style={s.markingInput}
            />
          </View>
          <View style={s.markingField}>
            <Text style={s.markingFieldLabel}>Wrong −</Text>
            <TextInput
              value={negative}
              onChangeText={(value) => setNegative(clean(value))}
              keyboardType="decimal-pad"
              style={s.markingInput}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Instructions({
  title,
  duration,
  count,
  marking,
  onBack,
  onStart,
}: {
  title: string;
  duration: number;
  count: number;
  marking: Bank["marking"];
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <View style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>BEFORE YOU BEGIN</Text>
          <Text style={s.title}>Test instructions</Text>
        </View>
        <Pressable onPress={onBack}>
          <Text style={s.back}>Back</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <Text style={s.sessionTitle}>{title}</Text>
          <View style={s.infoGrid}>
            <Info icon="clock-outline" label="Duration" value={`${duration} minutes`} />
            <Info icon="format-list-numbered" label="Questions" value={String(count)} />
            <Info
              icon="check-decagram-outline"
              label="Marking"
              value={`+${marking.positive} / −${marking.negative}`}
            />
          </View>
        </View>
        <View style={s.card}>
          <Text style={s.sectionTitle}>HOW THIS TEST WORKS</Text>
          <Text style={s.instructions}>
            • The timer starts only after Start test.{"\n\n"}• Choose A, B, C or D for every
            question.{"\n\n"}• Use the question palette to jump between questions.{"\n\n"}• Submit
            anytime; answers are saved in Previous sessions.
          </Text>
        </View>
        <Pressable style={s.primary} onPress={onStart}>
          <MaterialCommunityIcons name="play" color={examAccentDeep} size={18} />
          <Text style={s.primaryText}>Start test</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
function TestScreen({
  title,
  seconds,
  current,
  count,
  questions,
  answers,
  onPick,
  onCurrent,
  onSubmit,
}: {
  title: string;
  seconds: number;
  current: number;
  count: number;
  questions?: Question[];
  answers: Array<Option | null>;
  onPick: (choice: Option) => void;
  onCurrent: (value: number) => void;
  onSubmit: () => void;
}) {
  const display = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const question = questions?.[current];
  const swipeHandlers = useQuestionSwipe(current, count, onCurrent);
  return (
    <View style={s.page}>
      <View style={s.testHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.testTitle}>Question {current + 1}</Text>
        </View>
        <Text style={s.timer}>{display}</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.questionCard} {...swipeHandlers}>
          <Text style={s.questionText}>{question?.question ?? `Question ${current + 1}`}</Text>
          {!question ? (
            <Text style={s.helper}>Select the answer from your study material.</Text>
          ) : null}
          {choices.map((choice, optionIndex) => (
            <Pressable
              key={choice}
              onPress={() => onPick(choice)}
              style={[s.answer, answers[current] === choice && s.answerActive]}
            >
              <Text style={[s.answerLetter, answers[current] === choice && s.answerLetterActive]}>
                {choice}
              </Text>
              <Text style={s.answerText}>
                {question?.options[optionIndex] ?? `Option ${choice}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.sectionTitle}>QUESTION PALETTE</Text>
        <QuestionPalette
          count={count}
          current={current}
          onCurrent={onCurrent}
          getItemStyle={(index) => answers[index] ? s.paletteAnswered : undefined}
        />
        <View style={s.nav}>
          <Pressable
            disabled={current === 0}
            onPress={() => onCurrent(current - 1)}
            style={[s.outline, current === 0 && s.disabled]}
          >
            <Text style={s.outlineText}>Previous</Text>
          </Pressable>
          {current < count - 1 ? (
            <Pressable onPress={() => onCurrent(current + 1)} style={s.primarySmall}>
              <Text style={s.primaryText}>Next</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onSubmit} style={s.primarySmall}>
              <Text style={s.primaryText}>Submit test</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
function History({
  records,
  subjects: bankSubjects,
  onBack,
  onDelete,
  onUpdate,
  onReattempt,
}: {
  records: Record[];
  subjects: Subject[];
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (record: Record) => void;
  onReattempt: (record: Record) => void;
}) {
  const [subject, setSubject] = useState("All subjects");
  const [chapter, setChapter] = useState("All chapters");
  const [filterMenu, setFilterMenu] = useState<"subject" | "chapter" | null>(null);
  const [selected, setSelected] = useState<{ record: Record; attempts: Record[] } | null>(null);
  // Quick Recall contributes to Activity/Profile metrics, but it is not a
  // manually started practice test and must not crowd Previous sessions.
  const sessionRecords = records.filter(
    (record) =>
      record.testMode !== "quick-recall" &&
      record.subject !== "Quick Recall" &&
      !record.id.startsWith("quick-recall:"),
  );
  const subjects = Array.from(new Set(sessionRecords.map((record) => record.subject))).sort();
  const chapters = Array.from(
    new Set(
      sessionRecords
        .filter((record) => subject === "All subjects" || record.subject === subject)
        .map((record) => record.chapter),
    ),
  ).sort();
  const visible = sessionRecords.filter(
    (record) =>
      (subject === "All subjects" || record.subject === subject) &&
      (chapter === "All chapters" || record.chapter === chapter),
  );
  const visibleGroups = Array.from(
    visible.reduce((groups, record) => {
      // Same identity contract as the web: ordinary attempts are grouped by
      // their exact exercise/config; random tests use their persisted group ID.
      const key = record.testMode === "random"
        ? (record.attemptGroupId ?? record.id)
        : `${record.subjectId || record.subject}||${record.chapterId || record.chapter}||${record.exerciseId || record.exercise}||${record.startNumber}||${record.answers.length}${record.questionIds?.length ? `||q:${JSON.stringify(record.questionIds)}` : ""}`;
      groups.set(key, [...(groups.get(key) ?? []), record]);
      return groups;
    }, new Map<string, Record[]>()),
  )
    .map(([id, attempts]) => ({
      id,
      attempts: [...attempts].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        new Date(b.attempts[b.attempts.length - 1].createdAt).getTime() -
        new Date(a.attempts[a.attempts.length - 1].createdAt).getTime(),
    );
  const reevaluate = (record: Record) => {
    if (isQuestionAttempt(record)) return;
    const sourceSubject = bankSubjects.find((item) => item.id === record.subjectId);
    const sourceExercise = sourceSubject?.chapters.find((item) => item.id === record.chapterId)?.exercises.find((item) => item.id === record.exerciseId);
    if (Array.isArray(sourceExercise?.questions)) return Alert.alert("Exercise changed", "The original exercise is no longer book-based.");
    if (!sourceExercise?.answerKey?.length) return Alert.alert("Answer key unavailable", "The original book exercise no longer has an answer key.");
    const latestKey = sourceExercise.answerKey.slice((record.startNumber ?? 1) - 1, (record.startNumber ?? 1) - 1 + record.answers.length);
    if (latestKey.length !== record.answers.length || latestKey.some((answer) => !answer)) return Alert.alert("Incomplete answer key", "Add answers for the full attempted range before rechecking.");
    record = { ...record, key: latestKey, answerKey: latestKey };
    const correct = record.answers.filter(
      (answer, index) => answer && record.key[index] && answer === record.key[index],
    ).length;
    const wrong = record.answers.filter(
      (answer, index) => answer && record.key[index] && answer !== record.key[index],
    ).length;
    const marking = record.marking ?? { positive: 2, negative: 0.5 };
    const updated = {
      ...record,
      correct,
      wrong,
      score: correct * marking.positive - wrong * marking.negative,
    };
    onUpdate(updated);
    setSelected((current) =>
      current
        ? {
            record: updated,
            attempts: current.attempts.map((attempt) =>
              attempt.id === updated.id ? updated : attempt,
            ),
          }
        : null,
    );
  };
  if (selected)
    return (
      <HistoryDetail
        record={selected.record}
        attempts={selected.attempts}
        onSelectAttempt={(record) => setSelected({ record, attempts: selected.attempts })}
        onBack={() => setSelected(null)}
        onDelete={() => {
          onDelete(selected.record.id);
          setSelected(null);
        }}
        onReattempt={() => onReattempt(selected.record)}
        onReevaluate={() => reevaluate(selected.record)}
      />
    );
  return (
    <View style={s.page}>
      {filterMenu ? <Pressable style={s.historyFilterDismiss} onPress={() => setFilterMenu(null)} /> : null}
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>PRACTICE</Text>
          <Text style={s.title}>Previous sessions</Text>
        </View>
        <Pressable onPress={onBack}>
          <Text style={s.back}>New session</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.historyFilters}>
          <HistoryFilter
            label={subject}
            open={filterMenu === "subject"}
            onPress={() => setFilterMenu(filterMenu === "subject" ? null : "subject")}
            options={["All subjects", ...subjects]}
            onSelect={(next) => { setSubject(next); setChapter("All chapters"); setFilterMenu(null); }}
          />
          <HistoryFilter
            label={chapter}
            open={filterMenu === "chapter"}
            onPress={() => setFilterMenu(filterMenu === "chapter" ? null : "chapter")}
            options={["All chapters", ...chapters]}
            onSelect={(next) => { setChapter(next); setFilterMenu(null); }}
          />
        </View>
        {visibleGroups.length ? (
          visibleGroups.map((group) => {
            const record = group.attempts[group.attempts.length - 1];
            return (
              <Pressable
                key={group.id}
                onPress={() => setSelected({ record, attempts: group.attempts })}
                style={s.historyCard}
              >
                <View style={s.historyCardTop}>
                  <View style={s.scoreRing}>
                    <Text style={s.scoreRingValue}>{record.score}</Text>
                    <Text style={s.scoreRingLabel}>score</Text>
                  </View>
                  <View style={s.historyCopy}>
                    <Text numberOfLines={1} style={s.sessionTitle}>
                      {record.subject}
                    </Text>
                    {group.attempts.length > 1 ? (
                      <Text style={s.attemptBadge}>{group.attempts.length} attempts</Text>
                    ) : null}
                    <Text numberOfLines={1} style={s.historyChapter}>
                      {record.chapter} · {record.exercise}
                    </Text>
                    <Text style={s.historyDate}>{friendlyRecordDate(record.createdAt)}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.subdued} />
                </View>
                <View style={s.historyResultRow}>
                  <Info icon="check" label="Correct" value={String(record.correct)} />
                  <Info icon="close" label="Wrong" value={String(record.wrong)} />
                  <Info
                    icon="help-circle-outline"
                    label="Skipped"
                    value={String(record.answers.filter((answer) => !answer).length)}
                  />
                </View>
              </Pressable>
            );
          })
        ) : (
          <View style={s.empty}>
            <MaterialCommunityIcons name="notebook-outline" size={30} color={colors.subdued} />
            <Text style={s.sessionTitle}>No matching sessions</Text>
            <Text style={s.helper}>Try another subject or chapter.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
function HistoryFilter({ label, open, onPress, options, onSelect }: { label: string; open: boolean; onPress: () => void; options: string[]; onSelect: (value: string) => void }) {
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

  return (
    <View style={s.historyFilterWrap}>
      <Pressable onPress={onPress} style={s.historyFilterButton}>
        <Text numberOfLines={1} style={s.historyFilterText}>{label}</Text>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={17} color={colors.muted} />
      </Pressable>
      {renderMenu ? <Animated.View pointerEvents={open ? "auto" : "none"} style={[s.historyFilterMenu, { opacity: visibility, transform: [{ translateY: visibility.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }, { scale: visibility.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>{options.map((option) => { const selected = option === label; return <Pressable key={option} onPress={() => onSelect(option)} style={[s.historyFilterOption, selected && s.historyFilterOptionActive]}><Text numberOfLines={1} style={[s.historyFilterOptionText, selected && s.historyFilterOptionTextActive]}>{option}</Text>{selected && <MaterialCommunityIcons name="check" size={16} color="#171717" />}</Pressable>; })}</Animated.View> : null}
    </View>
  );
}
function HistoryDetail({
  record,
  attempts,
  onSelectAttempt,
  onBack,
  onDelete,
  onReattempt,
  onReevaluate,
}: {
  record: Record;
  attempts: Record[];
  onSelectAttempt: (record: Record) => void;
  onBack: () => void;
  onDelete: () => void;
  onReattempt: () => void;
  onReevaluate: () => void;
}) {
  const marking = record.marking ?? { positive: 2, negative: 0.5 };
  const [solution, setSolution] = useState(false);
  if (solution) return <SolutionView record={record} onBack={() => setSolution(false)} />;
  return (
    <View style={s.page}>
      <View style={s.header}>
        <Pressable onPress={onBack} style={s.backRow}>
          <MaterialCommunityIcons name="arrow-left" size={18} color={colors.muted} />
          <Text style={s.back}>History</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <MaterialCommunityIcons name="trash-can-outline" size={20} color="#fca5a5" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {attempts.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.attemptsRow}
          >
            {attempts.map((attempt, index) => (
              <Pressable
                key={attempt.id}
                onPress={() => onSelectAttempt(attempt)}
                style={[s.attemptChip, attempt.id === record.id && s.attemptChipActive]}
              >
                <Text
                  style={[s.attemptChipText, attempt.id === record.id && s.attemptChipTextActive]}
                >
                  Attempt {index + 1} · {attempt.score}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={s.detailHero}>
          <Text style={s.eyebrow}>
            {record.subject} · {record.chapter}
          </Text>
          <Text numberOfLines={1} style={s.detailTitle}>{record.exercise}</Text>
          <Text style={s.detailDate}>{friendlyRecordDate(record.createdAt)}</Text>
          <View style={s.detailScore}>
            <Text style={s.detailScoreValue}>{record.score}</Text>
            <Text style={s.detailScoreLabel}>
              Score · +{marking.positive} / −{marking.negative}
            </Text>
          </View>
          <View style={s.resultRow}>
            <Info icon="check" label="Correct" value={String(record.correct)} />
            <Info icon="close" label="Wrong" value={String(record.wrong)} />
            <Info icon="clock-outline" label="Time" value={`${record.minutes}m`} />
          </View>
        </View>
        <View style={s.detailActions}>
          <Pressable onPress={() => setSolution(true)} style={s.detailAction}>
            <MaterialCommunityIcons
              name="book-open-page-variant-outline"
              size={16}
              color={colors.text}
            />
            <Text style={s.detailActionText}>Solution</Text>
          </Pressable>
          {!isQuestionAttempt(record) && <Pressable onPress={onReevaluate} style={s.detailAction}>
            <MaterialCommunityIcons name="refresh" size={15} color={colors.text} />
            <Text style={s.detailActionText}>Recheck</Text>
          </Pressable>}
          <Pressable onPress={onReattempt} style={s.detailPrimaryAction}>
            <MaterialCommunityIcons name="reload" size={15} color={examAccentDeep} />
            <Text style={s.detailPrimaryText}>Reattempt</Text>
          </Pressable>
        </View>
        <Text style={s.sectionTitle}>ANSWER REVIEW</Text>
        {record.answers.map((answer, index) => {
          const key = record.key[index];
          const question = record.questions?.[index];
          return (
            <View key={index} style={s.reviewRow}>
              <Text style={s.reviewNumber}>Q{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={s.reviewQuestion}>
                  {question?.question ?? "Question response"}
                </Text>
                <Text
                  style={[
                    s.reviewAnswer,
                    answer === key && answer
                      ? s.reviewCorrect
                      : answer
                        ? s.reviewWrong
                        : s.reviewSkipped,
                  ]}
                >
                  Your answer: {answer ?? "Skipped"} · Key: {key ?? "—"}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
function SolutionView({ record, onBack }: { record: Record; onBack: () => void }) {
  const questions = record.questions ?? [];
  const questionCount = Math.max(record.answers.length, record.key.length, questions.length);
  const [current, setCurrent] = useState(0);
  const [reattemptMode, setReattemptMode] = useState(false);
  const [reattemptAnswers, setReattemptAnswers] = useState<Array<Option | null>>(
    Array(record.answers.length).fill(null),
  );
  const question = questions[current];
  const firstAnswer = record.answers[current];
  const answerKey = record.key[current] ?? question?.correctAnswer ?? null;
  const reattemptAnswer = reattemptAnswers[current];
  const pickAnswer = (answer: Option) => {
    if (!reattemptMode) return;
    setReattemptAnswers((answers) =>
      answers.map((item, index) => (index === current ? answer : item)),
    );
  };
  const goToQuestion = (nextQuestion: number) => {
    if (nextQuestion === current) return;
    setCurrent(nextQuestion);
    setReattemptAnswers(Array(record.answers.length).fill(null));
  };

  const swipeHandlers = useQuestionSwipe(current, questionCount, goToQuestion);

  return (
    <View style={s.page}>
      <View style={s.header}>
        <Pressable onPress={onBack} style={s.backRow}>
          <MaterialCommunityIcons name="arrow-left" size={18} color={colors.muted} />
          <Text style={s.back} numberOfLines={1}>
            {record.subject} · {record.chapter}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setReattemptMode((active) => !active)}
          style={[s.solutionMode, reattemptMode && s.solutionModeActive]}
        >
          <MaterialCommunityIcons
            name={reattemptMode ? "check-circle" : "reload"}
            size={15}
            color={reattemptMode ? examAccentDeep : colors.muted}
          />
          <Text style={[s.solutionModeText, reattemptMode && s.solutionModeTextActive]}>
            Reattempt mode
          </Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {questionCount ? (
          <>
            <View style={s.questionCard} {...swipeHandlers}>
              <Text style={s.questionText}>
                Q. {record.questionNumbers?.[current] ?? current + 1}
                {question?.question ? ` · ${question.question}` : ""}
              </Text>
              {(question?.options ?? choices.map((option) => `Option ${option}`)).map((optionText, optionIndex) => {
                const optionKey = choices[optionIndex];
                const isCorrect = answerKey === optionKey;
                const wasFirstAttempt = firstAnswer === optionKey;
                const isReattempt = reattemptAnswer === optionKey;
                return (
                  <Pressable
                  key={`${question?.id ?? `answer-key-${current}`}-${optionKey}`}
                    disabled={!reattemptMode}
                    onPress={() => pickAnswer(optionKey)}
                    style={[
                      s.answer,
                      !reattemptMode && isCorrect && s.solutionOptionCorrect,
                      !reattemptMode && wasFirstAttempt && !isCorrect && s.solutionOptionWrong,
                      reattemptMode && isReattempt && s.answerActive,
                      reattemptMode && isReattempt && !isCorrect && s.solutionOptionWrong,
                      reattemptMode &&
                        reattemptAnswer &&
                        wasFirstAttempt &&
                        !isCorrect &&
                        s.solutionOptionWrong,
                      reattemptMode && reattemptAnswer && isCorrect && s.solutionOptionCorrect,
                    ]}
                  >
                    <Text
                      style={[
                        s.answerLetter,
                        !reattemptMode && isCorrect && s.solutionLetterCorrect,
                        !reattemptMode && wasFirstAttempt && !isCorrect && s.solutionLetterWrong,
                        reattemptMode && isReattempt && s.answerLetterActive,
                        reattemptMode && reattemptAnswer && isCorrect && s.solutionLetterCorrect,
                      ]}
                    >
                      {optionKey}
                    </Text>
                    <View style={s.solutionAnswerCopy}>
                      <Text style={s.answerText}>{optionText}</Text>
                      {reattemptMode &&
                      reattemptAnswer &&
                      (wasFirstAttempt || isCorrect || isReattempt) ? (
                        <View style={s.solutionTags}>
                          {wasFirstAttempt ? (
                            <Text
                              style={[
                                s.solutionTag,
                                isCorrect ? s.solutionTagCorrect : s.solutionTagWrong,
                              ]}
                            >
                              Your attempt
                            </Text>
                          ) : null}
                          {isCorrect ? (
                            <Text style={[s.solutionTag, s.solutionTagCorrect]}>
                              Correct answer
                            </Text>
                          ) : null}
                          {reattemptMode && isReattempt ? (
                            <Text
                              style={[
                                s.solutionTag,
                                isCorrect ? s.solutionTagCorrect : s.solutionTagWrong,
                              ]}
                            >
                              Your reattempt
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                    {!reattemptMode && isCorrect ? (
                      <MaterialCommunityIcons name="check" size={18} color="#6ee7b7" />
                    ) : !reattemptMode && wasFirstAttempt ? (
                      <MaterialCommunityIcons name="close" size={18} color="#fca5a5" />
                    ) : reattemptMode && isReattempt ? (
                      <MaterialCommunityIcons
                        name={isCorrect ? "check" : "close"}
                        size={18}
                        color={isCorrect ? "#6ee7b7" : "#fca5a5"}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
              {question?.explanation ? (
                <Text style={s.solutionExplanation}>{question.explanation}</Text>
              ) : null}
            </View>
            <Text style={s.sectionTitle}>QUESTION PALETTE</Text>
            <QuestionPalette
              count={questionCount}
              current={current}
              onCurrent={goToQuestion}
              getItemStyle={(index) => [
                !reattemptMode && !record.answers[index] && s.solutionPaletteSkipped,
                !reattemptMode && record.answers[index] === record.key[index] && s.solutionPaletteCorrect,
                !reattemptMode && record.answers[index] && record.answers[index] !== record.key[index] && s.solutionPaletteWrong,
                reattemptMode && reattemptAnswers[index] && s.paletteAnswered,
              ]}
            />
            <View style={s.nav}>
              <Pressable
                disabled={current === 0}
                onPress={() => goToQuestion(current - 1)}
                style={[s.outline, current === 0 && s.disabled]}
              >
                <Text style={s.outlineText}>Previous</Text>
              </Pressable>
              <Pressable
                disabled={current === questionCount - 1}
                onPress={() => goToQuestion(current + 1)}
                style={[s.primarySmall, current === questionCount - 1 && s.disabled]}
              >
                <Text style={s.primaryText}>Next</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={s.empty}>
            <MaterialCommunityIcons name="book-open-variant" size={30} color={colors.subdued} />
            <Text style={s.sessionTitle}>Solutions unavailable</Text>
            <Text style={s.helper}>This older session does not include question data.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
function friendlyRecordDate(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const difference = Math.round((day(today) - day(date)) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (difference === 0) return `Today, ${time}`;
  if (difference === 1) return `Yesterday, ${time}`;
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}
function Info({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={s.info}>
      <MaterialCommunityIcons name={icon} color={colors.accent} size={18} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}
function AddDialog({
  visible,
  title,
  value,
  onChange,
  kind,
  onKind,
  count,
  onCount,
  json,
  onJson,
  jsonFileName,
  onChooseQuestionFile,
  error,
  editing,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  value: string;
  onChange: (value: string) => void;
  kind: "key" | "questions";
  onKind: (value: "key" | "questions") => void;
  count: string;
  onCount: (value: string) => void;
  json: string;
  onJson: (value: string) => void;
  jsonFileName: string;
  onChooseQuestionFile: () => void;
  error: string;
  editing: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const exercise = title === "Add exercise";
  const [promptCopied, setPromptCopied] = useState(false);
  const copyQuestionPrompt = async () => {
    await Clipboard.setStringAsync(QUESTION_JSON_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 1800);
  };
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable style={[s.backdrop, exercise && s.sheetBackdrop]} onPress={onClose}>
        <Pressable style={[s.dialog, exercise && s.exerciseSheet]} onPress={() => undefined}>
          {exercise ? <View style={s.sheetHandle} /> : null}
          <View style={s.dialogHeading}><Text style={s.dialogTitle}>{editing ? "Update exercise" : title}</Text>{exercise && kind === "questions" ? <Pressable onPress={() => void copyQuestionPrompt()} style={s.copyPrompt}>
            <MaterialCommunityIcons name={promptCopied ? "check" : "content-copy"} size={15} color={promptCopied ? "#86efac" : colors.accent} />
            <Text style={[s.copyPromptText, promptCopied && s.copyPromptTextDone]}>{promptCopied ? "Copied" : "Copy prompt"}</Text>
          </Pressable> : null}</View>
          <TextInput
            autoFocus
            value={value}
            onChangeText={onChange}
            placeholder={`${title} name`}
            placeholderTextColor={colors.subdued}
            style={s.input}
          />
          {exercise && (
            <>
              <Text style={[s.label, { marginTop: 16 }]}>EXERCISE TYPE</Text>
              {editing ? (
                <View style={s.exerciseTypeLocked}>
                  <MaterialCommunityIcons
                    name={kind === "questions" ? "code-json" : "format-list-numbered"}
                    size={16}
                    color={colors.accent}
                  />
                  <Text style={s.exerciseTypeLockedText}>
                    {kind === "questions" ? "Question-based exercise" : "Answer-key exercise"}
                  </Text>
                </View>
              ) : (
                <View style={s.exerciseTypeRow}>
                  <Pressable
                    onPress={() => onKind("key")}
                    style={[s.exerciseTypeOption, kind === "key" && s.exerciseTypeOptionActive]}
                  >
                    <Text style={[s.exerciseTypeText, kind === "key" && s.exerciseTypeTextActive]}>Answer key</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onKind("questions")}
                    style={[s.exerciseTypeOption, kind === "questions" && s.exerciseTypeOptionActive]}
                  >
                    <Text style={[s.exerciseTypeText, kind === "questions" && s.exerciseTypeTextActive]}>
                      Question JSON
                    </Text>
                  </Pressable>
                </View>
              )}
              {kind === "key" ? (
                <>
                  <TextInput
                    value={count}
                    onChangeText={(next) => onCount(next.replace(/\D/g, "").slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder="Number of questions"
                    placeholderTextColor={colors.subdued}
                    style={s.input}
                  />
                </>
              ) : (
                <>
                  <View style={s.questionImportActions}>
                    <Pressable onPress={onChooseQuestionFile} style={s.questionFilePicker}>
                      <MaterialCommunityIcons name="file-upload-outline" size={20} color={colors.accent} />
                      <Text style={s.questionFileTitle} numberOfLines={1}>{jsonFileName || "Choose JSON file"}</Text>
                      <Text style={s.questionFileCopy}>Question array</Text>
                    </Pressable>
                  </View>
                  {error ? <Text style={s.error}>{error}</Text> : null}
                </>
              )}
            </>
          )}
          <View style={s.actions}>
            <Pressable onPress={onClose}>
              <Text style={s.back}>Cancel</Text>
            </Pressable>
            <Pressable style={s.primarySmall} onPress={onSave}>
              <Text style={s.primaryText}>
                {exercise && kind === "key"
                  ? editing
                    ? "Update answer key"
                    : "Add exercise"
                  : editing
                    ? "Update exercise"
                    : "Add"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function QuestionBank({
  subjects,
  filter,
  onFilter,
  favourites,
  onToggleFavourite,
  viewing: selectedViewing,
  onDeleteQuestion,
  onView,
  onBack,
}: {
  subjects: Subject[];
  filter: string;
  onFilter: (value: string) => void;
  favourites: string[];
  onToggleFavourite: (id: string) => void;
  viewing: Exercise | null;
  onDeleteQuestion: (exerciseId: string, questionId: string) => void;
  onView: (exercise: Exercise | null) => void;
  onBack: () => void;
}) {
  const viewing = subjects.flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.exercises)).find((exercise) => exercise.id === selectedViewing?.id) ?? null;
  const [deleting, setDeleting] = useState<{ exerciseId: string; questionId: string } | null>(null);
  const [chapterFilter, setChapterFilter] = useState("all");
  const [questionIndex, setCurrentQuestion] = useState(0);
  const currentQuestion = Math.max(0, Math.min(questionIndex, (viewing?.questions?.length ?? 1) - 1));
  const swipeHandlers = useQuestionSwipe(currentQuestion, viewing?.questions?.length ?? 0, setCurrentQuestion);
  const [subjectFilterOpen, setSubjectFilterOpen] = useState(false);
  const [chapterFilterOpen, setChapterFilterOpen] = useState(false);
  const visibleSubjects = subjects.filter((subject) => filter === "all" || subject.id === filter);
  const chapters = visibleSubjects.flatMap((subject) =>
    subject.chapters.map((chapter) => ({
      id: `${subject.id}:${chapter.id}`,
      name: chapter.name || "Untitled chapter",
      // With All subjects selected, retain the subject in the chapter label.
      // Otherwise equally named chapters look blank/indistinguishable.
      label: filter === "all" ? `${subject.name} · ${chapter.name || "Untitled chapter"}` : (chapter.name || "Untitled chapter"),
    })),
  );
  const entries = subjects
    .filter((subject) => filter === "all" || subject.id === filter)
    .flatMap((subject) =>
      subject.chapters.flatMap((chapter) =>
        chapter.exercises
          .filter((exercise) => exercise.questions?.length)
          .map((exercise) => ({ subject, chapter, exercise })),
      ),
    )
    .filter(
      (entry) =>
        chapterFilter === "all" || `${entry.subject.id}:${entry.chapter.id}` === chapterFilter,
    );
  useEffect(() => {
    setCurrentQuestion(0);
  }, [viewing?.id]);
  if (viewing?.questions?.length)
    return (
      <View style={s.page}>
        <View style={s.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.eyebrow}>QUESTION BANK</Text>
            <Text numberOfLines={1} style={s.title}>
              {viewing.name}
            </Text>
            <Text style={s.bankSubhead}>
              Question {currentQuestion + 1} of {viewing.questions.length}
            </Text>
          </View>
          <Pressable onPress={() => onView(null)}>
            <Text style={s.back}>Back</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.content}>
          {(() => {
            const question = viewing.questions[currentQuestion];
            return (
              <>
                <View style={s.bankViewerCard} {...swipeHandlers}>
                  <View style={s.bankQuestionHeader}>
                    <Text style={s.bankQuestionNumber}>QUESTION {currentQuestion + 1}</Text>
                    <Pressable accessibilityLabel="Delete question" onPress={() => setDeleting({ exerciseId: viewing.id, questionId: question.id })} hitSlop={8}><MaterialCommunityIcons name="trash-can-outline" size={21} color="#fca5a5" /></Pressable>
                    <Pressable
                      onPress={() => onToggleFavourite(question.id)}
                      style={[
                        s.favouriteButton,
                        favourites.includes(question.id) && s.favouriteButtonActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={favourites.includes(question.id) ? "star" : "star-outline"}
                        size={21}
                        color="#fbbf24"
                      />
                    </Pressable>
                  </View>
                  <Text style={s.bankQuestion}>{question.question}</Text>
                  {question.options.map((option, optionIndex) => {
                    const correct = choices[optionIndex] === question.correctAnswer;
                    return (
                      <View
                        key={`${question.id}-${optionIndex}`}
                        style={[s.bankOption, correct && s.bankOptionCorrect]}
                      >
                        <Text style={[s.bankOptionLetter, correct && s.bankOptionLetterCorrect]}>
                          {choices[optionIndex]}
                        </Text>
                        <Text style={s.bankOptionText}>{option}</Text>
                        {correct ? <Text style={s.correctPill}>Correct</Text> : null}
                      </View>
                    );
                  })}
                  {question.explanation ? (
                    <Text style={s.explanation}>{question.explanation}</Text>
                  ) : null}
                  <View style={s.viewerNav}>
                    <Pressable
                      disabled={currentQuestion === 0}
                      onPress={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                      style={[s.outline, currentQuestion === 0 && s.disabled]}
                    >
                      <Text style={s.outlineText}>Previous</Text>
                    </Pressable>
                    <Pressable
                      disabled={currentQuestion === viewing.questions.length - 1}
                      onPress={() =>
                        setCurrentQuestion(Math.min(viewing.questions.length - 1, currentQuestion + 1))
                      }
                      style={[
                        s.primarySmall,
                        currentQuestion === viewing.questions.length - 1 && s.disabled,
                      ]}
                    >
                      <Text style={s.primaryText}>Next</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={s.bankPalette}>
                  <Text style={s.sessionTitle}>Question palette</Text>
                  <Text style={s.bankSubhead}>Jump to any question</Text>
                  <QuestionPalette
                    count={viewing.questions.length}
                    current={currentQuestion}
                    onCurrent={setCurrentQuestion}
                    getItemStyle={(index) => [
                      favourites.includes(viewing.questions[index].id) && s.paletteFavourite,
                      favourites.includes(viewing.questions[index].id) && index === currentQuestion && s.paletteFavouriteCurrent,
                    ]}
                    getTextStyle={(index) => favourites.includes(viewing.questions[index].id) && index === currentQuestion ? s.paletteFavouriteCurrentText : undefined}
                  />
                </View>
              </>
            );
          })()}
        </ScrollView>
        <Modal transparent visible={deleting !== null} animationType="fade" statusBarTranslucent onRequestClose={() => setDeleting(null)}>
          <Pressable style={s.backdrop} onPress={() => setDeleting(null)}>
            <Pressable accessibilityViewIsModal style={s.dialog} onPress={() => undefined}>
              <Text style={s.deleteQuestionTitle}>Delete question?</Text>
              <View style={s.deleteQuestionActions}>
                <Pressable accessibilityRole="button" style={s.outline} onPress={() => setDeleting(null)}><Text style={s.outlineText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" style={s.deleteQuestionButton} onPress={() => {
                  if (!deleting) return;
                  const target = deleting;
                  setDeleting(null);
                  onDeleteQuestion(target.exerciseId, target.questionId);
                }}><Text style={s.deleteQuestionButtonText}>Delete</Text></Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  return (
    <View style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>PRACTICE SESSION</Text>
          <Text style={s.title}>Question bank</Text>
        </View>
        <Pressable onPress={onBack}>
          <Text style={s.back}>Back</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.bankFilters}>
          <BankDropdown
            title="Subject"
            label={
              filter === "all"
                ? "All subjects"
                : (subjects.find((subject) => subject.id === filter)?.name ?? "All subjects")
            }
            open={subjectFilterOpen}
            onPress={() => {
              setSubjectFilterOpen((value) => !value);
              setChapterFilterOpen(false);
            }}
            options={[
              { id: "all", label: "All subjects" },
              ...subjects.map((subject) => ({ id: subject.id, label: subject.name })),
            ]}
            onSelect={(value) => {
              onFilter(value);
              setChapterFilter("all");
              setSubjectFilterOpen(false);
            }}
          />
          <BankDropdown
            title="Chapter"
            label={
              chapterFilter === "all"
                ? "All chapters"
                : (chapters.find((chapter) => chapter.id === chapterFilter)?.label ?? "All chapters")
            }
            open={chapterFilterOpen}
            onPress={() => {
              setChapterFilterOpen((value) => !value);
              setSubjectFilterOpen(false);
            }}
            options={[{ id: "all", label: "All chapters" }, ...chapters.map(({ id, label }) => ({ id, label }))]}
            onSelect={(value) => {
              setChapterFilter(value);
              setChapterFilterOpen(false);
            }}
          />
        </View>
        {entries.length ? (
          entries.map(({ subject, chapter, exercise }) => (
            <Pressable
              key={`${subject.id}:${chapter.id}:${exercise.id}`}
              onPress={() => onView(exercise)}
              style={s.bankEntry}
            >
              <View style={s.bankEntryIcon}>
                <MaterialCommunityIcons
                  name="book-open-page-variant-outline"
                  size={20}
                  color={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sessionTitle}>{exercise.name}</Text>
                <Text style={s.helper}>
                  {subject.name} · {chapter.name} · {exercise.questions?.length} questions
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={19} color={colors.subdued} />
            </Pressable>
          ))
        ) : (
          <View style={s.empty}>
            <MaterialCommunityIcons name="book-open-variant" size={30} color={colors.subdued} />
            <Text style={s.sessionTitle}>No question-based exercises</Text>
            <Text style={s.helper}>Add a Question JSON exercise from Practice setup.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function BankDropdown({
  title,
  label,
  open,
  onPress,
  options,
  onSelect,
}: {
  title: string;
  label: string;
  open: boolean;
  onPress: () => void;
  options: { id: string; label: string }[];
  onSelect: (value: string) => void;
}) {
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

  return (
    <View style={[s.bankDropdown, open && s.bankDropdownOpen]}>
      <Text style={s.bankDropdownLabel}>{title.toUpperCase()}</Text>
      <Pressable
        onPress={onPress}
        style={s.bankDropdownTrigger}
      >
        <Text numberOfLines={1} style={s.bankDropdownValue}>
          {label}
        </Text>
        <View style={s.bankDropdownChevron}><MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={17} color={colors.muted} /></View>
      </Pressable>
      {renderMenu ? (
        <Animated.View pointerEvents={open ? "auto" : "none"} style={[s.bankDropdownMenu, { opacity: visibility, transform: [{ translateY: visibility.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }, { scale: visibility.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>
          <NativeScrollView nestedScrollEnabled style={s.bankDropdownList} keyboardShouldPersistTaps="handled">
          {options.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={[s.bankDropdownOption, option.label === label && s.bankDropdownOptionSelected]}
            >
              <Text numberOfLines={1} style={[s.bankDropdownOptionText, option.label === label && s.bankDropdownOptionTextSelected]}>
                {option.label}
              </Text>
              {option.label === label && <MaterialCommunityIcons name="check" size={16} color="#171717" />}
            </Pressable>
          ))}
          </NativeScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 7,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: {
    color: "#93a4be",
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
    letterSpacing: 1.7,
  },
  title: { color: colors.text, fontFamily: "Manrope_800ExtraBold", fontSize: 24, marginTop: 4 },
  headerCopy: { color: colors.muted, fontFamily: "Manrope_500Medium", fontSize: 11, marginTop: 3 },
  content: { paddingHorizontal: 14, paddingTop: 2, gap: 5, paddingBottom: 66 },
  linkButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#252525", borderWidth: 1, borderColor: "#353535" },
  label: {
    color: colors.subdued,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    marginBottom: 5,
  },
  selectGroup: { position: "relative", zIndex: 2 },
  selectGroupOpen: { zIndex: 40 },
  select: {
    height: 39,
    borderRadius: 11,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  selectText: { flex: 1, color: colors.text, fontFamily: "Manrope_600SemiBold", fontSize: 13, marginRight: 10 },
  selectPlaceholder: { color: colors.muted },
  menu: {
    position: "absolute",
    top: 58,
    left: 0,
    right: 0,
    zIndex: 80,
    elevation: 30,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: "#252525",
    borderWidth: 1,
    borderColor: "#4a4a4a",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  menuList: { maxHeight: 218 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: "#363636",
  },
  menuItemSelected: { backgroundColor: "#f4f4f5" },
  menuText: { color: colors.text, fontFamily: "Manrope_500Medium", fontSize: 12 },
  menuTextSelected: { color: "#171717", fontFamily: "Manrope_700Bold" },
  addItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  addItemText: { color: colors.accent, fontFamily: "Manrope_700Bold", fontSize: 12 },
  exerciseEdit: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: -2,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#343434",
    backgroundColor: "transparent",
  },
  exerciseEditText: { maxWidth: 250, color: colors.muted, fontFamily: "Manrope_600SemiBold", fontSize: 10 },
  card: {
    borderRadius: 18,
    padding: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  practiceSetupCard: {
    borderRadius: 18,
    padding: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  configSection: { paddingTop: 2 },
  configDivider: { height: 1, backgroundColor: "#353535", marginVertical: 10 },
  input: {
    height: 44,
    marginTop: 2,
    borderRadius: 12,
    paddingHorizontal: 13,
    color: colors.text,
    fontFamily: "Manrope_500Medium",
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  timingInput: { height: 41 },
  inputDisabled: { opacity: 0.45 },
  presetRow: { flexDirection: "row", gap: 7, marginTop: 8 },
  timingPresetRow: { marginTop: 6, gap: 6 },
  preset: {
    minWidth: 68,
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#303030",
  },
  // Flex items avoid Android's inconsistent percentage sizing inside this row.
  timingPreset: { flex: 1, minWidth: 0, paddingHorizontal: 2, paddingVertical: 7 },
  timingPresetText: { width: "100%", textAlign: "center", includeFontPadding: false },
  presetActive: { backgroundColor: examAccent, borderColor: examAccent },
  presetText: { color: colors.muted, fontFamily: "Manrope_700Bold", fontSize: 12 },
  presetTextActive: { color: examAccentDeep },
  modeRow: { flexDirection: "row", gap: 7, marginBottom: 7 },
  mode: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#303030",
    paddingHorizontal: 6,
    paddingVertical: 8,
    backgroundColor: "#151515",
  },
  modeActive: { borderColor: examAccent, backgroundColor: examAccent },
  modeText: { alignSelf: "stretch", color: colors.muted, fontFamily: "Manrope_700Bold", fontSize: 11, textAlign: "center" },
  modeTextActive: { color: examAccentDeep },
  exerciseTypeLocked: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#363636",
    backgroundColor: "#1b1b1b",
  },
  exerciseTypeLockedText: { color: colors.muted, fontFamily: "Manrope_600SemiBold", fontSize: 11 },
  exerciseTypeRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  exerciseTypeOption: { flex: 1, alignItems: "center", borderRadius: 9, paddingVertical: 8, backgroundColor: "#202020" },
  exerciseTypeOptionActive: { backgroundColor: "#26384f" },
  exerciseTypeText: { color: colors.muted, fontFamily: "Manrope_600SemiBold", fontSize: 11 },
  exerciseTypeTextActive: { color: "#bfdbfe" },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  markingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 },
  markingEmbedded: { paddingVertical: 1 },
  markingInlineValue: { color: colors.text, fontSize: 14, fontFamily: "Manrope_700Bold" },
  markingInputs: { flexDirection: "row", gap: 10 },
  markingField: { flex: 1 },
  markingFieldLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", marginBottom: 6 },
  markingInput: {
    height: 42,
    borderRadius: 11,
    paddingHorizontal: 12,
    color: colors.text,
    fontWeight: "800",
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  primary: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: examAccent,
  },
  setupContinue: { minHeight: 46, marginTop: 13 },
  primarySmall: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 11,
    backgroundColor: examAccent,
  },
  primaryText: { color: examAccentDeep, fontFamily: "Manrope_800ExtraBold", fontSize: 13 },
  primaryWideText: { flexShrink: 1, textAlign: "center" },
  back: { color: colors.muted, fontFamily: "Manrope_700Bold", fontSize: 13 },
  keyRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 13,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyQuestion: { color: colors.text, fontWeight: "800" },
  optionRow: { flexDirection: "row", gap: 5 },
  option: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#292929",
    borderWidth: 1,
    borderColor: "#444",
  },
  optionActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  optionTextActive: { color: examAccentDeep },
  sessionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  infoGrid: { flexDirection: "row", marginTop: 18 },
  info: { flex: 1, gap: 4 },
  infoLabel: { color: colors.muted, fontSize: 10 },
  infoValue: { color: colors.text, fontSize: 12, fontWeight: "700" },
  sectionTitle: {
    color: colors.subdued,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    marginTop: 2,
  },
  instructions: { color: "#d4d4d8", fontSize: 13, lineHeight: 19, marginTop: 10 },
  testHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 20,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  testTitle: { color: colors.text, fontSize: 21, fontWeight: "800", marginTop: 3 },
  timer: { color: "#fca5a5", fontVariant: ["tabular-nums"], fontSize: 18, fontWeight: "800" },
  questionCard: {
    borderRadius: 18,
    padding: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionText: { color: colors.text, fontFamily: "Manrope_700Bold", fontSize: 18 },
  answer: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 10,
    borderRadius: 13,
    padding: 11,
    backgroundColor: "#191919",
    borderWidth: 1,
    borderColor: "#353535",
  },
  answerActive: { borderColor: examAccent, backgroundColor: examAccentSurface },
  answerLetter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    paddingTop: 7,
    color: colors.muted,
    backgroundColor: "#303030",
    fontWeight: "800",
    marginTop: 1,
  },
  answerLetterActive: { color: examAccentDeep, backgroundColor: examAccent },
  answerText: {
    flex: 1,
    flexShrink: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Manrope_600SemiBold",
    paddingTop: 4,
  },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  paletteItem: {
    width: 35,
    height: 35,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2b2b2b",
  },
  paletteCurrent: { borderWidth: 1, borderColor: examAccent },
  paletteAnswered: { backgroundColor: "#115e59" },
  solutionPaletteCorrect: { backgroundColor: "#166534" },
  solutionPaletteWrong: { backgroundColor: "#991b1b" },
  solutionPaletteSkipped: { backgroundColor: "#3f3f46" },
  paletteText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  nav: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  outline: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#454545",
  },
  outlineText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  resultRow: { flexDirection: "row", marginTop: 17 },
  historyFilterDismiss: { position: "absolute", zIndex: 10, top: 0, right: 0, bottom: 0, left: 0 },
  historyFilters: { zIndex: 20, flexDirection: "row", gap: 8 },
  historyFilterWrap: { flex: 1, position: "relative", zIndex: 20 },
  historyFilterButton: { height: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  historyFilterText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  historyFilterMenu: { position: "absolute", zIndex: 40, elevation: 40, top: 47, right: 0, left: 0, maxHeight: 210, overflow: "hidden", borderRadius: 12, backgroundColor: "#292929", borderWidth: 1, borderColor: "#454545", shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  historyFilterOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 },
  historyFilterOptionActive: { backgroundColor: "#f4f4f5" },
  historyFilterOptionText: { color: "#d4d4d8", fontSize: 12 },
  historyFilterOptionTextActive: { color: "#171717", fontWeight: "800" },
  historyCard: {
    borderRadius: 14,
    padding: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  scoreRing: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "#172b27",
  },
  scoreRingValue: { color: colors.text, fontSize: 14, fontWeight: "900" },
  scoreRingLabel: { color: colors.muted, fontSize: 7, marginTop: -1 },
  historyCopy: { flex: 1, minWidth: 0 },
  historyChapter: { color: colors.muted, fontSize: 11, marginTop: 2 },
  historyDate: { color: colors.subdued, fontSize: 10, marginTop: 3 },
  attemptBadge: {
    alignSelf: "flex-start",
    marginTop: 3,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    backgroundColor: "#153c35",
  },
  historyResultRow: { flexDirection: "row", marginTop: 10 },
  attemptsRow: { gap: 7, paddingRight: 20 },
  attemptChip: {
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#424242",
  },
  attemptChipActive: { borderColor: colors.accent, backgroundColor: "#153c35" },
  attemptChipText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  attemptChipTextActive: { color: "#ccfbf1" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  detailHero: {
    borderRadius: 15,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 3 },
  detailDate: { color: colors.subdued, fontSize: 10, marginTop: 3 },
  detailScore: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 13, marginBottom: 0 },
  detailScoreValue: { color: colors.accent, fontSize: 29, fontWeight: "900" },
  detailScoreLabel: { color: colors.muted, fontSize: 10 },
  detailActions: { flexDirection: "row", gap: 7 },
  detailAction: { flex: 1, minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, borderWidth: 1, borderColor: "#484848", backgroundColor: "rgba(255,255,255,.02)" },
  detailActionText: { color: colors.text, fontSize: 10, fontWeight: "800" },
  detailPrimaryAction: { flex: 1.1, minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, backgroundColor: examAccent },
  detailPrimaryText: { color: examAccentDeep, fontSize: 10, fontWeight: "900" },
  reviewRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,.07)",
  },
  reviewNumber: { width: 30, color: colors.muted, fontSize: 12, fontWeight: "800" },
  reviewQuestion: { color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  reviewAnswer: { fontSize: 11, fontWeight: "700", marginTop: 5 },
  reviewCorrect: { color: "#6ee7b7" },
  reviewWrong: { color: "#fca5a5" },
  reviewSkipped: { color: colors.muted },
  solutionMode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#454545",
    backgroundColor: "#242424",
  },
  solutionModeActive: { borderColor: colors.accent, backgroundColor: "#153c35" },
  solutionModeText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  solutionModeTextActive: { color: "#ccfbf1" },
  solutionTestMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  solutionCount: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  solutionOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 9,
    borderRadius: 12,
    padding: 9,
    backgroundColor: "#191919",
    borderWidth: 1,
    borderColor: "#353535",
  },
  solutionOptionCorrect: { borderColor: "#258b64", backgroundColor: "#153c35" },
  solutionOptionWrong: { borderColor: "#9a454e", backgroundColor: "#321d22" },
  solutionLetter: {
    width: 27,
    height: 27,
    borderRadius: 14,
    textAlign: "center",
    paddingTop: 6,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "#303030",
  },
  solutionLetterCorrect: { color: "#052e22", backgroundColor: "#6ee7b7" },
  solutionLetterWrong: { color: "#450a0a", backgroundColor: "#fca5a5" },
  solutionOptionText: {
    flex: 1,
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  solutionAnswerCopy: { flex: 1, minWidth: 0 },
  solutionTags: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  solutionTag: {
    overflow: "hidden",
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "900",
  },
  solutionTagCorrect: { color: "#a7f3d0", backgroundColor: "#115e45" },
  solutionTagWrong: { color: "#fecaca", backgroundColor: "#652b33" },
  solutionStatus: {
    marginTop: 14,
    gap: 3,
    borderRadius: 12,
    padding: 11,
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#353535",
  },
  solutionStatusLabel: {
    color: colors.subdued,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  solutionStatusValue: { color: colors.text, fontSize: 12, fontWeight: "700" },
  solutionExplanation: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 12,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#1b2931",
  },
  bankIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 17,
    padding: 14,
    backgroundColor: "#1c2422",
    borderWidth: 1,
    borderColor: "#2b5e52",
  },
  bankIntroIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#153c35",
  },
  bankIntroTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  bankIntroText: { color: colors.muted, fontSize: 11, marginTop: 3 },
  bankChips: { gap: 7, paddingRight: 20 },
  bankFilters: { flexDirection: "row", gap: 9, zIndex: 20 },
  bankDropdown: { flex: 1, position: "relative", zIndex: 20 },
  bankDropdownOpen: { zIndex: 50 },
  bankDropdownTrigger: {
    height: 45,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderRadius: 11,
    paddingLeft: 13,
    paddingRight: 10,
    backgroundColor: "#202020",
    borderWidth: 1,
    borderColor: colors.border,
  },
  bankDropdownLabel: { color: colors.subdued, fontSize: 9, fontWeight: "800", letterSpacing: 1.1, marginBottom: 6, marginLeft: 2 },
  bankDropdownChevron: { width: 25, height: 25, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#303030" },
  bankDropdownValue: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  bankDropdownMenu: {
    position: "absolute",
    zIndex: 100,
    elevation: 100,
    top: 68,
    left: 0,
    right: 0,
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#272727",
    borderWidth: 1,
    borderColor: "#4a4a4a",
  },
  bankDropdownList: { maxHeight: 210 },
  bankDropdownOption: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: "#3a3a3a",
  },
  bankDropdownOptionSelected: { backgroundColor: "#f4f4f5" },
  bankDropdownOptionText: { color: colors.text, fontSize: 12 },
  bankDropdownOptionTextSelected: { color: "#171717", fontWeight: "700" },
  bankEntry: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bankEntryIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#292929",
  },
  bankSubhead: { color: colors.muted, fontSize: 11, marginTop: 4 },
  questionBankCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bankQuestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bankQuestionNumber: {
    color: colors.subdued,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  favouriteButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#292929",
  },
  favouriteButtonActive: { backgroundColor: "#4a3d13" },
  bankQuestion: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    marginTop: 10,
  },
  bankOption: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 8,
    borderRadius: 11,
    padding: 9,
    backgroundColor: "#191919",
    borderWidth: 1,
    borderColor: "#353535",
  },
  bankOptionCorrect: { borderColor: "#258b64", backgroundColor: "#153c35" },
  bankOptionLetter: {
    width: 25,
    height: 25,
    borderRadius: 13,
    textAlign: "center",
    paddingTop: 5,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "#303030",
  },
  bankOptionLetterCorrect: { color: "#052e22", backgroundColor: "#6ee7b7" },
  bankOptionText: {
    flex: 1,
    flexShrink: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  bankViewerCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewerNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
  },
  correctPill: {
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    color: "#6ee7b7",
    fontSize: 10,
    fontWeight: "800",
    backgroundColor: "#174634",
  },
  bankPalette: {
    borderRadius: 17,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paletteFavourite: { borderWidth: 1, borderColor: "rgba(251,191,36,.45)", backgroundColor: "rgba(251,191,36,.10)" },
  paletteFavouriteCurrent: { borderColor: "#fcd34d", backgroundColor: "#fbbf24" },
  paletteFavouriteCurrentText: { color: "#451a03" },
  explanation: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 11,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#1b2931",
  },
  empty: {
    alignItems: "center",
    borderRadius: 18,
    padding: 34,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteQuestionTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  deleteQuestionActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 24 },
  deleteQuestionButton: { borderRadius: 10, backgroundColor: "#ef4444", paddingHorizontal: 18, paddingVertical: 11 },
  deleteQuestionButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  backdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,.72)" },
  sheetBackdrop: { justifyContent: "flex-end", padding: 0 },
  dialog: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: "#202020",
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseSheet: {
    maxHeight: "88%",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 4,
    alignSelf: "center",
    marginBottom: 14,
    backgroundColor: "#5a5a5a",
  },
  dialogHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dialogTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: "800" },
  questionImportActions: { marginTop: 10 },
  questionFilePicker: {
    alignSelf: "stretch",
    minHeight: 92,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(96,165,250,.05)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,.38)",
  },
  questionFileTitle: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 6, maxWidth: "100%" },
  questionFileCopy: { color: colors.subdued, fontSize: 10, lineHeight: 14, textAlign: "center", marginTop: 3 },
  copyPrompt: { height: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, paddingHorizontal: 9, backgroundColor: "#202c38", borderWidth: 1, borderColor: "#315878" },
  copyPromptText: { color: colors.accent, fontSize: 11, fontWeight: "700", textAlign: "center" },
  copyPromptTextDone: { color: "#86efac" },
  error: { color: "#fca5a5", fontSize: 12, marginTop: 8 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 18,
    marginTop: 17,
  },
  disabled: { opacity: 0.42 },
});
