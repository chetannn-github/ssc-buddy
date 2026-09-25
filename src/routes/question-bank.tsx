import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadSubjects, type Exercise, type McqQuestion, type Subject } from "@/lib/exam";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/question-bank")({ component: QuestionBank });

type QuestionExercise = { subject: Subject; chapter: string; exercise: Exercise };

function QuestionBank() {
  const [subjects] = useState(() => loadSubjects());
  const [subjectName, setSubjectName] = useState("all");
  const [chapterName, setChapterName] = useState("all");
  const [exerciseKey, setExerciseKey] = useState("");
  const [current, setCurrent] = useState(0);

  const chapters = useMemo(() => {
    if (subjectName === "all") {
      return subjects.flatMap((subject) =>
        subject.chapters.map((chapter) => ({ subject, chapter })),
      );
    }
    const subject = subjects.find((item) => item.name === subjectName);
    return (subject?.chapters ?? []).map((chapter) => ({ subject: subject!, chapter }));
  }, [subjectName, subjects]);

  const exercises = useMemo<QuestionExercise[]>(
    () =>
      chapters
        .flatMap(({ subject, chapter }) =>
          chapter.exercises
            .filter((exercise) => exercise.questions?.length)
            .map((exercise) => ({ subject, chapter: chapter.name, exercise })),
        )
        .filter((entry) => chapterName === "all" || entry.chapter === chapterName),
    [chapterName, chapters],
  );
  const selectedExercise = exercises.find((entry) => exerciseId(entry) === exerciseKey);
  const questions = selectedExercise?.exercise.questions ?? [];
  const question = questions[current];

  const resetSelection = () => {
    setExerciseKey("");
    setCurrent(0);
  };

  return (
    <AppShell title="Question bank">
      <div className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Practice session
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Question bank</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Select an exercise to review its questions and answer key.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
              asChild
            >
              <Link to="/test">Back to practice</Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 rounded-xl border border-white/10 bg-[#1b1b1b] p-3">
            <FilterSelect
              value={subjectName}
              onChange={(value) => {
                setSubjectName(value);
                setChapterName("all");
                resetSelection();
              }}
              label="All subjects"
              className="w-48"
            >
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.name} value={subject.name}>
                  {subject.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={chapterName}
              onChange={(value) => {
                setChapterName(value);
                resetSelection();
              }}
              label="All chapters"
              className="w-52"
            >
              <SelectItem value="all">All chapters</SelectItem>
              {[...new Set(chapters.map(({ chapter }) => chapter.name))].map((chapter) => (
                <SelectItem key={chapter} value={chapter}>
                  {chapter}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={exerciseKey}
              onChange={(value) => {
                setExerciseKey(value);
                setCurrent(0);
              }}
              label="Select exercise"
              className="min-w-56 flex-1"
            >
              {exercises.length === 0 ? (
                <SelectItem value="none" disabled>
                  No question-based exercise
                </SelectItem>
              ) : (
                exercises.map((entry) => (
                  <SelectItem key={exerciseId(entry)} value={exerciseId(entry)}>
                    {entry.exercise.name} · {entry.chapter}
                  </SelectItem>
                ))
              )}
            </FilterSelect>
          </div>

          {selectedExercise && question ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
              <section className="rounded-xl border border-white/10 bg-[#1b1b1b] p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <p className="text-xs text-zinc-500">
                      {selectedExercise.subject.name} · {selectedExercise.chapter} ·{" "}
                      {selectedExercise.exercise.name}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">
                      Question {question.number ?? current + 1}
                    </h3>
                  </div>
                  <span className="text-sm text-zinc-400">
                    Question {current + 1} of {questions.length}
                  </span>
                </div>
                <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                  {question.question}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(["A", "B", "C", "D"] as const).map((option, index) => (
                    <AnswerOption
                      key={option}
                      option={option}
                      text={question.options[index] ?? ""}
                      correct={option === question.correctAnswer}
                    />
                  ))}
                </div>
                {question.explanation && (
                  <div className="mt-4 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm leading-6 text-zinc-200">
                    <span className="font-semibold">Explanation: </span>
                    {question.explanation}
                  </div>
                )}
                <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                  <Button
                    variant="outline"
                    className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
                    onClick={() => setCurrent((value) => Math.max(0, value - 1))}
                    disabled={current === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}
                    disabled={current === questions.length - 1}
                  >
                    Next
                  </Button>
                </div>
              </section>
              <QuestionPalette questions={questions} current={current} onSelect={setCurrent} />
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
              <BookOpen className="mx-auto h-7 w-7 text-zinc-600" />
              <p className="mt-3 font-medium text-zinc-200">Select a question-based exercise</p>
              <p className="mt-1 text-sm text-zinc-500">
                Use the filters above to find saved questions.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  className,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("border-white/15 bg-[#171717] text-zinc-100", className)}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent className="border-white/15 bg-[#171717] text-zinc-100">
        {children}
      </SelectContent>
    </Select>
  );
}

function AnswerOption({
  option,
  text,
  correct,
}: {
  option: string;
  text: string;
  correct: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-4 py-4 text-left text-sm",
        correct
          ? "border-answered bg-answered/15 font-semibold ring-1 ring-answered/45"
          : "border-white/10 bg-black/10 text-zinc-300",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold",
          correct
            ? "border-answered bg-answered text-answered-foreground"
            : "border-white/10 text-zinc-400",
        )}
      >
        {option}
      </span>
      {text}
      {correct && (
        <span className="ml-auto rounded-full bg-answered/15 px-2 py-0.5 text-[10px] font-medium text-answered">
          Correct
        </span>
      )}
    </div>
  );
}

function QuestionPalette({
  questions,
  current,
  onSelect,
}: {
  questions: McqQuestion[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="h-fit rounded-xl border border-white/10 bg-[#1b1b1b] p-4 lg:sticky lg:top-24">
      <h3 className="text-sm font-semibold">Question palette</h3>
      <p className="mt-1 text-xs text-zinc-500">Jump to any question</p>
      <div className="mt-4 grid max-h-[420px] grid-cols-5 gap-2 overflow-y-auto pt-2 pr-1 pb-2 pl-2">
        {questions.map((question, index) => (
          <button
            key={`${question.number ?? index}-${index}`}
            type="button"
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md border text-xs font-semibold transition-all hover:scale-105",
              index === current
                ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-[#1b1b1b]"
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/10",
            )}
            onClick={() => onSelect(index)}
          >
            {question.number ?? index + 1}
          </button>
        ))}
      </div>
    </aside>
  );
}

function exerciseId(entry: QuestionExercise) {
  return `${entry.subject.name}::${entry.chapter}::${entry.exercise.name}`;
}
