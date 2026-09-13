import { useState } from "react";
import { useTracker } from "@/lib/tracker-store";
import { pct, testsDone, todayISO, uid } from "@/lib/tracker";
import { Bar, Card, GhostButton, IconButton, Label, Num, TrashIcon } from "./ui";

function AddTestForm({ onDone }: { onDone: () => void }) {
  const { data, update } = useTracker();
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id ?? "");
  const [type, setType] = useState("Sectional");
  const [date, setDate] = useState(todayISO());
  const [score, setScore] = useState("");
  const [total, setTotal] = useState("");
  const [accuracy, setAccuracy] = useState("");
  const [error, setError] = useState("");
  const isSectional = type === "Sectional";

  const field =
    "h-9 w-full rounded-full bg-track px-4 font-mono text-[13px] text-foreground outline-none focus:ring-2 focus:ring-accent-blue/40";

  return (
    <Card className="!p-2.5 sm:!p-3">
      <Label>Add test</Label>
      <form
        className="mt-2 grid gap-2 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const numericScore = Number(score);
          const numericTotal = Number(total);
          const numericAccuracy = Number(accuracy);
          if (!date || (isSectional && !subjectId) || !score || !total || !accuracy) {
            setError("Fill all required fields.");
            return;
          }
          if (
            !Number.isFinite(numericScore) ||
            !Number.isFinite(numericTotal) ||
            !Number.isFinite(numericAccuracy) ||
            numericTotal <= 0 ||
            numericScore < 0 ||
            numericScore > numericTotal ||
            numericAccuracy < 0 ||
            numericAccuracy > 100
          ) {
            setError("Score must be within total marks, and accuracy must be between 0% and 100%.");
            return;
          }
          update((d) => {
            d.tests.log.unshift({
              id: uid(),
              date,
              createdAt: new Date().toISOString(),
              subjectId: isSectional ? subjectId : "__all__",
              type,
              score: numericScore,
              total: numericTotal,
              accuracy: numericAccuracy,
              notes: "",
            });
          });
          onDone();
        }}
      >
        <select
          aria-label="Test type"
          className={field}
          value={type}
          onChange={(e) => {
            const nextType = e.target.value;
            setType(nextType);
            if (nextType === "Sectional") setSubjectId(data.subjects[0]?.id ?? "");
          }}
        >
          <option>Sectional</option>
          <option>Pre</option>
          <option>Mains</option>
        </select>
        <select
          aria-label="Subject"
          className={`${field} disabled:cursor-not-allowed disabled:opacity-40`}
          value={isSectional ? subjectId : "__all__"}
          onChange={(e) => setSubjectId(e.target.value)}
          disabled={!isSectional}
          required={isSectional}
        >
          {!isSectional && <option value="__all__">All subjects</option>}
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Date"
          type="date"
          className={field}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <input
          aria-label="Score"
          className={field}
          placeholder="Score"
          inputMode="decimal"
          type="number"
          min="0"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          required
        />
        <input
          aria-label="Total marks"
          className={field}
          placeholder="Total marks"
          inputMode="decimal"
          type="number"
          min="1"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          required
        />
        <input
          aria-label="Accuracy"
          className={field}
          placeholder="Accuracy %"
          inputMode="decimal"
          type="number"
          min="0"
          max="100"
          value={accuracy}
          onChange={(e) => setAccuracy(e.target.value)}
          required
        />
        <div className="flex gap-2 sm:col-span-3">
          <GhostButton type="submit" tone="blue" className="flex-1">
            Save test
          </GhostButton>
          <GhostButton onClick={onDone} className="flex-1">
            Cancel
          </GhostButton>
        </div>
        {error && <p className="sm:col-span-3 text-sm text-destructive">{error}</p>}
      </form>
    </Card>
  );
}

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

      {adding ? (
        <AddTestForm onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          + Add test
        </button>
      )}

      <Card className="!p-2.5 sm:!p-3">
        <Label>Test log</Label>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left">
            <thead>
              <tr className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                <th className="py-2 font-normal">Date</th>
                <th className="py-2 font-normal">Subject</th>
                <th className="py-2 font-normal">Type</th>
                <th className="py-2 font-normal">Score</th>
                <th className="py-2 font-normal">Acc.</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.tests.log.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-sm text-muted-foreground">
                    No tests recorded yet.
                  </td>
                </tr>
              ) : (
                data.tests.log.map((t) => (
                  <tr key={t.id} className="border-t border-border font-mono text-[13px]">
                    <td className="py-2">{t.date}</td>
                    <td className="py-2">
                      {data.subjects.find((s) => s.id === t.subjectId)?.name ?? "—"}
                    </td>
                    <td className="py-2">{t.type}</td>
                    <td className="py-2">
                      {t.score ?? "—"} / {t.total ?? "—"}
                    </td>
                    <td className="py-2">{t.accuracy != null ? `${t.accuracy}%` : "—"}</td>
                    <td className="py-2 text-right">
                      <IconButton
                        label="Delete test"
                        onClick={() =>
                          update((d) => {
                            d.tests.log = d.tests.log.filter((x) => x.id !== t.id);
                          })
                        }
                      >
                        <TrashIcon />
                      </IconButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
