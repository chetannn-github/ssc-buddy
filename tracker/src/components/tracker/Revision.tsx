import { useState } from "react";
import { useTracker } from "@/lib/tracker-store";
import { pct, revDone, revTarget, subjectRevision, uid, type Subject } from "@/lib/tracker";
import { Bar, Card, ChevronIcon, GhostButton, Num } from "./ui";

function Dots({
  done,
  target,
  onSet,
}: {
  done: number;
  target: number;
  onSet: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: Math.min(target, 30) }, (_, i) => i + 1).map((n) => {
        const filled = n <= done;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onSet(done === n ? n - 1 : n)}
            title={`Revision ${n}`}
            className={`h-6 w-6 rounded-full font-mono text-[11px] transition-colors ${
              filled
                ? "bg-accent-green text-foreground"
                : "bg-track text-muted-foreground hover:text-foreground"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function SubjectRevision({ subject }: { subject: Subject }) {
  const { data, update } = useTracker();
  const rev = data.revision[subject.id];
  const [open, setOpen] = useState(true);
  if (!rev) return null;
  const x = subjectRevision(data, subject);

  const setDone = (chapterId: string, typeId: string, n: number) =>
    update((d) => {
      const r = d.revision[subject.id];
      if (!r) return;
      r.done[chapterId] = r.done[chapterId] ?? {};
      r.done[chapterId]![typeId] = Math.max(0, n);
    });

  const setTarget = (chapterId: string, typeId: string, n: number) =>
    update((d) => {
      const r = d.revision[subject.id];
      if (!r) return;
      r.targets[chapterId] = r.targets[chapterId] ?? {};
      r.targets[chapterId]![typeId] = Math.max(0, n);
    });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="text-muted-foreground">
            <ChevronIcon open={open} />
          </span>
          <span className="text-lg font-semibold">{subject.name}</span>
          <span className="font-mono text-[13px] text-muted-foreground">
            {x.done} / {x.total} · {pct(x.done, x.total)}%
          </span>
        </button>
        <GhostButton
          tone="blue"
          onClick={() => {
            const name = window.prompt("Revision type name (e.g. Notes, Little Book)");
            if (!name?.trim()) return;
            const target = window.prompt("Revision target", "5");
            update((d) => {
              d.revision[subject.id]?.types.push({
                id: uid(),
                name: name.trim(),
                target: Math.max(1, Number(target) || 5),
              });
            });
          }}
        >
          + Revision type
        </GhostButton>
      </div>
      <div className="mt-3">
        <Bar value={pct(x.done, x.total)} tone="green" />
      </div>

      {open && (
        <div className="mt-4">
          {subject.chapters.length === 0 && (
            <p className="text-sm text-muted-foreground">Add chapters in the Syllabus tab first.</p>
          )}
          {subject.chapters.map((c) => (
            <div key={c.id} className="border-b border-border py-3 last:border-0">
              <div className="text-[15px]">{c.name}</div>
              <div className="mt-2 space-y-2">
                {rev.types.map((t) => {
                  const target = revTarget(data, subject.id, c.id, t);
                  const done = revDone(data, subject.id, c.id, t.id);
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="w-40 shrink-0 font-mono text-[13px] text-muted-foreground">
                        {t.name}
                      </span>
                      <Dots
                        done={done}
                        target={target}
                        onSet={(n) => setDone(c.id, t.id, n)}
                      />
                      <span className="ml-auto font-mono text-[13px] text-muted-foreground">
                        {Math.min(done, target)} / {target}
                      </span>
                      <Num
                        ariaLabel={`${t.name} target for ${c.name}`}
                        value={target}
                        onChange={(n) => setTarget(c.id, t.id, n)}
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${t.name}`}
                        title={`Remove ${t.name} from ${subject.name}`}
                        onClick={() => {
                          if (!window.confirm(`Remove revision type "${t.name}"?`)) return;
                          update((d) => {
                            const r = d.revision[subject.id];
                            if (!r) return;
                            r.types = r.types.filter((y) => y.id !== t.id);
                          });
                        }}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function Revision() {
  const { data } = useTracker();
  return (
    <div className="space-y-4">
      {data.subjects.map((s) => (
        <SubjectRevision key={s.id} subject={s} />
      ))}
    </div>
  );
}
