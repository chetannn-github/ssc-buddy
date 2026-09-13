import { useState } from "react";
import { useTracker } from "@/lib/tracker-store";
import {
  pct,
  recordActivity,
  revDone,
  revTarget,
  subjectRevision,
  uid,
  type Subject,
} from "@/lib/tracker";
import { Bar, Card, ChevronIcon, GhostButton, Num } from "./ui";
import { useTrackerDialog } from "./dialog";

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

function SubjectRevision({
  subject,
  open,
  onOpenChange,
}: {
  subject: Subject;
  open: boolean;
  onOpenChange: () => void;
}) {
  const { data, update } = useTracker();
  const { confirm, openForm } = useTrackerDialog();
  const rev = data.revision[subject.id];
  if (!rev) return null;
  const x = subjectRevision(data, subject);

  const setDone = (chapterId: string, typeId: string, n: number) =>
    update((d) => {
      const r = d.revision[subject.id];
      if (!r) return;
      r.done[chapterId] = r.done[chapterId] ?? {};
      const next = Math.max(0, n);
      recordActivity(d, "revision", next - (r.done[chapterId]![typeId] ?? 0));
      r.done[chapterId]![typeId] = next;
    });

  const setTarget = (chapterId: string, typeId: string, n: number) =>
    update((d) => {
      const r = d.revision[subject.id];
      if (!r) return;
      r.targets[chapterId] = r.targets[chapterId] ?? {};
      r.targets[chapterId]![typeId] = Math.max(0, n);
    });

  return (
    <Card className="!p-2.5 sm:!p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenChange}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
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
            openForm({
              title: "Add revision type",
              fields: [
                { name: "name", label: "Revision type", placeholder: "e.g. Notes" },
                {
                  name: "target",
                  label: "Revision target",
                  type: "number",
                  min: 1,
                  defaultValue: "5",
                },
              ],
              confirmLabel: "Add type",
              onConfirm: ({ name, target }) =>
                update((d) => {
                  d.revision[subject.id]?.types.push({
                    id: uid(),
                    name: name?.trim() || "Revision",
                    target: Math.max(1, Number(target) || 5),
                  });
                }),
            });
          }}
        >
          + Revision type
        </GhostButton>
      </div>
      <div className="mt-2">
        <Bar value={pct(x.done, x.total)} tone="green" />
      </div>

      {open && (
        <div className="mt-2 space-y-1.5">
          {subject.chapters.length === 0 && (
            <p className="text-sm text-muted-foreground">Add chapters in the Syllabus tab first.</p>
          )}
          {subject.chapters.map((c) => (
            <div key={c.id} className="rounded-lg bg-white/[0.025] px-3 py-2.5">
              <div className="text-sm font-medium">{c.name}</div>
              <div className="mt-2 space-y-1.5">
                {rev.types.map((t) => {
                  const target = revTarget(data, subject.id, c.id, t);
                  const done = revDone(data, subject.id, c.id, t.id);
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="w-36 shrink-0 font-mono text-[12px] text-muted-foreground">
                        {t.name}
                      </span>
                      <Dots done={done} target={target} onSet={(n) => setDone(c.id, t.id, n)} />
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
                          confirm({
                            title: "Remove revision type?",
                            description: `“${t.name}” will be removed from ${subject.name}.`,
                            confirmLabel: "Remove type",
                            danger: true,
                            onConfirm: () =>
                              update((d) => {
                                const r = d.revision[subject.id];
                                if (!r) return;
                                r.types = r.types.filter((y) => y.id !== t.id);
                              }),
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
  const [openSubjectId, setOpenSubjectId] = useState(data.subjects[0]?.id ?? "");

  return (
    <div className="space-y-2">
      {data.subjects.map((s) => (
        <SubjectRevision
          key={s.id}
          subject={s}
          open={openSubjectId === s.id}
          onOpenChange={() => setOpenSubjectId((current) => (current === s.id ? "" : s.id))}
        />
      ))}
    </div>
  );
}
