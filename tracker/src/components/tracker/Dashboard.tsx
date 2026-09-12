import { useTracker } from "@/lib/tracker-store";
import {
  daysLeft,
  overallSyllabus,
  pct,
  subjectRevision,
  subjectSyllabus,
  testsDone,
  todayISO,
} from "@/lib/tracker";
import { Bar, Card, Label } from "./ui";

function TodayCard({
  lectures,
  revisions,
  tests,
}: {
  lectures: number;
  revisions: number;
  tests: number;
}) {
  const dateLabel = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  const items = [
    { n: lectures, label: "Lectures" },
    { n: revisions, label: "Revisions" },
    { n: tests, label: "Mock tests" },
  ];
  return (
    <section
      className="rounded-2xl px-4 py-4 sm:px-6 sm:py-5"
      style={{ backgroundColor: "#2d2a26" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.18em] text-[#8a867e] uppercase">
          Today's Progress
        </span>
        <span className="font-mono text-[11px] tracking-[0.18em] text-[#8a867e] uppercase">
          {dateLabel}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-center text-center">
            <span
              className="font-mono text-3xl leading-none sm:text-4xl"
              style={{ color: "#fcf8ec" }}
            >
              {it.n}
            </span>
            <span className="mt-2 font-mono text-[11px] tracking-[0.18em] text-[#8a867e] uppercase">
              {it.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Row({
  name,
  done,
  total,
  tone,
  right,
}: {
  name: string;
  done: number;
  total: number;
  tone?: "blue" | "green" | undefined;
  right?: string | undefined;
}) {
  return (
    <div className="flex items-center gap-3 py-2 sm:gap-5">
      <div className="w-24 shrink-0 text-[15px] sm:w-32">{name}</div>
      <div className="min-w-0 flex-1">
        <Bar value={pct(done, total)} tone={tone} />
      </div>
      <div className="shrink-0 font-mono text-[13px] text-muted-foreground">
        {right ?? `${done}/${total} · ${pct(done, total)}%`}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data } = useTracker();
  const overall = overallSyllabus(data);
  const left = daysLeft(data.meta.syllabusDeadline);
  const today = todayISO();
  const testsToday = data.tests.log.filter((t) => t.date === today);
  const totalTests = data.tests.log.length;
  const totalTestTarget = data.subjects.reduce((a, s) => a + (data.tests.targets[s.id] ?? 0), 0);
  const mockDone = data.tests.mocks.pre.done + data.tests.mocks.mains.done;
  const mockTarget = data.tests.mocks.pre.target + data.tests.mocks.mains.target;

  const revRemaining = (() => {
    let rem = 0;
    for (const s of data.subjects) {
      const x = subjectRevision(data, s);
      rem += Math.max(0, x.total - x.done);
    }
    return rem;
  })();

  return (
    <div className="space-y-4">
      <TodayCard
        lectures={overall.total - overall.done}
        revisions={revRemaining}
        tests={testsToday.length}
      />
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Overall syllabus</h2>
          <span className="font-mono text-[13px] text-muted-foreground">
            {overall.done} / {overall.total} · {pct(overall.done, overall.total)}%
          </span>
        </div>
        <div className="mt-3">
          <Bar value={pct(overall.done, overall.total)} />
        </div>
        <p className="mt-3 font-mono text-[13px] text-muted-foreground">
          {left >= 0
            ? `${left} days left to finish the syllabus`
            : `syllabus deadline passed ${Math.abs(left)} days ago`}
        </p>
      </Card>

      <Card>
        <Label>Syllabus by subject</Label>
        <div className="mt-3">
          {data.subjects.map((s) => {
            const x = subjectSyllabus(s);
            return <Row key={s.id} name={s.name} done={x.done} total={x.total} />;
          })}
        </div>
      </Card>

      <Card>
        <Label>Revision by subject</Label>
        <div className="mt-3">
          {data.subjects.map((s) => {
            const x = subjectRevision(data, s);
            return <Row key={s.id} name={s.name} done={x.done} total={x.total} tone="green" />;
          })}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label>Mock tests</Label>
          <span className="font-mono text-[13px] text-muted-foreground">
            {totalTests} / {totalTestTarget} total
          </span>
        </div>
        <div className="mt-3">
          {data.subjects.map((s) => {
            const done = testsDone(data, s.id);
            const target = data.tests.targets[s.id] ?? 0;
            return (
              <Row
                key={s.id}
                name={s.name}
                done={done}
                total={target}
                right={`${done} / ${target}`}
              />
            );
          })}
          <div className="mt-2 border-t border-border pt-2">
            <Row
              name="Full mocks"
              done={mockDone}
              total={mockTarget}
              right={`${mockDone} / ${mockTarget}`}
            />
          </div>
        </div>
      </Card>

      <Card>
        <Label>Today's progress</Label>
        <div className="mt-3 grid gap-3 font-mono text-[13px] text-muted-foreground sm:grid-cols-3">
          <div>
            <div className="text-2xl text-foreground">{testsToday.length}</div>
            tests today
          </div>
          <div>
            <div className="text-2xl text-foreground">{overall.total - overall.done}</div>
            lectures/questions pending
          </div>
          <div>
            <div className="text-2xl text-foreground">{left}</div>
            days to syllabus deadline
          </div>
        </div>
        {testsToday.length > 0 && (
          <ul className="mt-4 space-y-1 font-mono text-[13px] text-muted-foreground">
            {testsToday.map((t) => (
              <li key={t.id}>
                {data.subjects.find((s) => s.id === t.subjectId)?.name ?? "—"} · {t.type} ·{" "}
                {t.score ?? "—"}/{t.total ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
