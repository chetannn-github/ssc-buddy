import { ArrowLeft, CheckCircle2, Clock3, ListChecks, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMarking, type MarkingScheme } from "@/lib/exam";

type Props = {
  subject: string;
  chapter: string;
  exercise: string;
  minutes: number;
  questionCount: number | null;
  marking: MarkingScheme;
  onBack: () => void;
  onStart: () => void;
};

export function InstructionsScreen({
  subject,
  chapter,
  exercise,
  minutes,
  questionCount,
  marking,
  onBack,
  onStart,
}: Props) {
  const testTitle = [subject, chapter, exercise].filter(Boolean).join(" · ");

  return (
    <div className="card-surface mx-auto max-w-3xl overflow-hidden">
      <div className="border-b border-border px-6 py-5 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Before you begin
        </p>
        <h2 className="mt-1 text-2xl font-semibold">Test instructions</h2>
        <p className="mt-1 text-sm text-muted-foreground">{testTitle}</p>
      </div>

      <div className="grid gap-3 border-b border-border bg-muted/35 p-4 sm:grid-cols-3 sm:px-8">
        <div className="flex items-center gap-3 rounded-lg bg-background/70 p-3">
          <Clock3 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-sm font-semibold">{minutes} minutes</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-background/70 p-3">
          <ListChecks className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Questions</p>
            <p className="text-sm font-semibold">{questionCount ?? "Practice as needed"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-background/70 p-3">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Marking</p>
            <p className="text-sm font-semibold">{formatMarking(marking)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6 text-sm sm:px-8">
        <section>
          <h3 className="font-semibold">How this test works</h3>
          <ul className="mt-2 space-y-2 text-muted-foreground">
            <li>
              • The timer starts only after you select{" "}
              <strong className="text-foreground">Start test</strong>.
            </li>
            <li>
              • Choose one option (A, B, C, or D) for each question from your book or material.
            </li>
            <li>
              • Use the question palette to jump between questions and see answered, marked, or
              unvisited questions.
            </li>
            <li>• Your selected answer is saved while you continue through the test.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-semibold">Before submitting</h3>
          <p className="mt-2 text-muted-foreground">
            Review marked and unanswered questions from the palette. You can submit anytime; when
            time ends, the test is submitted automatically.
          </p>
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-4 sm:px-8">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to setup
        </Button>
        <Button onClick={onStart}>
          <Play className="h-4 w-4" /> Start test
        </Button>
      </div>
    </div>
  );
}
