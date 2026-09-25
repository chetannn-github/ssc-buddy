import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
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
import { loadSubjects, type Exercise, type Subject } from "@/lib/exam";

export const Route = createFileRoute("/question-bank")({ component: QuestionBank });

type QuestionExercise = { subject: Subject; chapter: string; exercise: Exercise };

function QuestionBank() {
  const [subjects] = useState(() => loadSubjects());
  const [subjectName, setSubjectName] = useState("all");
  const [chapterName, setChapterName] = useState("all");

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

  return (
    <AppShell title="Question bank">
      <div className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.18em] text-zinc-500 uppercase">
                Practice session
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Question bank</h2>
              <p className="mt-1 text-sm text-zinc-400">Browse saved question-based exercises.</p>
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
              <SelectTrigger className="w-52 border-white/15 bg-[#171717] text-zinc-100">
                <SelectValue placeholder="All subjects" />
              </SelectTrigger>
              <SelectContent className="border-white/15 bg-[#171717] text-zinc-100">
                <SelectItem value="all">All subjects</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject.name} value={subject.name}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={chapterName} onValueChange={setChapterName}>
              <SelectTrigger className="w-56 border-white/15 bg-[#171717] text-zinc-100">
                <SelectValue placeholder="All chapters" />
              </SelectTrigger>
              <SelectContent className="border-white/15 bg-[#171717] text-zinc-100">
                <SelectItem value="all">All chapters</SelectItem>
                {[...new Set(chapters.map(({ chapter }) => chapter.name))].map((chapter) => (
                  <SelectItem key={chapter} value={chapter}>
                    {chapter}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {exercises.length ? (
            <div className="mt-5 space-y-3">
              {exercises.map((entry) => (
                <article
                  key={exerciseId(entry)}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-[#1b1b1b] p-4"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/5 text-zinc-300">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{entry.exercise.name}</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      {entry.subject.name} · {entry.chapter} ·{" "}
                      {entry.exercise.questions?.length ?? 0} questions
                    </p>
                  </div>
                  <Button asChild>
                    <Link
                      to="/question-view"
                      search={{
                        subject: entry.subject.name,
                        chapter: entry.chapter,
                        exercise: entry.exercise.name,
                      }}
                    >
                      View questions
                    </Link>
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
              <BookOpen className="mx-auto h-7 w-7 text-zinc-600" />
              <p className="mt-3 font-medium text-zinc-200">No saved question-based exercises</p>
              <p className="mt-1 text-sm text-zinc-500">
                Try another subject or chapter, or add an exercise from Practice Session.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function exerciseId(entry: QuestionExercise) {
  return `${entry.subject.name}::${entry.chapter}::${entry.exercise.name}`;
}
