import { useState } from "react";
import { useTracker } from "@/lib/tracker-store";
import { pct, testsDone, todayISO, uid, type MockKind } from "@/lib/tracker";
import { Bar, Card, GhostButton, IconButton, Label, Num, TrashIcon } from "./ui";

function AddTestForm({ onDone }: { onDone: () => void }) {
  const { data, update } = useTracker();
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id ?? "");
  const [type, setType] = useState("Sectional");
  const [date, setDate] = useState(todayISO());
  const [score, setScore] = useState("");
  const [total, setTotal] = useState("");
  const [accuracy, setAccuracy] = useState("");
  const [notes, setNotes] = useState("");

  const field =
    "h-9 w-full rounded-full bg-track px-4 font-mono text-[13px] text-foreground outline-none focus:ring-2 focus:ring-accent-blue/40";

  return (
    <Card>
      <Label>Add test</Label>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!subjectId) return;
          update((d) => {
            d.tests.log.unshift({
              id: uid(),
              date,
              subjectId,
              type: type.trim() || "Sectional",
              score: score === "" ? null : Number(score),
              total: total === "" ? null : Number(total),
              accuracy: accuracy === "" ? null : Number(accuracy),
              notes: notes.trim(),
            });
          });
          onDone();
        }}
      >
        <select
          aria-label="Subject"
          className={field}
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Test type"
          className={field}
          placeholder="Test type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <input
          aria-label="Date"
          type="date"
          className={field}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          aria-label="Score"
          className={field}
          placeholder="Score"
          inputMode="decimal"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
        <input
          aria-label="Total marks"
          className={field}
          placeholder="Total marks"
          inputMode="decimal"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
        <input
          aria-label="Accuracy"
          className={field}
          placeholder="Accuracy % (optional)"
          inputMode="decimal"
          value={accuracy}
          onChange={(e) => setAccuracy(e.target.value)}
        />
        <input
          aria-label="Notes"
          className={`${field} sm:col-span-2`}
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-2">
          <GhostButton type="submit" tone="blue" className="flex-1">
            Save test
          </GhostButton>
          <GhostButton onClick={onDone} className="flex-1">
            Cancel
          </GhostButton>
        </div>
      </form>
    </Card>
  );
}

export function Tests() {
  const { data, update } = useTracker();
  const [adding, setAdding] = useState(false);
  const totalDone = data.tests.log.length;
  const totalTarget = data.subjects.reduce((a, s) => a + (data.tests.targets[s.id] ?? 0), 0);

  const setMock = (kind: MockKind, key: "done" | "target", n: number) =>
    update((d) => {
      d.tests.mocks[kind][key] = Math.max(0, n);
    });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label>Sectional tests</Label>
          <span className="font-mono text-[13px] text-muted-foreground">
            {totalDone} / {totalTarget} total
          </span>
        </div>
        <div className="mt-3">
          {data.subjects.map((s) => {
            const done = testsDone(data, s.id);
            const target = data.tests.targets[s.id] ?? 0;
            return (
              <div key={s.id} className="flex items-center gap-3 py-2 sm:gap-5">
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
      </Card>

      <Card>
        <Label>Full mocks</Label>
        <div className="mt-3">
          {(["pre", "mains"] as MockKind[]).map((kind) => {
            const m = data.tests.mocks[kind];
            return (
              <div key={kind} className="flex items-center gap-3 py-2 sm:gap-5">
                <div className="w-24 shrink-0 text-[15px] sm:w-32">
                  {kind === "pre" ? "Pre" : "Mains"}
                </div>
                <div className="min-w-0 flex-1">
                  <Bar value={pct(m.done, m.target)} tone="green" />
                </div>
                <span className="shrink-0 font-mono text-[13px] text-muted-foreground">
                  {m.done} / {m.target}
                </span>
                <IconButton label={`Decrease ${kind} mocks`} onClick={() => setMock(kind, "done", m.done - 1)}>
                  <span className="text-base leading-none">−</span>
                </IconButton>
                <Num
                  ariaLabel={`${kind} mocks done`}
                  value={m.done}
                  onChange={(n) => setMock(kind, "done", n)}
                />
                <IconButton
                  label={`Increase ${kind} mocks`}
                  variant="solid"
                  onClick={() => setMock(kind, "done", m.done + 1)}
                >
                  <span className="text-base leading-none">+</span>
                </IconButton>
                <Num
                  ariaLabel={`${kind} mocks target`}
                  value={m.target}
                  onChange={(n) => setMock(kind, "target", n)}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {adding ? (
        <AddTestForm onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-2xl border border-dashed border-border py-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          + Add test
        </button>
      )}

      <Card>
        <Label>Test log</Label>
        <div className="mt-3 overflow-x-auto">
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
