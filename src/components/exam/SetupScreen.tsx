import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  getExercise,
  addSubject,
  DEFAULT_EXERCISE,
  DEFAULT_MARKING,
  formatMarking,
  loadMarking,
  loadSubjects,
  saveMarking,
  type MarkingScheme,
  type McqQuestion,
  type Option,
  type Subject,
} from "@/lib/exam";

export type TestConfig = {
  minutes: number;
  startNumber: number;
  subject: string;
  chapter: string;
  exercise: string;
  marking: MarkingScheme;
  questionCount: number | null;
  maxQuestions: number | null;
  answerKey: (Option | null)[] | null;
  questions: McqQuestion[] | null;
  questionNumbers: number[] | null;
  darkMode: boolean | null;
};

const PRESETS = [15, 30, 45, 60];
const MAX_DURATION_MINUTES = 300;
const GPT_QUESTION_PROMPT = `Create SSC-style MCQ questions for this chapter. Return ONLY a valid JSON array—no markdown, notes, or extra text. Every item must have: question (string), options (array of exactly 4 strings), correctAnswer (0 for first option through 3 for fourth), and optional explanation (string).`;

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
      number: index + 1,
      question: q["question"].trim(),
      options: [
        options[0] as string,
        options[1] as string,
        options[2] as string,
        options[3] as string,
      ],
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
  const [exercise, setExercise] = useState(prefill?.exercise ?? "");
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
  const [promptCopied, setPromptCopied] = useState(false);

  const [minutes, setMinutes] = useState(
    String(Math.min(MAX_DURATION_MINUTES, prefill?.minutes ?? 30)),
  );
  const [startNumber, setStartNumber] = useState(String(prefill?.startNumber ?? 1));
  const [countMode, setCountMode] = useState<"unlimited" | "fixed">(
    prefill?.questionCount ? "fixed" : "unlimited",
  );
  const [questionCount, setQuestionCount] = useState(String(prefill?.questionCount ?? 50));

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

  const chapters = subjects.find((s) => s.name === subject)?.chapters ?? [];
  const exercises = chapters.find((c) => c.name === chapter)?.exercises ?? [];
  const activeExercise = chapter ? getExercise(subject, chapter, exercise || null) : null;
  const activeExerciseName = activeExercise?.name ?? exercise;
  const isJsonExercise = Boolean(activeExercise?.questions?.length);
  const parsedStart = Math.max(1, Number(startNumber) || 1);
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
    (countMode === "unlimited" || Number(questionCount) >= 1);

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
    const ex = getExercise(subject, name, exerciseName ?? null);
    setExercise(ex?.name ?? "");
    if (ex?.questions?.length) {
      setCountMode("fixed");
      setQuestionCount(String(ex.questions.length));
      setStartNumber("1");
    } else if (ex?.questionCount) {
      setCountMode("fixed");
      setQuestionCount(String(ex.questionCount));
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
    }
  };

  const createChapter = () => {
    const name = newChapter.trim();
    if (!name || !subject) return;
    setChapterDraft(name);
    setDraftExercise(DEFAULT_EXERCISE);
    setDraftStep("count");
    setDraftCount("50");
    setDraftKey(null);
    setIsEditing(false);
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
    setPromptCopied(false);
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
    <div className="card-surface space-y-3.5 p-3.5 sm:p-4">
      {/* Subject & chapter */}
      <section className="space-y-1.5">
        <Label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Topic
        </Label>
        <div className="grid gap-2.5 sm:grid-cols-2">
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
            {answerKeyExercises.length > 0 && (
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
            )}
            <div className={answerKeyExercises.length > 0 ? "mt-3" : ""}>
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Question-based exercises
              </p>
              <div className="flex flex-wrap gap-1.5">
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
            <button
              type="button"
              onClick={editChapter}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {isJsonExercise ? "Edit questions of" : "Edit questions & answer key of"} “
              {activeExerciseName || chapter}”
            </button>
            {isJsonExercise && (
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
        <div className="grid gap-2.5 sm:grid-cols-2">
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

          <div className="space-y-1.5">
            <Input
              inputMode="numeric"
              min={1}
              max={maxStartNumber ?? undefined}
              value={startNumber}
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
                    : String(Math.max(1, Math.min(Number(current) || 1, Math.min(500, nextAvailable))),
                );
              }}
              placeholder="Start question no. e.g. 151"
            />
            <p
              className={cn("text-xs", startTooHigh ? "text-destructive" : "text-muted-foreground")}
            >
              {startTooHigh
                ? `This chapter has only ${chapterTotal} questions.`
                : `Numbering begins at Q${parsedStart}.` +
                  (chapterTotal ? ` Chapter total ${chapterTotal}.` : "")}
            </p>
          </div>
        </div>
      </section>

      {/* Number of questions */}
      <section className="space-y-1.5">
        <Label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Questions
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={countMode === "unlimited" ? "default" : "outline"}
            onClick={() => setCountMode("unlimited")}
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
        </div>
        {countMode === "fixed" ? (
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
              {isJsonExercise
                ? `This JSON exercise contains ${activeExercise?.questions?.length ?? 0} questions.`
                : countTooHigh
                  ? `Only ${available} questions remain (Q${parsedStart}–Q${chapterTotal}).`
                  : `Q${parsedStart}–${parsedStart + parsedCount - 1}.`}
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
        onClick={() =>
          onStart({
            minutes: parsedMinutes,
            startNumber: parsedStart,
            subject,
            chapter,
            exercise: activeExerciseName || DEFAULT_EXERCISE,
            marking,
            questionCount: countMode === "fixed" ? parsedCount : null,
            maxQuestions: available,
            answerKey: (() => {
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
            questions: isJsonExercise
              ? countMode === "fixed"
                ? (jsonAvailable ?? []).slice(0, parsedCount)
                : (jsonAvailable ?? [])
              : null,
            questionNumbers: isJsonExercise
              ? (countMode === "fixed"
                  ? (jsonAvailable ?? []).slice(0, parsedCount)
                  : (jsonAvailable ?? [])
                ).map((_, index) => parsedStart + index)
              : null,
            darkMode: null,
          })
        }
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
              <Label htmlFor="draft-exercise" className="text-xs text-muted-foreground">
                Exercise name
              </Label>
              <Input
                id="draft-exercise"
                value={draftExercise}
                onChange={(e) => setDraftExercise(e.target.value)}
                placeholder="e.g. Exercise 1"
                disabled={isEditing}
              />
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
                  disabled={Number(draftCount) < 1 || !draftExercise.trim()}
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1.5 text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(GPT_QUESTION_PROMPT);
                setPromptCopied(true);
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              {promptCopied ? "Copied" : "Copy GPT prompt"}
            </Button>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={jsonExerciseName}
              onChange={(e) => setJsonExerciseName(e.target.value)}
              placeholder="Exercise name e.g. Practice Set 1"
            />
            <Textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError("");
              }}
              className="min-h-72 font-mono text-xs"
              placeholder={
                '[\n  {\n    "question": "25% of 240 is?",\n    "options": ["40", "50", "60", "80"],\n    "correctAnswer": 2,\n    "explanation": "25% × 240 = 60"\n  }\n]'
              }
            />
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
            <Button onClick={saveJsonExercise}>Validate & save exercise</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
