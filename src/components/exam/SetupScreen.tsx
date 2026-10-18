import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnswerKeyScreen } from "@/components/exam/AnswerKeyScreen";
import { PageLoader } from "@/components/ui/page-loader";
import { consumeLightPageLoader } from "@/lib/navigation";
import {
  upsertExercise,
  deleteExercise,
  addChapter,
  getExercise,
  addSubject,
  DEFAULT_EXERCISE,
  DEFAULT_MARKING,
  formatMarking,
  loadFavoriteQuestionIds,
  newDocumentId,
  loadMarking,
  loadSubjects,
  onPracticePersist,
  saveMarking,
  type MarkingScheme,
  type McqQuestion,
  type Option,
  type Subject,
} from "@/lib/exam";

import { ALL_PRACTICE_EXERCISES, ALL_PRACTICE_EXERCISES_LABEL, combineQuestionExercises, samplePracticeQuestions } from "../../../mobile-tasks/src/domain/practice-exercises";

export type TestConfig = {
  minutes: number;
  startNumber: number;
  testMode: "standard" | "random";
  subjectId: string | null;
  subject: string;
  chapterId: string | null;
  chapter: string;
  exercise: string;
  exerciseId: string | null;
  marking: MarkingScheme;
  questionCount: number | null;
  maxQuestions: number | null;
  answerKey: (Option | null)[] | null;
  questions: McqQuestion[] | null;
  questionNumbers: number[] | null;
  questionIds: string[] | null;
  darkMode: boolean | null;
};

const PRESETS = [15, 30, 45, 60];
const MAX_DURATION_MINUTES = 300;

const optionLetters: Option[] = ["A", "B", "C", "D"];

