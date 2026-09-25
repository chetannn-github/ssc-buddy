import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
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

export const Route = createFileRoute("/question-bank")({ component: QuestionBank });

type QuestionExercise = { subject: Subject; chapter: string; exercise: Exercise };

function QuestionBank() {
  const [subjects] = useState(() => loadSubjects());
  const [subjectName, setSubjectName] = useState("all");
  const [chapterName, setChapterName] = useState("all");
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const chapters = useMemo(
    () =>
      subjectName === "all"
        ? subjects.flatMap((subject) => subject.chapters.map((chapter) => ({ subject, chapter })))
        : (subjects.find((subject) => subject.name === subjectName)?.chapters ?? []).map(
            (chapter) => ({
              subject: subjects.find((item) => item.name === subjectName)!,
              chapter,
            }),
          ),
    [subjectName, subjects],
  );
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

  return (
    <AppShell title="Question bank">
      <div className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Practice session
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Question-based exercises</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Browse saved questions, answers, and explanations by subject and chapter.
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
            <Select
              value={subjectName}
              onValueChange={(value) => {
                setSubjectName(value);
                setChapterName("all");
              }}
            >
              <SelectTrigger className="w-48 border-white/15 bg-[#171717] text-zinc-100">
                <SelectValue placeholder="All subjects" />
              </SelectTrigger>
              <SelectContent className="border-white/15 bg-[#171717] text-zinc-100">
                <SelectItem value="all" className="focus:bg-white/10 focus:text-white">
                  All subjects
                </SelectItem>
                {subjects.map((subject) => (
                  <SelectItem
                    key={subject.name}
                    value={subject.name}
                    className="focus:bg-white/10 focus:text-white"
                  >
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={chapterName} onValueChange={setChapterName}>
              <SelectTrigger className="w-52 border-white/15 bg-[#171717] text-zinc-100">
                <SelectValue placeholder="All chapters" />
              </SelectTrigger>
              <SelectContent className="border-white/15 bg-[#171717] text-zinc-100">
                <SelectItem value="all" className="focus:bg-white/10 focus:text-white">
                  All chapters
                </SelectItem>
                {[...new Set(chapters.map(({ chapter }) => chapter.name))].map((chapter) => (
                  <SelectItem
                    key={chapter}
                    value={chapter}
                    className="focus:bg-white/10 focus:text-white"
                  >
                    {chapter}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {exercises.length ? (
            <div className="mt-5 space-y-3">
              {exercises.map(({ subject, chapter, exercise }) => {
                const key = `${subject.name}::${chapter}::${exercise.name}`;
                const isOpen = openExercise === key;
                return (
                  <section
                    key={key}
                    className="overflow-hidden rounded-xl border border-white/10 bg-[#1b1b1b]"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenExercise(isOpen ? null : key)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-zinc-300">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {exercise.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {subject.name} · {chapter} · {exercise.questions?.length ?? 0} questions
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="space-y-3 border-t border-white/10 p-4">
                        {exercise.questions?.map((question, index) => (
                          <QuestionCard key={`${key}-${index}`} question={question} index={index} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
              <BookOpen className="mx-auto h-7 w-7 text-zinc-600" />
              <p className="mt-3 font-medium text-zinc-200">No saved question-based exercises</p>
              <p className="mt-1 text-sm text-zinc-500">
                Add a question-based exercise from Practice Session to view it here.
              </p>
              <Button className="mt-5" asChild>
                <Link to="/test">Open practice session</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function QuestionCard({ question, index }: { question: McqQuestion; index: number }) {
  const correctIndex = ["A", "B", "C", "D"].indexOf(question.correctAnswer);
  return (
    <article className="rounded-lg border border-white/10 bg-black/10 p-4">
      <p className="text-sm leading-6 text-zinc-100">
        <span className="mr-2 font-mono text-zinc-500">Q{question.number ?? index + 1}.</span>
        {question.question}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {question.options.map((option, optionIndex) => (
          <div
            key={optionIndex}
            className={`rounded-md border px-3 py-2 text-sm ${optionIndex === correctIndex ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.02] text-zinc-300"}`}
          >
            <span className="mr-2 font-mono text-xs text-zinc-500">
              {["A", "B", "C", "D"][optionIndex]}
            </span>
            {option}
            {optionIndex === correctIndex && (
              <span className="ml-2 text-xs text-emerald-400">Correct</span>
            )}
          </div>
        ))}
      </div>
      {question.explanation && (
        <p className="mt-3 rounded-md bg-white/[0.04] px-3 py-2 text-sm leading-6 text-zinc-400">
          <span className="font-medium text-zinc-200">Explanation: </span>
          {question.explanation}
        </p>
      )}
    </article>
  );
}
