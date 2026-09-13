import { useState } from "react";
import { useTracker } from "@/lib/tracker-store";
import { pct, testsDone } from "@/lib/tracker";
import { Bar, Card, Label, Num } from "./ui";
import { MockTestLogDialog } from "./MockTestLogDialog";

export function Tests() {
  const { data, update } = useTracker();
  const [adding, setAdding] = useState(false);
  const totalDone = data.tests.log.filter((test) => test.type === "Sectional").length;
  const totalTarget = data.subjects.reduce((a, s) => a + (data.tests.targets[s.id] ?? 0), 0);
  const fullMockTargets = [
    { key: "pre" as const, label: "Pre" },
    { key: "mains" as const, label: "Mains" },
  ];

  return (
    <div className="space-y-2">
      <Card className="!p-2.5 sm:!p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label>Sectional tests</Label>
          <span className="font-mono text-[13px] text-muted-foreground">
            {totalDone} / {totalTarget} total
          </span>
        </div>
        <div className="mt-1.5">
          {data.subjects.map((s) => {
            const done = testsDone(data, s.id);
            const target = data.tests.targets[s.id] ?? 0;
            return (
              <div key={s.id} className="flex items-center gap-2 py-1 sm:gap-3">
                <div className="w-24 shrink-0 text-[15px] sm:w-32">{s.name}</div>
                <div className="min-w-0 flex-1">
                  <Bar value={pct(done, target)} />
                </div>
                <span className="shrink-0 font-mono text-[13px] text-muted-foreground">
                  {done} / {target}
                </span>
                <Num
                  ariaLabel={`${s.name} test target`}
                  value={target}
                  onChange={(n) =>
                    update((d) => {
                      d.tests.targets[s.id] = n;
                    })
                  }
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Label>Full mock targets</Label>
          <div className="mt-1.5">
            {fullMockTargets.map(({ key, label }) => {
              const done = data.tests.log.filter((test) => test.type === label).length;
              const target = data.tests.mocks[key].target;
              return (
                <div key={key} className="flex items-center gap-2 py-1 sm:gap-3">
                  <div className="w-24 shrink-0 text-[15px] sm:w-32">{label}</div>
                  <div className="min-w-0 flex-1">
                    <Bar value={pct(done, target)} tone="green" />
                  </div>
                  <span className="shrink-0 font-mono text-[13px] text-muted-foreground">
                    {done} / {target}
                  </span>
                  <Num
                    ariaLabel={`${label} mock target`}
                    value={target}
                    onChange={(value) =>
                      update((next) => {
                        next.tests.mocks[key].target = value;
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        + Log mock test
      </button>

      <MockTestLogDialog
        open={adding}
        data={data}
        onClose={() => setAdding(false)}
        onSave={(next) => update((current) => Object.assign(current, next))}
      />
    </div>
  );
}
