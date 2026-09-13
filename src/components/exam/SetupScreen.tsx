import { useEffect, useState } from "react";
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
  getExercise,
  addSubject,
  DEFAULT_EXERCISE,
  DEFAULT_MARKING,
  formatMarking,
  loadMarking,
  loadSubjects,
  saveMarking,
  type MarkingScheme,
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
  darkMode: boolean | null;
};

const PRESETS = [15, 30, 45, 60];
const MAX_DURATION_MINUTES = 300;

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
  const chapterTotal = activeExercise?.questionCount ?? null;
  const parsedMinutes = Math.min(MAX_DURATION_MINUTES, Math.max(1, Number(minutes) || 0));
  const parsedStart = Math.max(1, Number(startNumber) || 1);
  const available = chapterTotal ? chapterTotal - parsedStart + 1 : null;
  const startTooHigh = chapterTotal !== null && parsedStart > chapterTotal;
  const parsedCount = Math.min(
    available ?? 500,
    Math.min(500, Math.max(1, Number(questionCount) || 0)),
  );
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
    if (ex?.questionCount) {
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
    if (firstExercise?.questionCount) {
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
    <div className="card-surface space-y-5 p-5 sm:p-6">
      {/* Subject & chapter */}
      <section className="space-y-2">
        <Label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Topic
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="space-y-1.5 rounded-lg border border-border bg-background/50 p-2.5">
            <Label className="text-xs text-muted-foreground">Exercise</Label>
            <div className="flex flex-wrap gap-2">
              {exercises.map((ex) => (
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
                + Add exercise
              </Button>
            </div>
            <button
              type="button"
              onClick={editChapter}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Edit questions & answer key of “{activeExerciseName || chapter}”
            </button>
          </div>
        )}
      </section>

      {/* Duration & start number */}
      <section className="space-y-2">
        <Label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Timing
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
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
              value={startNumber}
              onChange={(e) => setStartNumber(e.target.value.replace(/\D/g, ""))}
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
      <section className="space-y-2">
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
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 50"
              className="sm:max-w-[200px]"
            />
            <p
              className={cn("text-xs", countTooHigh ? "text-destructive" : "text-muted-foreground")}
            >
              {countTooHigh
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
      <section className="space-y-1.5 border-t border-border pt-3">
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
              const full = activeExercise?.answerKey ?? null;
              if (!full) return null;
              const len = countMode === "fixed" ? parsedCount : (available ?? full.length);
              return full.slice(parsedStart - 1, parsedStart - 1 + len);
            })(),
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
    </div>
  );
}
