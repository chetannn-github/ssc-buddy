// @ts-nocheck
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Modal,
  Pressable,
  ScrollView as NativeScrollView,
  StyleSheet as NativeStyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors } from "../theme";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
import { migratePracticeEntities, patchPracticeSettings, readPracticeSettings, syncPracticeEntities, watchPracticeEntities, watchPracticeSettings } from "../lib/firebase";

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
type Subject = { id: string; name: string; chapters: Chapter[] };
type Record = {
  id: string;
  createdAt: string;
  /** Canonical web CBT attempt fields. UI-only aliases below are retained while old mobile screens are migrated. */
  date: string;
  testMode: "standard" | "random";
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
const examAccentDeep = "#081a31";
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const defaultBank: Bank = {
  marking: { positive: 2, negative: 0.5 },
  subjects: [],
};

export function PracticeScreen({ user }: { user: any }) {
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
  const [answerKey, setAnswerKey] = useState<Array<Option | null>>([]);
  const [savingNewKey, setSavingNewKey] = useState(false);
  const [answers, setAnswers] = useState<Array<Option | null>>([]);
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [dialog, setDialog] = useState<"subject" | "chapter" | "exercise" | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [exerciseKind, setExerciseKind] = useState<"key" | "questions">("key");
  const [json, setJson] = useState("");
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
          const next = Array.isArray(parsed) ? { ...bankRef.current, subjects: parsed } : parsed;
          bankRef.current = next; setBank(next);
          await AsyncStorage.setItem(STORE, JSON.stringify(next.subjects));
          if (!subjectsRaw && legacyBankRaw) await AsyncStorage.removeItem(LEGACY_STORE);
        }
      } catch {}
      try { if (markingRaw) { const marking = JSON.parse(markingRaw) as Bank["marking"]; bankRef.current = { ...bankRef.current, marking }; setBank(bankRef.current); } } catch {}
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
      if (!settings) await patchPracticeSettings(user, { marking: bankRef.current.marking });
      stops.push(
        watchPracticeEntities(user, "practiceSubjects", (items) => { const next = { ...bankRef.current, subjects: items as any }; bankRef.current = next; setBank(next); void AsyncStorage.setItem(STORE, JSON.stringify(next.subjects)); }),
        watchPracticeEntities(user, "practiceAttempts", (items) => { const next = items.map((item) => ({ ...item, minutes: Number(item.minutes ?? item.durationMinutes ?? Math.round(Number(item.timeTakenSeconds ?? 0) / 60)), key: item.key ?? item.answerKey ?? [], correct: Number(item.correct ?? 0), wrong: Number(item.wrong ?? 0), score: Number(item.score ?? 0), subject: String(item.subject ?? ""), chapter: String(item.chapter ?? ""), exercise: String(item.exercise ?? "") })) as Record[]; historyRef.current = next; setHistory(next); void AsyncStorage.setItem(HISTORY, JSON.stringify(next)); }),
        watchPracticeEntities(user, "practiceFavourites", (items) => { const next = items.map((item) => item.id); favouritesRef.current = next; setFavourites(next); void AsyncStorage.setItem(FAVOURITES, JSON.stringify(next)); }),
        watchPracticeSettings(user, (settings) => { const marking = settings?.marking as Bank["marking"] | undefined; if (marking) { const next = { ...bankRef.current, marking }; bankRef.current = next; setBank(next); void AsyncStorage.setItem(MARKING, JSON.stringify(next)); } }),
      );
    })().catch(() => undefined);
    return () => { stopped = true; stops.forEach((stop) => stop()); };
  }, [user?.uid, practiceLoaded]);
  const subject = bank.subjects.find((item) => item.id === subjectId) ?? bank.subjects[0];
  const chapter = subject?.chapters.find((item) => item.id === chapterId) ?? subject?.chapters[0];
  const exercise =
    chapter?.exercises.find((item) => item.id === exerciseId) ?? chapter?.exercises[0];
  useEffect(() => {
    if (!subject) return;
    if (!subject.chapters.some((item) => item.id === chapterId))
      setChapterId(subject.chapters[0]?.id ?? "");
  }, [subjectId, subject]);
  useEffect(() => {
    if (!chapter) return;
    if (!chapter.exercises.some((item) => item.id === exerciseId))
      setExerciseId(chapter.exercises[0]?.id ?? "");
    const active = chapter.exercises.find((item) => item.id === exerciseId) ?? chapter.exercises[0];
    if (active) setCount(String(active.questionCount));
    if (active) setStart("1");
  }, [chapterId, chapter, exerciseId]);
  const exerciseQuestionTotal = exercise?.questions?.length ?? exercise?.questionCount ?? 1;
  const startNumber = random ? 1 : Math.max(1, Math.min(exerciseQuestionTotal, Number(start) || 1));
  const availableQuestions = random
    ? exerciseQuestionTotal
    : Math.max(1, exerciseQuestionTotal - startNumber + 1);
  const questionCount = fixed
    ? Math.max(1, Math.min(availableQuestions, Number(count) || 1))
    : availableQuestions;
  const duration = Math.max(1, Math.min(180, Number(minutes) || 1));
  const selectedQuestions = useMemo(() => {
    const questions = exercise?.questions ?? [];
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
  }, [exercise?.questions, favourites, questionCount, random, randomSeed, startNumber]);
  const title = [subject?.name, chapter?.name, exercise?.name].filter(Boolean).join(" · ");
  const selectSubject = (next: string) => {
    const item = bank.subjects.find((x) => x.id === next);
    setSubjectId(next);
    setChapterId(item?.chapters[0]?.id ?? "");
    setExerciseId(item?.chapters[0]?.exercises[0]?.id ?? "");
    setMenu(null);
  };
  const editExercise = () => {
    if (!exercise) return;
    setEditingExerciseId(exercise.id);
    setDraft(exercise.name);
    setCount(String(exercise.questionCount));
    setExerciseKind(exercise.questions?.length ? "questions" : "key");
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
    setDialog("exercise");
  };
  const begin = () => {
    if (!exercise || !subject || !chapter)
      return Alert.alert("Select a topic", "Choose a subject, chapter and exercise first.");
    const key = Array.from(
      { length: questionCount },
      (_, index) =>
        selectedQuestions?.[index]?.correctAnswer ??
        exercise.answerKey[startNumber - 1 + index] ??
        null,
    );
    setAnswerKey(key);
    setPhase("instructions");
  };
  const startTest = () => {
    setAnswers(Array(questionCount).fill(null));
    setCurrent(0);
    setRemaining(duration * 60);
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
    if (timer.current) clearInterval(timer.current);
    const correct = answers.filter(
      (answer, index) => answer && answerKey[index] && answer === answerKey[index],
    ).length;
    const wrong = answers.filter(
      (answer, index) => answer && answerKey[index] && answer !== answerKey[index],
    ).length;
    const saved: Record = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      testMode: random ? "random" : "standard",
      ...(random ? { attemptGroupId: reattemptOf ?? makeId() } : {}),
      subjectId: subject?.id ?? "",
      subject: subject?.name ?? "",
      chapterId: chapter?.id ?? "",
      chapter: chapter?.name ?? "",
      exerciseId: exercise?.id ?? "",
      exercise: exercise?.name ?? "",
      startNumber,
      durationMinutes: duration,
      timeTakenSeconds: Math.max(0, duration * 60 - remaining),
      minutes: duration - Math.floor(remaining / 60),
      answers,
      answerKey,
      ...(selectedQuestions ? { questionIds: selectedQuestions.map((question) => question.id), questionNumbers: selectedQuestions.map((question, index) => question.number ?? (random ? index + 1 : startNumber + index)) } : {}),
      key: answerKey,
      correct,
      wrong,
      score: correct * bank.marking.positive - wrong * bank.marking.negative,
      duration,
      marking: bank.marking,
      questions: exercise?.questions,
      attemptOf: reattemptOf ?? undefined,
    };
    const next = [saved, ...history];
    saveHistory(next);
    setReattemptOf(null);
    setPhase("history");
  };
  const saveKey = async (nextPhase: "setup" | "instructions" = "instructions") => {
    if (!exercise || !subject || !chapter) return;
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
    await saveBank(next);
    setSavingNewKey(false);
    setPhase(nextPhase);
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
    setJsonError("");
    setEditingExerciseId(null);
    setDialog(null);
    if (openKeyEditor) setPhase("key");
  };
  if (phase === "history")
    return (
      <History
        records={history}
        onBack={() => {
          setReattemptOf(null);
          setPhase("setup");
        }}
        onDelete={(id) => {
          const next = history.filter((record) => record.id !== id);
          saveHistory(next);
        }}
        onUpdate={(updated) => {
          const next = history.map((record) => (record.id === updated.id ? updated : record));
          saveHistory(next);
        }}
        onReattempt={(record) => {
          setReattemptOf(
            record.testMode === "random" ? (record.attemptGroupId ?? record.id) : record.id,
          );
          const nextSubject = bank.subjects.find((item) => item.name === record.subject);
          const nextChapter = nextSubject?.chapters.find((item) => item.name === record.chapter);
          const nextExercise = nextChapter?.exercises.find((item) => item.name === record.exercise);
          if (nextSubject) setSubjectId(nextSubject.id);
          if (nextChapter) setChapterId(nextChapter.id);
          if (nextExercise) setExerciseId(nextExercise.id);
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
        title={title}
        duration={duration}
        count={questionCount}
        marking={bank.marking}
        onBack={() => setPhase("setup")}
        onStart={startTest}
      />
    );
  if (phase === "test")
    return (
      <TestScreen
        title={title}
        seconds={remaining}
        current={current}
        count={questionCount}
        questions={selectedQuestions}
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
    <View style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>PRACTICE SESSION</Text>
          <Text style={s.title}>New practice session</Text>
        </View>
        <View style={s.headerActions}>
          <Pressable onPress={() => setPhase("bank")} style={s.linkButton}>
            <MaterialCommunityIcons
              name="book-open-page-variant-outline"
              color={colors.muted}
              size={20}
            />
          </Pressable>
          <Pressable onPress={() => setPhase("history")} style={s.linkButton}>
            <MaterialCommunityIcons name="history" color={colors.muted} size={20} />
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <SetupSelect
          label="Subject"
          value={subject?.name ?? "Select subject"}
          open={menu === "subject"}
          onPress={() => setMenu(menu === "subject" ? null : "subject")}
          items={bank.subjects.map((x) => ({ id: x.id, label: x.name }))}
          onSelect={selectSubject}
          onAdd={() => setDialog("subject")}
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
          onAdd={() => setDialog("chapter")}
          disabled={!subject}
        />
        <SetupSelect
          label="Exercise"
          value={exercise?.name ?? "Select exercise"}
          open={menu === "exercise"}
          onPress={() => setMenu(menu === "exercise" ? null : "exercise")}
          items={
            chapter?.exercises.map((x) => ({
              id: x.id,
              label: `${x.name} · ${x.questions ? "Questions" : "Answer key"} · ${x.questionCount}Q`,
            })) ?? []
          }
          onSelect={(value) => {
            setExerciseId(value);
            setMenu(null);
          }}
          onAdd={() => setDialog("exercise")}
          disabled={!chapter}
        />
        {exercise ? (
          <Pressable onPress={editExercise} style={s.exerciseEdit}>
            <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.accent} />
            <Text style={s.exerciseEditText} numberOfLines={1}>
              Edit {exercise.questions?.length ? "questions" : "answer key"} · {exercise.name}
            </Text>
          </Pressable>
        ) : null}
        <View style={s.card}>
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
            style={s.input}
            placeholder="Minutes"
            placeholderTextColor={colors.subdued}
          />
          <View style={s.presetRow}>
            {[15, 30, 45, 60].map((value) => (
              <Pressable
                key={value}
                onPress={() => setMinutes(String(value))}
                style={[s.preset, Number(minutes) === value && s.presetActive]}
              >
                <Text style={[s.presetText, Number(minutes) === value && s.presetTextActive]}>
                  {value}m
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={s.card}>
          <Text style={s.label}>QUESTIONS</Text>
          <View style={s.modeRow}>
            <Pressable onPress={() => setRandom(false)} style={[s.mode, !random && s.modeActive]}>
              <Text style={[s.modeText, !random && s.modeTextActive]}>Sequential</Text>
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
              <Text style={[s.modeText, random && s.modeTextActive]}>Random</Text>
            </Pressable>
          </View>
          <View style={s.modeRow}>
            <Pressable
              disabled={random}
              onPress={() => setFixed(false)}
              style={[s.mode, !fixed && s.modeActive, random && s.disabled]}
            >
              <Text style={[s.modeText, !fixed && s.modeTextActive]}>Unlimited</Text>
            </Pressable>
            <Pressable onPress={() => setFixed(true)} style={[s.mode, fixed && s.modeActive]}>
              <Text style={[s.modeText, fixed && s.modeTextActive]}>Fixed count</Text>
            </Pressable>
          </View>
          {fixed && (
            <TextInput
              value={count}
              onChangeText={(value) => {
                const digits = value.replace(/\D/g, "");
                setCount(
                  digits === ""
                    ? ""
                    : String(Math.max(1, Math.min(availableQuestions, Number(digits) || 1))),
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
          {!random && (
            <TextInput
              value={start}
              onChangeText={(value) => {
                const digits = value.replace(/\D/g, "");
                const nextStart = Math.max(1, Math.min(exerciseQuestionTotal, Number(digits) || 1));
                const nextAvailable = Math.max(1, exerciseQuestionTotal - nextStart + 1);
                setStart(digits === "" ? "" : String(nextStart));
                setCount((current) =>
                  current === ""
                    ? current
                    : String(Math.max(1, Math.min(nextAvailable, Number(current) || 1))),
                );
              }}
              onBlur={() => {
                setStart(String(startNumber));
                setCount(String(questionCount));
              }}
              keyboardType="number-pad"
              maxLength={String(exerciseQuestionTotal).length}
              style={s.input}
              placeholder="Start numbering"
              placeholderTextColor={colors.subdued}
            />
          )}
          <Text style={s.helper}>
            {random
              ? "Random test starts at 1. Favourites are selected first."
              : fixed
                ? `Questions Q${startNumber}–Q${startNumber + questionCount - 1} of ${exerciseQuestionTotal}`
                : "Solve until the timer ends."}
          </Text>
        </View>
        <MarkingCard marking={bank.marking} onSave={(marking) => saveBank({ ...bank, marking })} />
        <Pressable style={s.primary} onPress={begin}>
          <Text style={s.primaryText}>Continue to instructions</Text>
          <MaterialCommunityIcons name="arrow-right" size={19} color={examAccentDeep} />
        </Pressable>
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
        error={jsonError}
        editing={editingExerciseId !== null}
        onClose={() => {
          setDialog(null);
          setJsonError("");
          setEditingExerciseId(null);
        }}
        onSave={add}
      />
    </View>
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
  return (
    <View style={s.selectGroup}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Pressable disabled={disabled} onPress={onPress} style={[s.select, disabled && s.disabled]}>
        <Text style={s.selectText}>{value}</Text>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.muted}
        />
      </Pressable>
      {open && (
        <View style={s.menu}>
          {items.map((item) => (
            <Pressable key={item.id} onPress={() => onSelect(item.id)} style={s.menuItem}>
              <Text style={s.menuText}>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onAdd} style={s.addItem}>
            <MaterialCommunityIcons name="plus" size={16} color={colors.accent} />
            <Text style={s.addItemText}>Add {label.toLowerCase()}</Text>
          </Pressable>
        </View>
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
}: {
  count: number;
  values: Array<Option | null>;
  onChange: (value: Array<Option | null>) => void;
  onBack: () => void;
  onSave: () => void;
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
          disabled={!complete}
          style={[s.primary, !complete && s.disabled]}
          onPress={onSave}
        >
          <Text style={s.primaryText}>Save answer key</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
function MarkingCard({
  marking,
  onSave,
}: {
  marking: Bank["marking"];
  onSave: (next: Bank["marking"]) => void;
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
    <View style={s.card}>
      <View style={s.markingHeader}>
        <Text style={s.label}>MARKING SCHEME</Text>
        <Pressable onPress={editing ? save : beginEditing} style={s.markingEdit}>
          <MaterialCommunityIcons
            name={editing ? "check" : "pencil-outline"}
            size={15}
            color={colors.accent}
          />
          <Text style={s.markingEditText}>{editing ? "Save" : "Edit"}</Text>
        </Pressable>
      </View>
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
      ) : (
        <Text style={s.marking}>
          +{marking.positive} correct · −{marking.negative} wrong
        </Text>
      )}
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
        <View style={s.questionCard}>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.palette}>
          {Array.from({ length: count }, (_, index) => (
            <Pressable
              key={index}
              onPress={() => onCurrent(index)}
              style={[
                s.paletteItem,
                index === current && s.paletteCurrent,
                answers[index] && s.paletteAnswered,
              ]}
            >
              <Text style={s.paletteText}>{index + 1}</Text>
            </Pressable>
          ))}
        </ScrollView>
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
  onBack,
  onDelete,
  onUpdate,
  onReattempt,
}: {
  records: Record[];
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (record: Record) => void;
  onReattempt: (record: Record) => void;
}) {
  const [subject, setSubject] = useState("All subjects");
  const [chapter, setChapter] = useState("All chapters");
  const [filterMenu, setFilterMenu] = useState<"subject" | "chapter" | null>(null);
  const [selected, setSelected] = useState<{ record: Record; attempts: Record[] } | null>(null);
  const subjects = Array.from(new Set(records.map((record) => record.subject))).sort();
  const chapters = Array.from(
    new Set(
      records
        .filter((record) => subject === "All subjects" || record.subject === subject)
        .map((record) => record.chapter),
    ),
  ).sort();
  const visible = records.filter(
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
        : `${record.subjectId || record.subject}||${record.chapterId || record.chapter}||${record.exerciseId || record.exercise}||${record.startNumber}||${record.answers.length}`;
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
  return (
    <View style={s.historyFilterWrap}>
      <Pressable onPress={onPress} style={[s.historyFilterButton, open && s.historyFilterButtonOpen]}>
        <Text numberOfLines={1} style={s.historyFilterText}>{label}</Text>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={17} color={colors.muted} />
      </Pressable>
      {open ? <View style={s.historyFilterMenu}>{options.map((option) => <Pressable key={option} onPress={() => onSelect(option)} style={[s.historyFilterOption, option === label && s.historyFilterOptionActive]}><Text numberOfLines={1} style={[s.historyFilterOptionText, option === label && s.historyFilterOptionTextActive]}>{option}</Text></Pressable>)}</View> : null}
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
          <Pressable onPress={onReevaluate} style={s.detailAction}>
            <MaterialCommunityIcons name="refresh" size={15} color={colors.text} />
            <Text style={s.detailActionText}>Recheck</Text>
          </Pressable>
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
            <View style={s.questionCard}>
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
            <View style={s.palette}>
              {Array.from({ length: questionCount }, (_, index) => index).map((index) => (
                <Pressable
                  key={questions[index]?.id ?? `answer-key-palette-${index}`}
                  onPress={() => goToQuestion(index)}
                  style={[
                    s.paletteItem,
                    index === current && s.paletteCurrent,
                    !reattemptMode && !record.answers[index] && s.solutionPaletteSkipped,
                    !reattemptMode && record.answers[index] === record.key[index] && s.solutionPaletteCorrect,
                    !reattemptMode && record.answers[index] && record.answers[index] !== record.key[index] && s.solutionPaletteWrong,
                    reattemptMode && reattemptAnswers[index] && s.paletteAnswered,
                  ]}
                >
                  <Text style={s.paletteText}>{index + 1}</Text>
                </Pressable>
              ))}
            </View>
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
  error: string;
  editing: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const exercise = title === "Add exercise";
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={[s.backdrop, exercise && s.sheetBackdrop]} onPress={onClose}>
        <Pressable style={[s.dialog, exercise && s.exerciseSheet]} onPress={() => undefined}>
          {exercise ? <View style={s.sheetHandle} /> : null}
          <Text style={s.dialogTitle}>{editing ? "Update exercise" : title}</Text>
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
                <View style={s.modeRow}>
                  <Pressable
                    onPress={() => onKind("key")}
                    style={[s.mode, kind === "key" && s.modeActive]}
                  >
                    <Text style={[s.modeText, kind === "key" && s.modeTextActive]}>Answer key</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onKind("questions")}
                    style={[s.mode, kind === "questions" && s.modeActive]}
                  >
                    <Text style={[s.modeText, kind === "questions" && s.modeTextActive]}>
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
                  <Text style={s.helper}>
                    Next, fill the answer key for every question—just like the web flow.
                  </Text>
                </>
              ) : (
                <>
                  <TextInput
                    multiline
                    scrollEnabled
                    nestedScrollEnabled
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={json}
                    onChangeText={onJson}
                    placeholder={
                      '[{"question":"...","options":["A","B","C","D"],"correctAnswer":0}]'
                    }
                    placeholderTextColor={colors.subdued}
                    style={s.jsonInput}
                  />
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
                    : "Next: answer key"
                  : editing
                    ? "Update exercise"
                    : "Add"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function QuestionBank({
  subjects,
  filter,
  onFilter,
  favourites,
  onToggleFavourite,
  viewing,
  onView,
  onBack,
}: {
  subjects: Subject[];
  filter: string;
  onFilter: (value: string) => void;
  favourites: string[];
  onToggleFavourite: (id: string) => void;
  viewing: Exercise | null;
  onView: (exercise: Exercise | null) => void;
  onBack: () => void;
}) {
  const [chapterFilter, setChapterFilter] = useState("all");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [subjectFilterOpen, setSubjectFilterOpen] = useState(false);
  const [chapterFilterOpen, setChapterFilterOpen] = useState(false);
  const visibleSubjects = subjects.filter((subject) => filter === "all" || subject.id === filter);
  const chapters = visibleSubjects.flatMap((subject) =>
    subject.chapters.map((chapter) => ({ id: `${subject.id}:${chapter.id}`, name: chapter.name })),
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
  if (viewing?.questions)
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
                <View style={s.bankViewerCard}>
                  <View style={s.bankQuestionHeader}>
                    <Text style={s.bankQuestionNumber}>QUESTION {currentQuestion + 1}</Text>
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
                      onPress={() => setCurrentQuestion((value) => Math.max(0, value - 1))}
                      style={[s.outline, currentQuestion === 0 && s.disabled]}
                    >
                      <Text style={s.outlineText}>Previous</Text>
                    </Pressable>
                    <Pressable
                      disabled={currentQuestion === viewing.questions.length - 1}
                      onPress={() =>
                        setCurrentQuestion((value) =>
                          Math.min(viewing.questions.length - 1, value + 1),
                        )
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
                  <View style={s.palette}>
                    {viewing.questions.map((item, index) => (
                      <Pressable
                        key={item.id}
                        onPress={() => setCurrentQuestion(index)}
                        style={[
                          s.paletteItem,
                          index === currentQuestion && s.paletteCurrent,
                          favourites.includes(item.id) && s.paletteFavourite,
                        ]}
                      >
                        <Text style={s.paletteText}>{index + 1}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </>
            );
          })()}
        </ScrollView>
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
            label={
              chapterFilter === "all"
                ? "All chapters"
                : (chapters.find((chapter) => chapter.id === chapterFilter)?.name ?? "All chapters")
            }
            open={chapterFilterOpen}
            onPress={() => {
              setChapterFilterOpen((value) => !value);
              setSubjectFilterOpen(false);
            }}
            options={[{ id: "all", label: "All chapters" }, ...chapters]}
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
  label,
  open,
  onPress,
  options,
  onSelect,
}: {
  label: string;
  open: boolean;
  onPress: () => void;
  options: { id: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  return (
    <View style={[s.bankDropdown, open && s.bankDropdownOpen]}>
      <Pressable
        onPress={onPress}
        style={[s.bankDropdownTrigger, open && s.bankDropdownTriggerOpen]}
      >
        <Text numberOfLines={1} style={s.bankDropdownValue}>
          {label}
        </Text>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={19}
          color={colors.muted}
        />
      </Pressable>
      {open ? (
        <View style={s.bankDropdownMenu}>
          {options.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={s.bankDropdownOption}
            >
              <Text numberOfLines={1} style={s.bankDropdownOptionText}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
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
    padding: 20,
    paddingBottom: 13,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: {
    color: "#93a4be",
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
    letterSpacing: 1.7,
  },
  title: { color: colors.text, fontFamily: "Manrope_800ExtraBold", fontSize: 24, marginTop: 4 },
  content: { padding: 20, paddingTop: 5, gap: 12, paddingBottom: 75 },
  linkButton: { padding: 8, borderRadius: 11, backgroundColor: "#252525" },
  label: {
    color: colors.subdued,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    marginBottom: 8,
  },
  selectGroup: { zIndex: 20 },
  select: {
    height: 49,
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectText: { color: colors.text, fontFamily: "Manrope_600SemiBold", fontSize: 14 },
  menu: {
    marginTop: 5,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#424242",
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#363636",
  },
  menuText: { color: colors.text, fontSize: 13 },
  addItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  addItemText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  exerciseEdit: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: -4,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "#173c36",
  },
  exerciseEditText: { maxWidth: 250, color: "#a7f3d0", fontSize: 11, fontWeight: "800" },
  card: {
    borderRadius: 18,
    padding: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    height: 48,
    marginTop: 2,
    borderRadius: 12,
    paddingHorizontal: 13,
    color: colors.text,
    fontFamily: "Manrope_500Medium",
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  presetRow: { flexDirection: "row", gap: 7, marginTop: 10 },
  preset: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 9,
    backgroundColor: "#2b2b2b",
  },
  presetActive: { backgroundColor: examAccentSurface },
  presetText: { color: colors.muted, fontFamily: "Manrope_700Bold", fontSize: 12 },
  presetTextActive: { color: "#dbeafe" },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  mode: {
    flex: 1,
    alignItems: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingVertical: 10,
  },
  modeActive: { borderColor: examAccent, backgroundColor: examAccentSurface },
  modeText: { color: colors.muted, fontFamily: "Manrope_700Bold", fontSize: 12 },
  modeTextActive: { color: "#dbeafe" },
  exerciseTypeLocked: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#315d54",
    backgroundColor: "#153c35",
  },
  exerciseTypeLockedText: { color: "#ccfbf1", fontSize: 12, fontWeight: "800" },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  markingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  markingEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: -6,
    borderRadius: 9,
    backgroundColor: "#203d37",
  },
  markingEditText: { color: colors.accent, fontSize: 11, fontWeight: "800" },
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
  marking: { color: colors.text, fontSize: 14, fontWeight: "700" },
  primary: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderRadius: 14,
    backgroundColor: examAccent,
  },
  primarySmall: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 11,
    backgroundColor: examAccent,
  },
  primaryText: { color: examAccentDeep, fontFamily: "Manrope_800ExtraBold", fontSize: 13 },
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
  historyFilterButtonOpen: { borderColor: examAccent, backgroundColor: "#17243a" },
  historyFilterText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  historyFilterMenu: { position: "absolute", zIndex: 40, elevation: 40, top: 47, right: 0, left: 0, maxHeight: 210, overflow: "hidden", borderRadius: 12, backgroundColor: "#292929", borderWidth: 1, borderColor: "#454545", shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  historyFilterOption: { paddingHorizontal: 12, paddingVertical: 10 },
  historyFilterOptionActive: { backgroundColor: "#383838" },
  historyFilterOptionText: { color: "#d4d4d8", fontSize: 12 },
  historyFilterOptionTextActive: { color: colors.text, fontWeight: "800" },
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
    height: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderRadius: 12,
    paddingLeft: 13,
    paddingRight: 10,
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: colors.border,
  },
  bankDropdownTriggerOpen: { borderColor: "#60a5fa", backgroundColor: "#20272d" },
  bankDropdownValue: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  bankDropdownMenu: {
    position: "absolute",
    zIndex: 100,
    elevation: 100,
    top: 52,
    left: 0,
    right: 0,
    maxHeight: 210,
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#272727",
    borderWidth: 1,
    borderColor: "#4a4a4a",
  },
  bankDropdownOption: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: "#3a3a3a",
  },
  bankDropdownOptionText: { color: colors.text, fontSize: 12 },
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
  paletteFavourite: { borderColor: "#c99b1b" },
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
  dialogTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  jsonInput: {
    height: 280,
    marginTop: 10,
    borderRadius: 12,
    padding: 13,
    color: colors.text,
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#3f3f46",
    textAlignVertical: "top",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
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
