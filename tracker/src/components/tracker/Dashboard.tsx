import { useTracker } from "@/lib/tracker-store";
import {
  daysLeft,
  overallSyllabus,
  pct,
  subjectRevision,
  subjectSyllabus,
  testsDone,
} from "@/lib/tracker";
import { Bar, Card, Label } from "./ui";

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
    <div className="flex items-center gap-2 py-1.5 sm:gap-3">
      <div className="w-20 shrink-0 text-sm sm:w-28">{name}</div>
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
  const left = daysLeft(data.meta.examDate);
  const totalTests = data.tests.log.length;
  const totalTestTarget = data.subjects.reduce((a, s) => a + (data.tests.targets[s.id] ?? 0), 0);
  const mockDone = data.tests.mocks.pre.done + data.tests.mocks.mains.done;
  const mockTarget = data.tests.mocks.pre.target + data.tests.mocks.mains.target;

  return (
    <div className="space-y-4">
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
            ? `${left} days left until the exam`
            : `exam date passed ${Math.abs(left)} days ago`}
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
    </div>
  );
}
