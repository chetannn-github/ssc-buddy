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
import { useTrackerDialog } from "./dialog";

function ChapterRow({ subjectId, chapter }: { subjectId: string; chapter: Chapter }) {
  const { update } = useTracker();
  const { confirm, openForm } = useTrackerDialog();
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
    openForm({
      title: "Edit chapter",
      fields: [
        { name: "name", label: "Chapter name", defaultValue: chapter.name },
        {
          name: "total",
          label: "Total lectures / questions",
          type: "number",
          min: 0,
          defaultValue: String(chapter.total),
        },
      ],
      onConfirm: ({ name, total }) =>
        update((d) => {
          const c = d.subjects
            .find((s) => s.id === subjectId)
            ?.chapters.find((x) => x.id === chapter.id);
          if (!c) return;
          c.name = name?.trim() || c.name;
          c.total = Math.max(0, Number(total) || 0);
          c.completed = Math.min(c.completed, c.total);
        }),
    });
  };

  const removeChapter = () => {
    confirm({
      title: "Delete chapter?",
      description: `“${chapter.name}” and its progress will be removed.`,
      confirmLabel: "Delete chapter",
      danger: true,
      onConfirm: () =>
        update((d) => {
          const s = d.subjects.find((x) => x.id === subjectId);
          if (s) s.chapters = s.chapters.filter((c) => c.id !== chapter.id);
        }),
    });
  };

  return (
    <div className="rounded-lg bg-white/[0.025] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="min-w-[10rem] flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium">{chapter.name}</span>
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
              {status}
            </span>
          </div>
          <div className="mt-1 max-w-md">
            <Bar value={pct(chapter.completed, chapter.total)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
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
  const { confirm, openForm } = useTrackerDialog();
  const overall = overallSyllabus(data);
  const [openSubjectId, setOpenSubjectId] = useState(data.subjects[0]?.id ?? "");

  const addChapter = (subjectId: string) => {
    openForm({
      title: "Add chapter",
      fields: [
        { name: "name", label: "Chapter name", placeholder: "e.g. Number System" },
        {
          name: "total",
          label: "Total lectures / questions",
          type: "number",
          min: 0,
          defaultValue: "10",
        },
      ],
      confirmLabel: "Add chapter",
      onConfirm: ({ name, total }) =>
        update((d) => {
          d.subjects
            .find((subject) => subject.id === subjectId)
            ?.chapters.push({
              id: uid(),
              name: name?.trim() || "Untitled chapter",
              total: Math.max(0, Number(total) || 0),
              completed: 0,
            });
        }),
    });
  };

  const addSubject = () => {
    openForm({
      title: "Add subject",
      fields: [{ name: "name", label: "Subject name", placeholder: "e.g. Maths" }],
      confirmLabel: "Add subject",
      onConfirm: ({ name }) => {
        const id = uid();
        update((d) => {
          d.subjects.push({ id, name: name?.trim() || "Untitled subject", chapters: [] });
          d.revision[id] = { types: [], done: {}, targets: {} };
          d.tests.targets[id] = 0;
        });
        setOpenSubjectId(id);
      },
    });
  };

  return (
    <div className="space-y-2">
      <Card className="!p-2.5 sm:!p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Overall syllabus</h2>
          <span className="font-mono text-[13px] text-muted-foreground">
            {overall.done} / {overall.total} · {pct(overall.done, overall.total)}%
          </span>
        </div>
        <div className="mt-1.5">
          <Bar value={pct(overall.done, overall.total)} />
        </div>
      </Card>

      {data.subjects.map((s) => {
        const x = subjectSyllabus(s);
        const isOpen = openSubjectId === s.id;
        return (
          <Card key={s.id} className="!p-2.5 sm:!p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpenSubjectId((current) => (current === s.id ? "" : s.id))}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
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
              <div className="flex shrink-0 items-center gap-1">
                <GhostButton
                  tone="blue"
                  className="!px-2 !py-1 text-xs"
                  onClick={() => addChapter(s.id)}
                >
                  + Chapter
                </GhostButton>
                <IconButton
                  label="Rename subject"
                  onClick={() => {
                    openForm({
                      title: "Rename subject",
                      fields: [{ name: "name", label: "Subject name", defaultValue: s.name }],
                      onConfirm: ({ name }) =>
                        update((d) => {
                          const t = d.subjects.find((y) => y.id === s.id);
                          if (t) t.name = name?.trim() || t.name;
                        }),
                    });
                  }}
                >
                  <PencilIcon />
                </IconButton>
                <IconButton
                  label="Delete subject"
                  onClick={() => {
                    confirm({
                      title: "Delete subject?",
                      description: `“${s.name}”, its chapters, revisions, and sectional tests will be removed.`,
                      confirmLabel: "Delete subject",
                      danger: true,
                      onConfirm: () =>
                        update((d) => {
                          d.subjects = d.subjects.filter((y) => y.id !== s.id);
                          delete d.revision[s.id];
                          delete d.tests.targets[s.id];
                          d.tests.log = d.tests.log.filter((t) => t.subjectId !== s.id);
                        }),
                    });
                  }}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            </div>
            <div className="mt-1.5">
              <Bar value={pct(x.done, x.total)} />
            </div>

            {isOpen && (
              <>
                <div className="mt-2 space-y-1.5">
                  {s.chapters.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">No chapters yet.</p>
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
        className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        + Add subject
      </button>
    </div>
  );
}
