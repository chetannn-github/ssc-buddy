import { useState } from "react";
import { useTracker } from "@/lib/tracker-store";
import {
  chapterStatus,
  overallSyllabus,
  pct,
  recordActivity,
  subjectSyllabus,
  uid,
  type Chapter,
} from "@/lib/tracker";
import { Bar, Card, ChevronIcon, GhostButton, IconButton, Num, PencilIcon, TrashIcon } from "./ui";

function ChapterRow({ subjectId, chapter }: { subjectId: string; chapter: Chapter }) {
  const { update } = useTracker();
  const status = chapterStatus(chapter);

  const setCompleted = (n: number) =>
    update((d) => {
      const c = d.subjects
        .find((s) => s.id === subjectId)
        ?.chapters.find((x) => x.id === chapter.id);
      if (!c) return;
      const next = Math.max(0, Math.min(n, c.total));
      recordActivity(d, "lecture", next - c.completed);
      c.completed = next;
    });

  const editChapter = () => {
    const name = window.prompt("Chapter name", chapter.name);
    if (name === null) return;
    const total = window.prompt("Total lectures / questions", String(chapter.total));
    if (total === null) return;
    update((d) => {
      const c = d.subjects
        .find((s) => s.id === subjectId)
        ?.chapters.find((x) => x.id === chapter.id);
      if (!c) return;
      c.name = name.trim() || c.name;
      c.total = Math.max(0, Number(total) || 0);
      c.completed = Math.min(c.completed, c.total);
    });
  };

  const removeChapter = () => {
    if (!window.confirm(`Delete chapter "${chapter.name}"?`)) return;
    update((d) => {
      const s = d.subjects.find((x) => x.id === subjectId);
      if (s) s.chapters = s.chapters.filter((c) => c.id !== chapter.id);
    });
  };

  return (
    <div className="border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[10rem] flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[15px]">{chapter.name}</span>
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
              {status}
            </span>
          </div>
          <div className="mt-2 max-w-md">
            <Bar value={pct(chapter.completed, chapter.total)} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-16 text-right font-mono text-[13px] text-muted-foreground">
            {chapter.completed} / {chapter.total}
          </span>
          <span className="w-10 text-right font-mono text-[13px] text-muted-foreground">
            {pct(chapter.completed, chapter.total)}%
          </span>
          <IconButton label="Decrease" onClick={() => setCompleted(chapter.completed - 1)}>
            <span className="text-base leading-none">−</span>
          </IconButton>
          <Num
            ariaLabel={`Completed for ${chapter.name}`}
            value={chapter.completed}
            onChange={setCompleted}
          />
          <IconButton
            label="Increase"
            variant="solid"
            onClick={() => setCompleted(chapter.completed + 1)}
          >
            <span className="text-base leading-none">+</span>
          </IconButton>
          <IconButton label="Edit chapter" onClick={editChapter}>
            <PencilIcon />
          </IconButton>
          <IconButton label="Delete chapter" onClick={removeChapter}>
            <TrashIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function Syllabus() {
  const { data, update } = useTracker();
  const overall = overallSyllabus(data);
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({
    [data.subjects[0]?.id ?? ""]: true,
  }));

  const addSubject = () => {
    const name = window.prompt("Subject name");
    if (!name?.trim()) return;
    const id = uid();
    update((d) => {
      d.subjects.push({ id, name: name.trim(), chapters: [] });
      d.revision[id] = {
        types: [
          { id: uid(), name: "Teacher Questions", target: 5 },
          { id: uid(), name: "Concept Notes", target: 5 },
        ],
        done: {},
        targets: {},
      };
      d.tests.targets[id] = 50;
    });
    setOpen((o) => ({ ...o, [id]: true }));
  };

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
      </Card>

      {data.subjects.map((s) => {
        const x = subjectSyllabus(s);
        const isOpen = !!open[s.id];
        return (
          <Card key={s.id}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-muted-foreground">
                  <ChevronIcon open={isOpen} />
                </span>
                <span className="text-lg font-semibold">{s.name}</span>
                <span className="font-mono text-[13px] text-muted-foreground">
                  {x.done} / {x.total} · {pct(x.done, x.total)}%
                </span>
              </button>
              <IconButton
                label="Rename subject"
                onClick={() => {
                  const name = window.prompt("Subject name", s.name);
                  if (!name?.trim()) return;
                  update((d) => {
                    const t = d.subjects.find((y) => y.id === s.id);
                    if (t) t.name = name.trim();
                  });
                }}
              >
                <PencilIcon />
              </IconButton>
              <IconButton
                label="Delete subject"
                onClick={() => {
                  if (!window.confirm(`Delete subject "${s.name}" and all its chapters?`)) return;
                  update((d) => {
                    d.subjects = d.subjects.filter((y) => y.id !== s.id);
                    delete d.revision[s.id];
                    delete d.tests.targets[s.id];
                    d.tests.log = d.tests.log.filter((t) => t.subjectId !== s.id);
                  });
                }}
              >
                <TrashIcon />
              </IconButton>
            </div>
            <div className="mt-3">
              <Bar value={pct(x.done, x.total)} />
            </div>

            {isOpen && (
              <>
                <div className="mt-4 flex justify-end">
                  <GhostButton
                    tone="blue"
                    onClick={() => {
                      const name = window.prompt("Chapter name");
                      if (!name?.trim()) return;
                      const total = window.prompt("Total lectures / questions", "10");
                      update((d) => {
                        d.subjects
                          .find((y) => y.id === s.id)
                          ?.chapters.push({
                            id: uid(),
                            name: name.trim(),
                            total: Math.max(0, Number(total) || 0),
                            completed: 0,
                          });
                      });
                    }}
                  >
                    + Chapter
                  </GhostButton>
                </div>
                <div className="mt-2">
                  {s.chapters.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No chapters yet.</p>
                  ) : (
                    s.chapters.map((c) => <ChapterRow key={c.id} subjectId={s.id} chapter={c} />)
                  )}
                </div>
              </>
            )}
          </Card>
        );
      })}

      <button
        type="button"
        onClick={addSubject}
        className="w-full rounded-2xl border border-dashed border-border py-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        + Add subject
      </button>
    </div>
  );
}