function parseQuestionsJson(raw: string): McqQuestion[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length === 0)
    throw new Error("Use a JSON array with at least one question.");
  if (value.length > 500) throw new Error("An exercise can contain at most 500 questions.");
  const questions = value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Question ${index + 1} is invalid.`);
    const q = item as Record<string, unknown>;
    const options = q["options"];
    const correct = q["correctAnswer"];
    if (typeof q["question"] !== "string" || !q["question"].trim())
      throw new Error(`Question ${index + 1} needs question text.`);
    if (
      !Array.isArray(options) ||
      options.length !== 4 ||
      options.some((option) => typeof option !== "string" || !option.trim())
    )
      throw new Error(`Question ${index + 1} needs exactly four non-empty options.`);
    const optionIndex = typeof correct === "number" ? correct : -1;
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3)
      throw new Error(`Question ${index + 1}: correctAnswer must be 0, 1, 2, or 3.`);
    if (q["explanation"] !== undefined && typeof q["explanation"] !== "string")
      throw new Error(`Question ${index + 1}: explanation must be text.`);
    return {
      id: typeof q["id"] === "string" && q["id"].trim() ? q["id"] : newDocumentId("question"),
      number: index + 1,
      question: q["question"].trim(),
      options: [
        options[0] as string,
        options[1] as string,
        options[2] as string,
        options[3] as string,
      ] as [string, string, string, string],
      correctAnswer: optionLetters[optionIndex]!,
      ...(typeof q["explanation"] === "string" && q["explanation"].trim()
        ? { explanation: q["explanation"].trim() }
        : {}),
    };
  });
  return questions;
}

export type SetupPrefill = {
  subject?: string | undefined;
  chapter?: string | undefined;
  exercise?: string | undefined;
  minutes?: number | undefined;
  startNumber?: number | undefined;
  questionCount?: number | null | undefined;
};

export function SetupScreen({
  onStart,
  prefill,
}: {
  onStart: (config: TestConfig) => void;
  prefill?: SetupPrefill;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [chapter, setChapter] = useState(prefill?.chapter ?? "");
  const [exercise, setExercise] = useState(prefill?.exercise === ALL_PRACTICE_EXERCISES_LABEL ? ALL_PRACTICE_EXERCISES : (prefill?.exercise ?? ""));
  const [newSubject, setNewSubject] = useState("");
  const [newChapter, setNewChapter] = useState("");
  const [chapterDraft, setChapterDraft] = useState<string | null>(null);
  const [draftExercise, setDraftExercise] = useState(DEFAULT_EXERCISE);
  const [draftCount, setDraftCount] = useState("50");
  const [draftStep, setDraftStep] = useState<"count" | "key">("count");
  const [draftKey, setDraftKey] = useState<(Option | null)[] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [jsonExerciseName, setJsonExerciseName] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [jsonFileName, setJsonFileName] = useState("");
  const questionFileInput = useRef<HTMLInputElement>(null);

  const [minutes, setMinutes] = useState(
    String(Math.min(MAX_DURATION_MINUTES, prefill?.minutes ?? 30)),
  );
  const [startNumber, setStartNumber] = useState(String(prefill?.startNumber ?? 1));
  const [countMode, setCountMode] = useState<"unlimited" | "fixed">(
    prefill?.questionCount ? "fixed" : "unlimited",
  );
  const [questionCount, setQuestionCount] = useState(String(prefill?.questionCount ?? 50));
  const [questionOrder, setQuestionOrder] = useState<"sequential" | "random">("sequential");

  const [marking, setMarking] = useState<MarkingScheme>(DEFAULT_MARKING);
  const [editingMarking, setEditingMarking] = useState(false);
  const [isLoading, setIsLoading] = useState(consumeLightPageLoader);
  const [positive, setPositive] = useState("4");
  const [negative, setNegative] = useState("1");

  useEffect(() => {
    const savedSubjects = loadSubjects();
    setSubjects(savedSubjects);
    setSubject((current) => current || savedSubjects[0]?.name || "");
    const saved = loadMarking();
    if (saved) {
      setMarking(saved);
      setPositive(String(saved.positive));
      setNegative(String(saved.negative));
    } else {
      setEditingMarking(true);
    }
    if (!isLoading) return;
    const timer = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  useEffect(() =>
    onPracticePersist((key) => {
      if (key === "cbt-subjects") {
        const next = loadSubjects();
        setSubjects(next);
        setSubject((current) => next.some((item) => item.name === current) ? current : (next[0]?.name ?? ""));
      }
      if (key === "cbt-marking") {
        const next = loadMarking();
        if (!next) return;
        setMarking(next);
        setPositive(String(next.positive));
        setNegative(String(next.negative));
      }
    }),
  []);

  const chapters = subjects.find((s) => s.name === subject)?.chapters ?? [];
  const exercises = chapters.find((c) => c.name === chapter)?.exercises ?? [];
  const isAllExercises = exercise === ALL_PRACTICE_EXERCISES;
  const combinedExercise = combineQuestionExercises(exercises);
  const activeExercise = isAllExercises ? combinedExercise : (chapter ? getExercise(subject, chapter, exercise || null) : null);
  const activeExerciseName = activeExercise?.name ?? exercise;
  const isJsonExercise = Boolean(activeExercise?.questions?.length);
  const parsedStart = isAllExercises ? 1 : Math.max(1, Number(startNumber) || 1);
  const jsonQuestions = activeExercise?.questions ?? null;
  const orderedJsonQuestions = jsonQuestions;
  const jsonStartIndex = parsedStart - 1;
  const jsonAvailable =
    jsonStartIndex >= 0 && jsonStartIndex < (orderedJsonQuestions?.length ?? 0)
      ? orderedJsonQuestions!.slice(jsonStartIndex)
      : null;
  const chapterTotal = activeExercise?.questionCount ?? null;
  const maxStartNumber = isJsonExercise ? (orderedJsonQuestions?.length ?? null) : chapterTotal;
  const parsedMinutes = Math.min(MAX_DURATION_MINUTES, Math.max(1, Number(minutes) || 0));
  const available = isJsonExercise
    ? (jsonAvailable?.length ?? null)
    : chapterTotal
      ? chapterTotal - parsedStart + 1
      : null;
  const startTooHigh = isJsonExercise
    ? jsonStartIndex < 0
    : chapterTotal !== null && parsedStart > chapterTotal;
  const parsedCount = Math.min(
    available ?? 500,
    Math.min(500, Math.max(1, Number(questionCount) || 0)),
  );
  const maxQuestionCount = Math.min(500, available ?? 500);
  const countTooHigh =
    countMode === "fixed" && available !== null && Number(questionCount) > available;
  const valid =
    Number(minutes) >= 1 &&
    Number(minutes) <= MAX_DURATION_MINUTES &&
    subject !== "" &&
    chapter !== "" &&
    !editingMarking &&
    !startTooHigh &&
    !countTooHigh &&
    (isAllExercises ? Boolean(combinedExercise) && Number(questionCount) >= 1 && Number(questionCount) <= maxQuestionCount : (countMode === "unlimited" || Number(questionCount) >= 1));

  const buildRandomQuestions = () => {
    if (isAllExercises) return samplePracticeQuestions(orderedJsonQuestions ?? [], parsedCount).map((question, index) => ({ question, index }));
    const favorites = new Set(loadFavoriteQuestionIds());
    const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
    const all = (orderedJsonQuestions ?? []).map((question, index) => ({ question, index }));
    const favouriteQuestions = shuffle(all.filter((item) => favorites.has(item.question.id)));
    const ordinaryQuestions = shuffle(all.filter((item) => !favorites.has(item.question.id)));
    const target = Math.min(parsedCount, all.length);
    // A random paper always starts with saved favourites; ordinary questions only fill spare slots.
    return [...favouriteQuestions, ...ordinaryQuestions].slice(0, target);
  };

  const answerKeyExercises = exercises.filter((item) => !item.questions?.length);
  const questionExercises = exercises.filter((item) => item.questions?.length);

  const createSubject = () => {
    const name = newSubject.trim();
    if (!name) return;
    setSubjects(addSubject(name));
    setSubject(name);
    setChapter("");
    setExercise("");
    setNewSubject("");
  };

  const selectChapter = (name: string, exerciseName?: string) => {
    setChapter(name);
    if (exerciseName === ALL_PRACTICE_EXERCISES || exerciseName === ALL_PRACTICE_EXERCISES_LABEL) {
      const combined = combineQuestionExercises(subjects.find((item) => item.name === subject)?.chapters.find((item) => item.name === name)?.exercises ?? []);
      setExercise(ALL_PRACTICE_EXERCISES);
      setCountMode("fixed");
      setStartNumber("1");
      setQuestionCount(String(Math.min(50, combined?.questionCount ?? 1)));
      return;
    }
    const ex = getExercise(subject, name, exerciseName ?? null);
    setExercise(ex?.name ?? "");
    if (ex?.questions?.length) {
      setCountMode("fixed");
      setQuestionCount(String(ex.questions.length));
      setStartNumber("1");
    } else if (ex?.questionCount) {
      setCountMode("fixed");
      setQuestionCount(String(ex.questionCount));
      setStartNumber("1");
    }
  };

  const selectSubject = (name: string) => {
    const firstChapter = subjects.find((item) => item.name === name)?.chapters[0];
    setSubject(name);
    setChapter(firstChapter?.name ?? "");
    const firstExercise = firstChapter?.exercises[0];
    setExercise(firstExercise?.name ?? "");
    if (firstExercise?.questions?.length) {
      setCountMode("fixed");
      setQuestionCount(String(firstExercise.questions.length));
      setStartNumber("1");
    } else if (firstExercise?.questionCount) {
      setCountMode("fixed");
      setQuestionCount(String(firstExercise.questionCount));
      setStartNumber("1");
    }
  };

  const createChapter = () => {
    const name = newChapter.trim();
    if (!name || !subject) return;
    setSubjects(addChapter(subject, name));
    setChapter(name);
    setExercise("");
    setNewChapter("");
  };

  const addExercise = () => {
    if (!subject || !chapter) return;
    setChapterDraft(chapter);
    setDraftExercise(`Exercise ${exercises.length + 1}`);
    setDraftStep("count");
    setDraftCount("50");
    setDraftKey(null);
    setIsEditing(false);
  };

  const editChapter = () => {
    if (!subject || !chapter) return;
    const stored = getExercise(subject, chapter, exercise || null);
    if (stored?.questions?.length) {
      setJsonExerciseName(stored.name);
      setJsonText(
        JSON.stringify(
          stored.questions.map((question) => ({
            id: question.id,
            question: question.question,
            options: question.options,
            correctAnswer: optionLetters.indexOf(question.correctAnswer),
            ...(question.explanation ? { explanation: question.explanation } : {}),
          })),
          null,
          2,
        ),
      );
      setJsonError("");
      setJsonFileName("Current question file");
      setJsonDialogOpen(true);
      return;
    }
    setChapterDraft(chapter);
    setDraftExercise(stored?.name ?? DEFAULT_EXERCISE);
    setDraftStep("count");
    setDraftCount(String(stored?.questionCount ?? 50));
    setDraftKey(stored?.answerKey ?? null);
    setIsEditing(true);
  };

  const finishChapter = (key: (Option | null)[]) => {
    if (!chapterDraft || !subject) return;
    const count = Math.min(500, Math.max(1, Number(draftCount) || 0));
    const exName = draftExercise.trim() || DEFAULT_EXERCISE;
    setSubjects(
      upsertExercise(subject, chapterDraft, exName, count, key.some(Boolean) ? key : null),
    );
    setChapter(chapterDraft);
    setExercise(exName);
    setCountMode("fixed");
    setQuestionCount(String(count));
    setNewChapter("");
    setChapterDraft(null);
    setDraftKey(null);
    setIsEditing(false);
  };

  const openJsonExercise = () => {
    if (!subject || !chapter) return;
    setJsonExerciseName(`Practice Set ${exercises.length + 1}`);
    setJsonText("");
    setJsonError("");
    setJsonFileName("");
    setJsonDialogOpen(true);
  };

  const saveJsonExercise = () => {
    try {
      const questions = parseQuestionsJson(jsonText);
      const name = jsonExerciseName.trim();
      if (!name) throw new Error("Enter an exercise name.");
      setSubjects(
        upsertExercise(
          subject,
          chapter,
          name,
          questions.length,
          questions.map((q) => q.correctAnswer),
          questions,
        ),
      );
      setExercise(name);
      setQuestionCount(String(questions.length));
      setCountMode("fixed");
      setStartNumber("1");
      setJsonDialogOpen(false);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON.");
    }
  };
  const chooseQuestionFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = await file.text();
      parseQuestionsJson(raw);
      setJsonText(raw);
      setJsonFileName(file.name);
      setJsonError("");
    } catch (error) {
      setJsonText("");
      setJsonFileName("");
      setJsonError(error instanceof Error ? error.message : "Choose a valid question JSON file.");
    } finally {
      if (questionFileInput.current) questionFileInput.current.value = "";
    }
  };

  const commitMarking = () => {
    const next: MarkingScheme = {
      positive: Number(positive) || 0,
      negative: Number(negative) || 0,
    };
    setMarking(next);
    saveMarking(next);
    setEditingMarking(false);
  };

  const num = (v: string) => v.replace(/[^0-9.]/g, "");

  if (isLoading) return <PageLoader label="Preparing your test" />;

  return (
    <div className="card-surface space-y-2.5 p-3 sm:p-3.5">
      {/* Subject & chapter */}
      <section className="space-y-1.5">
        <Label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Topic
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Select
              value={subject}
              onValueChange={(v) => {
                selectSubject(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent className="exam-select-content">
                {subjects.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="New subject e.g. Reasoning"
              />
              <Button type="button" variant="outline" onClick={createSubject}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Select value={chapter} onValueChange={(v) => selectChapter(v)} disabled={!subject}>
              <SelectTrigger>
                <SelectValue placeholder={subject ? "Select chapter" : "Select a subject first"} />
              </SelectTrigger>
              <SelectContent className="exam-select-content">
                {chapters.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                    {c.exercises.length > 1 ? ` · ${c.exercises.length} exercises` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={newChapter}
                onChange={(e) => setNewChapter(e.target.value)}
                placeholder="New chapter e.g. Blood Relation"
                disabled={!subject}
              />
              <Button type="button" variant="outline" onClick={createChapter} disabled={!subject}>
                Add
              </Button>
            </div>
          </div>
        </div>

        {chapter && (
          <div className="space-y-1.5 rounded-lg border border-border bg-background/50 p-2">
            <div>
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Answer-key exercises
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {answerKeyExercises.map((ex) => (
                    <Button
                      key={ex.name}
                      type="button"
                      size="sm"
                      variant={ex.name === activeExerciseName ? "default" : "outline"}
                      onClick={() => selectChapter(chapter, ex.name)}
                    >
                      {ex.name}
                      {ex.questionCount ? ` · ${ex.questionCount}Q` : ""}
                    </Button>
                  ))}
                  <Button type="button" size="sm" variant="ghost" onClick={addExercise}>
                    + Add answer-key exercise
                  </Button>
                </div>
              </div>
            </div>
            <div className={answerKeyExercises.length > 0 ? "mt-3" : ""}>
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Question-based exercises
              </p>
              <div className="flex flex-wrap gap-1.5">
                {questionExercises.length > 0 && <Button type="button" size="sm" variant={isAllExercises ? "default" : "outline"} onClick={() => selectChapter(chapter, ALL_PRACTICE_EXERCISES)}>All exercises · {combinedExercise?.questionCount}Q</Button>}
                {questionExercises.map((ex) => (
                  <Button
                    key={ex.name}
                    type="button"
                    size="sm"
                    variant={ex.name === activeExerciseName ? "default" : "outline"}
                    onClick={() => selectChapter(chapter, ex.name)}
                  >
                    {ex.name}
                    {ex.questionCount ? ` · ${ex.questionCount}Q` : ""}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="secondary" onClick={openJsonExercise}>
                  + Add question exercise
                </Button>
              </div>
            </div>
            {!isAllExercises && <button
              type="button"
              onClick={editChapter}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {isJsonExercise ? "Edit questions of" : "Edit questions & answer key of"} “
              {activeExerciseName || chapter}”
            </button>}
            {isJsonExercise && !isAllExercises && (
              <button
                type="button"
                onClick={() => {
                  setSubjects(deleteExercise(subject, chapter, activeExerciseName));
                  selectChapter(chapter);
                }}
                className="ml-3 text-xs font-medium text-destructive underline-offset-2 hover:underline"
              >
                Delete question exercise
              </button>
            )}
          </div>
        )}
      </section>

      {/* Duration & start number */}
      <section className="space-y-1.5">
        <Label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Timing
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Input
              inputMode="numeric"
              max={MAX_DURATION_MINUTES}
              value={minutes}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "");
                setMinutes(next === "" ? "" : String(Math.min(MAX_DURATION_MINUTES, Number(next))));
              }}
              placeholder="Duration (minutes)"
            />
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={Number(minutes) === p ? "default" : "outline"}
                  onClick={() => setMinutes(String(p))}
                >
                  {p} min
                </Button>
              ))}
            </div>
          </div>

          {!isAllExercises && <div className="space-y-1.5">
            <Input
              inputMode="numeric"
              min={1}
              max={maxStartNumber ?? undefined}
              value={startNumber}
              disabled={isJsonExercise && questionOrder === "random"}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "");
                const capped = maxStartNumber
                  ? Math.max(1, Math.min(Number(next) || 1, maxStartNumber))
                  : next;
                setStartNumber(next === "" ? "" : String(capped));
                const nextStart = Number(capped) || 1;
                const nextAvailable = isJsonExercise
                  ? Math.max(0, (orderedJsonQuestions?.length ?? 0) - nextStart + 1)
                  : chapterTotal
                    ? Math.max(0, chapterTotal - nextStart + 1)
                    : 500;
                setQuestionCount((current) =>
                  current === ""
                    ? current
                    : String(
                        Math.max(1, Math.min(Number(current) || 1, Math.min(500, nextAvailable))),
                      ),
                );
              }}
              placeholder="Start question no. e.g. 151"
            />
            <p
              className={cn("text-xs", startTooHigh ? "text-destructive" : "text-muted-foreground")}
            >
              {startTooHigh
                ? `This chapter has only ${chapterTotal} questions.`
                : isJsonExercise && questionOrder === "random"
                  ? "Random test selects questions from the entire exercise."
                : `Numbering begins at Q${parsedStart}.` +
                  (chapterTotal ? ` Chapter total ${chapterTotal}.` : "")}
            </p>
          </div>}
        </div>
      </section>

      {/* Number of questions */}
      <section className="space-y-1.5">
        <Label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Questions
        </Label>
        {!isAllExercises && <div className="flex flex-wrap gap-2">
          {isJsonExercise && (
            <>
              <Button
                type="button"
                size="sm"
                variant={questionOrder === "sequential" ? "default" : "outline"}
                onClick={() => setQuestionOrder("sequential")}
              >
                Sequential
              </Button>
              <Button
                type="button"
                size="sm"
                variant={questionOrder === "random" ? "default" : "outline"}
                onClick={() => {
                  setQuestionOrder("random");
                  setCountMode("fixed");
                  setStartNumber("1");
                  setQuestionCount((current) =>
                    String(Math.min(Number(current) || 1, orderedJsonQuestions?.length ?? 1)),
                  );
                }}
              >
                Random
              </Button>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant={countMode === "unlimited" ? "default" : "outline"}
            onClick={() => setCountMode("unlimited")}
            disabled={isJsonExercise && questionOrder === "random"}
          >
            Unlimited
          </Button>
          <Button
            type="button"
            size="sm"
            variant={countMode === "fixed" ? "default" : "outline"}
            onClick={() => setCountMode("fixed")}
          >
            Fixed count
          </Button>
        </div>}
        {isAllExercises || countMode === "fixed" ? (
          <div className="space-y-1">
            <Input
              inputMode="numeric"
              min={1}
              max={maxQuestionCount}
              value={questionCount}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "");
                setQuestionCount(
                  next === ""
                    ? ""
                    : String(Math.max(1, Math.min(Number(next) || 1, maxQuestionCount))),
                );
              }}
              placeholder="e.g. 50"
              className="sm:max-w-[200px]"
            />
            <p
              className={cn("text-xs", countTooHigh ? "text-destructive" : "text-muted-foreground")}
            >
              {isAllExercises ? `${parsedCount} questions mixed from all question-based exercises (${chapterTotal} available).` : countTooHigh
                ? `Only ${available} questions remain (Q${parsedStart}–Q${chapterTotal}).`
                : isJsonExercise && questionOrder === "random"
                  ? `${parsedCount} random questions. Favourites are selected first, then ordinary questions fill remaining slots.`
                : `Questions Q${parsedStart}–Q${parsedStart + parsedCount - 1}.`}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Solve as many as you want until the timer ends or you submit.
          </p>
        )}
      </section>

      {/* Marking scheme — compact inline */}
      <section className="space-y-1.5 border-t border-border pt-2.5">
        {editingMarking ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="positive" className="text-xs text-muted-foreground">
                Marks / correct
              </Label>
              <Input
                id="positive"
                inputMode="decimal"
                value={positive}
                onChange={(e) => setPositive(num(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="negative" className="text-xs text-muted-foreground">
                Negative / wrong
              </Label>
              <Input
                id="negative"
                inputMode="decimal"
                value={negative}
                onChange={(e) => setNegative(num(e.target.value))}
              />
            </div>
            <Button onClick={commitMarking}>Save</Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingMarking(true)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-sm hover:bg-accent/50"
          >
            <span className="text-muted-foreground">Marking scheme</span>
            <span className="font-mono font-semibold text-foreground">
              {formatMarking(marking)}
            </span>
          </button>
        )}
      </section>

      <Button
        className="h-10 w-full sm:w-auto"
        disabled={!valid}
        onClick={() => {
          const randomSelection =
            isJsonExercise && (isAllExercises || questionOrder === "random") ? buildRandomQuestions() : null;
          const selectedQuestions = randomSelection
            ? randomSelection.map((item) => item.question)
            : isJsonExercise
              ? countMode === "fixed"
                ? (jsonAvailable ?? []).slice(0, parsedCount)
                : (jsonAvailable ?? [])
              : null;
          onStart({
            minutes: parsedMinutes,
            startNumber: parsedStart,
            testMode: isAllExercises || questionOrder === "random" ? "random" : "standard",
            subjectId: subjects.find((item) => item.name === subject)?.id ?? null,
            subject,
            chapterId: chapters.find((item) => item.name === chapter)?.id ?? null,
            chapter,
            exercise: activeExerciseName || "",
            exerciseId: activeExercise?.id ?? null,
            marking,
            questionCount: isAllExercises || countMode === "fixed" ? parsedCount : null,
            maxQuestions: available,
            answerKey: (() => {
              if (randomSelection) return randomSelection.map((item) => item.question.correctAnswer);
              if (isJsonExercise) {
                const selected =
                  countMode === "fixed"
                    ? (jsonAvailable ?? []).slice(0, parsedCount)
                    : (jsonAvailable ?? []);
                return selected.map((question) => question.correctAnswer);
              }
              const full = activeExercise?.answerKey ?? null;
              if (!full) return null;
              const len = countMode === "fixed" ? parsedCount : (available ?? full.length);
              return full.slice(parsedStart - 1, parsedStart - 1 + len);
            })(),
            questions: selectedQuestions,
            questionNumbers: isAllExercises ? selectedQuestions?.map((_, index) => index + 1) ?? null : randomSelection
              ? randomSelection.map((item) => item.question.number ?? item.index + 1)
              : isJsonExercise
                ? selectedQuestions?.map((question, index) => question.number ?? parsedStart + index) ?? null
                : null,
            questionIds: selectedQuestions?.map((question) => question.id) ?? null,
            darkMode: null,
          })
        }}
      >
        Continue to instructions
      </Button>

      <Dialog open={chapterDraft !== null} onOpenChange={(o) => !o && setChapterDraft(null)}>
        <DialogContent className="exam-dialog-content max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {chapterDraft} — {isEditing ? "edit exercise" : "exercise setup"}
            </DialogTitle>
          </DialogHeader>
          {draftStep === "count" ? (
            <div className="space-y-3">
              <Label htmlFor="draft-count" className="text-xs text-muted-foreground">
                How many questions are in this exercise?
              </Label>
              <Input
                id="draft-count"
                inputMode="numeric"
                value={draftCount}
                onChange={(e) => setDraftCount(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 50"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => setDraftStep("key")}
                  disabled={Number(draftCount) < 1}
                >
                  Next: answer key
                </Button>
              </div>
            </div>
          ) : (
            <AnswerKeyScreen
              key={`${chapterDraft}-${draftExercise}-${draftCount}`}
              count={Math.min(500, Math.max(1, Number(draftCount) || 1))}
              startNumber={1}
              subject={subject}
              chapter={`${chapterDraft ?? ""} · ${draftExercise}`}
              initialKey={draftKey}
              onBack={() => setDraftStep("count")}
              confirmLabel={isEditing ? "Update exercise" : "Save exercise"}
              showSkip={false}
              onConfirm={finishChapter}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={jsonDialogOpen} onOpenChange={setJsonDialogOpen}>
        <DialogContent className="exam-dialog-content max-w-3xl">
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8">
            <DialogTitle>Add question exercise to {chapter}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={jsonExerciseName}
              onChange={(e) => setJsonExerciseName(e.target.value)}
              placeholder="Exercise name e.g. Practice Set 1"
            />
            <input ref={questionFileInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void chooseQuestionFile(event.target.files?.[0])} />
            <button type="button" onClick={() => questionFileInput.current?.click()} className="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[.025] px-4 text-center transition hover:border-sky-400/50 hover:bg-sky-400/5">
              <Upload className="mb-2 h-5 w-5 text-sky-300" />
              <span className="text-sm font-medium text-zinc-100">{jsonFileName || "Choose question JSON file"}</span>
              <span className="mt-1 text-xs text-zinc-500">JSON array with question, four options and correctAnswer.</span>
            </button>
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
            <Button onClick={saveJsonExercise}>Validate & save exercise</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
