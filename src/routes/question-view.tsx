import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  deleteBankQuestion,
  loadFavoriteQuestionIds,
  loadSubjects,
  onPracticePersist,
  questionFavoriteId,
  toggleFavoriteQuestion,
  type McqQuestion,
} from "@/lib/exam";
import { cn } from "@/lib/utils";

type ViewerSearch = { subject: string; chapter: string; exercise: string };

export const Route = createFileRoute("/question-view")({
  validateSearch: (search: Record<string, unknown>): ViewerSearch => ({
    subject: typeof search["subject"] === "string" ? search["subject"] : "",
    chapter: typeof search["chapter"] === "string" ? search["chapter"] : "",
    exercise: typeof search["exercise"] === "string" ? search["exercise"] : "",
  }),
  component: QuestionViewer,
});

function QuestionViewer() {
  const { subject: subjectName, chapter: chapterName, exercise: exerciseName } = Route.useSearch();
  const [deleting, setDeleting] = useState<{ subjectId: string; exerciseId: string; questionId: string } | null>(null);
  const [currentIndex, setCurrent] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(loadFavoriteQuestionIds()));
  const [subjects, setSubjects] = useState(() => loadSubjects());
  useEffect(() => onPracticePersist((key) => {
    if (key === "cbt-subjects") setSubjects(loadSubjects());
    if (key === "cbt-favorite-questions") setFavoriteIds(new Set(loadFavoriteQuestionIds()));
  }), []);
  const subjectId = subjects.find((item) => item.name === subjectName)?.id;
  const exercise = useMemo(() => {
    const subject = subjects.find((item) => item.name === subjectName);
    const chapter = subject?.chapters.find((item) => item.name === chapterName);
    return chapter?.exercises.find((item) => item.name === exerciseName && item.questions?.length);
  }, [chapterName, exerciseName, subjectName, subjects]);
  const questions = exercise?.questions ?? [];
  const current = Math.max(0, Math.min(currentIndex, questions.length - 1));
  const question = questions[current];
  const favoriteId = question
    ? questionFavoriteId(subjectName, chapterName, exerciseName, question, current)
    : "";
  const isFavorite = favoriteIds.has(favoriteId);

  return (
    <AppShell title="Question viewer">
      <div className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        {question ? (
          <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="rounded-xl border border-white/10 bg-[#1b1b1b] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <p className="text-xs text-zinc-500">
                    {subjectName} · {chapterName} · {exerciseName}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    Question {question.number ?? current + 1}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-8 text-red-300 hover:bg-red-400/10 hover:text-red-200" onClick={() => {
                    if (subjectId && exercise && question) setDeleting({ subjectId, exerciseId: exercise.id, questionId: question.id });
                  }}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                      "h-8 border-white/15 bg-white/5 px-2.5 text-xs text-zinc-200 hover:bg-white/10 hover:text-white",
                      isFavorite && "border-amber-400/50 bg-amber-400/10 text-amber-300",
                    )}
                    onClick={() => setFavoriteIds(new Set(toggleFavoriteQuestion(favoriteId)))}
                  >
                    <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} />
                    Favourite
                  </Button>
                </div>
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
                  onClick={() => setCurrent(Math.max(0, current - 1))}
                  disabled={current === 0}
                >
                  Previous
                </Button>
                <Button
                  onClick={() => setCurrent(Math.min(questions.length - 1, current + 1))}
                  disabled={current === questions.length - 1}
                >
                  Next
                </Button>
                <Button
                  variant="ghost"
                  className="ml-auto text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                  asChild
                >
                  <Link to="/question-bank">Back to exercises</Link>
                </Button>
              </div>
            </section>
            <QuestionPalette
              questions={questions}
              current={current}
              favoriteIds={favoriteIds}
              subjectName={subjectName}
              chapterName={chapterName}
              exerciseName={exerciseName}
              onSelect={setCurrent}
            />
          </div>
        ) : (
          <div className="mx-auto max-w-lg rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
            <p className="font-medium text-zinc-200">This exercise is no longer available</p>
            <Button className="mt-5" asChild>
              <Link to="/question-bank">Back to question bank</Link>
            </Button>
          </div>
        )}
      </div>
      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent aria-describedby={undefined} className="max-w-sm border-white/10 bg-[#202020] text-zinc-100">
          <AlertDialogHeader><AlertDialogTitle>Delete question?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/15 bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 text-white hover:bg-red-600" onClick={() => {
              if (!deleting) return;
              setSubjects(deleteBankQuestion(deleting.subjectId, deleting.exerciseId, deleting.questionId));
              setDeleting(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
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
  favoriteIds,
  subjectName,
  chapterName,
  exerciseName,
  onSelect,
}: {
  questions: McqQuestion[];
  current: number;
  favoriteIds: Set<string>;
  subjectName: string;
  chapterName: string;
  exerciseName: string;
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="h-fit rounded-xl border border-white/10 bg-[#1b1b1b] p-4 lg:sticky lg:top-24">
      <h3 className="text-sm font-semibold">Question palette</h3>
      <p className="mt-1 text-xs text-zinc-500">Gold = favourite</p>
      <div className="mt-4 grid max-h-[420px] grid-cols-5 gap-2 overflow-y-auto pt-2 pr-1 pb-2 pl-2">
        {questions.map((question, index) => {
          const isFavorite = favoriteIds.has(questionFavoriteId(subjectName, chapterName, exerciseName, question, index));
          return <button
            key={`${question.number ?? index}-${index}`}
            type="button"
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-md border text-xs font-semibold transition-all hover:scale-105",
              index === current
                ? isFavorite
                  ? "border-amber-300 bg-amber-400 text-amber-950 ring-2 ring-amber-300 ring-offset-2 ring-offset-[#1b1b1b]"
                  : "border-primary bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-[#1b1b1b]"
                : isFavorite
                  ? "border-amber-400/45 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/10",
            )}
            onClick={() => onSelect(index)}
          >
            {question.number ?? index + 1}
          </button>
        })}
      </div>
    </aside>
  );
}
