import { ArrowDown, ArrowUp, ChevronRight, GripVertical, ListOrdered, Star, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTracker } from "@/lib/tracker-store";
import { cn } from "@/lib/utils";
import {
  overallSyllabus,
  pct,
  recordActivity,
  revDone,
  revTarget,
  subjectRevision,
  subjectSyllabus,
  uid,
  type Chapter,
  type Subject,
} from "@/lib/tracker";
import { Bar, GhostButton, IconButton, Label } from "./ui";
import { useTrackerDialog } from "./dialog";

type Mode = "syllabus" | "revision";
type Selected = { subject: Subject; chapter: Chapter } | null;

function RevisionDots({
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
      {Array.from({ length: Math.min(target, 30) }, (_, index) => index + 1).map((number) => (
        <button
          key={number}
          type="button"
          onClick={() => number > done && onSet(number)}
          disabled={number <= done}
          className={
            number <= done
              ? "h-7 w-7 rounded-full bg-accent-green font-mono text-[11px] text-card disabled:opacity-100"
              : "h-7 w-7 rounded-full bg-track font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          {number}
        </button>
      ))}
    </div>
  );
}

export function ChapterWorkspace({ mode }: { mode: Mode }) {
  const { data, update } = useTracker();
  const { openForm, confirm } = useTrackerDialog();
  const [subjectFilter, setSubjectFilter] = useState("all");
  // Keep both workspaces calm on entry; users can open the subject they need.
  const [openSubjectId, setOpenSubjectId] = useState("");
  const [reorderingSubjectId, setReorderingSubjectId] = useState("");
  const [draggingChapterId, setDraggingChapterId] = useState("");
  const [selected, setSelected] = useState<Selected>(null);
  const overall = overallSyllabus(data);
  const subjects =
    subjectFilter === "all"
      ? data.subjects
      : data.subjects.filter((subject) => subject.id === subjectFilter);
  const pinned = useMemo(() => {
    const chaptersById = new Map<string, { subject: Subject; chapter: Chapter }>();
    data.subjects.forEach((subject) =>
      subject.chapters.forEach((chapter) => chaptersById.set(chapter.id, { subject, chapter })),
    );
    return data.pinnedChapterIds.flatMap((chapterId) => {
      const entry = chaptersById.get(chapterId);
      return entry ? [entry] : [];
    });
  }, [data.pinnedChapterIds, data.subjects]);

  const togglePin = (chapterId: string) =>
    update((draft) => {
      draft.pinnedChapterIds = draft.pinnedChapterIds.includes(chapterId)
        ? draft.pinnedChapterIds.filter((id) => id !== chapterId)
        : [...draft.pinnedChapterIds, chapterId];
    });

  const setCompleted = (subjectId: string, chapterId: string, value: number) =>
    update((draft) => {
      const chapter = draft.subjects
        .find((subject) => subject.id === subjectId)
        ?.chapters.find((item) => item.id === chapterId);
      if (!chapter) return;
      const next = Math.max(chapter.completed, Math.min(value, chapter.total));
      recordActivity(draft, "lecture", next - chapter.completed, { subjectId, chapterId });
      chapter.completed = next;
    });

  const setRevision = (subjectId: string, chapterId: string, typeId: string, value: number) =>
    update((draft) => {
      const revision = draft.revision[subjectId];
      if (!revision) return;
      revision.done[chapterId] = revision.done[chapterId] ?? {};
      const current = revision.done[chapterId]![typeId] ?? 0;
      const next = Math.max(current, value);
      recordActivity(draft, "revision", next - current, {
        subjectId,
        chapterId,
        revisionTypeId: typeId,
      });
      revision.done[chapterId]![typeId] = next;
    });

  const addChapter = (subjectId: string) =>
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
        update((draft) => {
          draft.subjects
            .find((subject) => subject.id === subjectId)
            ?.chapters.push({
              id: uid(),
              name: name?.trim() || "Untitled chapter",
              total: Math.max(0, Number(total) || 0),
              completed: 0,
            });
        }),
    });

  const addSubject = () =>
    openForm({
      title: "Add subject",
      fields: [{ name: "name", label: "Subject name", placeholder: "e.g. Maths" }],
      confirmLabel: "Add subject",
      onConfirm: ({ name }) =>
        update((draft) => {
          const id = uid();
          draft.subjects.push({ id, name: name?.trim() || "Untitled subject", chapters: [] });
          draft.revision[id] = { types: [], done: {}, targets: {} };
          draft.tests.targets[id] = 0;
        }),
    });

  const moveChapter = (subjectId: string, chapterIndex: number, direction: -1 | 1) =>
    update((draft) => {
      const chapters = draft.subjects.find((subject) => subject.id === subjectId)?.chapters;
      const nextIndex = chapterIndex + direction;
      if (!chapters || nextIndex < 0 || nextIndex >= chapters.length) return;
      [chapters[chapterIndex], chapters[nextIndex]] = [
        chapters[nextIndex]!,
        chapters[chapterIndex]!,
      ];
    });

  const moveChapterTo = (subjectId: string, sourceId: string, targetId: string) =>
    update((draft) => {
      if (!sourceId || sourceId === targetId) return;
      const chapters = draft.subjects.find((subject) => subject.id === subjectId)?.chapters;
      if (!chapters) return;
      const sourceIndex = chapters.findIndex((chapter) => chapter.id === sourceId);
      const targetIndex = chapters.findIndex((chapter) => chapter.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      const [chapter] = chapters.splice(sourceIndex, 1);
      if (chapter)
        chapters.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, chapter);
    });

  const addRevisionType = (subjectId: string) =>
    openForm({
      title: "Add revision type",
      fields: [
        { name: "name", label: "Revision type", placeholder: "e.g. Revision 1" },
        {
          name: "target",
          label: "Revisions per chapter",
          type: "number",
          min: 1,
          defaultValue: "1",
        },
      ],
      confirmLabel: "Add revision type",
      onConfirm: ({ name, target }) =>
        update((draft) => {
          const revision = draft.revision[subjectId];
          if (!revision) return;
          revision.types.push({
            id: uid(),
            name: name?.trim() || `Revision ${revision.types.length + 1}`,
            target: Math.max(1, Number(target) || 1),
          });
        }),
    });

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-3 border-b border-white/10 bg-[#121212]/95 px-3 pt-1 pb-3 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 gap-1 overflow-x-auto pb-0.5">
            <FilterButton active={subjectFilter === "all"} onClick={() => setSubjectFilter("all")}>
              All
            </FilterButton>
            {data.subjects.map((subject) => (
              <FilterButton
                key={subject.id}
                active={subjectFilter === subject.id}
                onClick={() => setSubjectFilter(subject.id)}
              >
                {subject.name}
              </FilterButton>
            ))}
          </div>
          {mode === "syllabus" && (
            <GhostButton tone="blue" className="!px-2 !py-1 text-xs" onClick={addSubject}>
              + Subject
            </GhostButton>
          )}
        </div>
      </div>

      {mode === "syllabus" && (
        <div className="rounded-xl bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Overall syllabus</h2>
            <span className="font-mono text-xs text-muted-foreground">
              {overall.done} / {overall.total} · {pct(overall.done, overall.total)}%
            </span>
          </div>
          <div className="mt-2">
            <Bar value={pct(overall.done, overall.total)} />
          </div>
        </div>
      )}

      {pinned.length > 0 && (
        <section>
          <Label>Quick access</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {pinned.map(({ subject, chapter }) => (
              <button
                key={chapter.id}
                type="button"
                onClick={() => setSelected({ subject, chapter })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-track"
              >
                <Star className="h-3.5 w-3.5 fill-accent-blue text-accent-blue" />
                {chapter.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-1.5">
        <Label>{mode === "syllabus" ? "Chapters" : "Revision chapters"}</Label>
        {subjects.map((subject) => {
          const progress =
            mode === "syllabus" ? subjectSyllabus(subject) : subjectRevision(data, subject);
          const isOpen = openSubjectId === subject.id;
          const isReordering = reorderingSubjectId === subject.id;
          return (
            <div key={subject.id} className="rounded-xl bg-card px-3 py-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setOpenSubjectId((current) => (current === subject.id ? "" : subject.id))
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={isOpen}
                >
                  <ChevronRight
                    className={
                      isOpen
                        ? "h-4 w-4 shrink-0 rotate-90 text-muted-foreground transition-transform"
                        : "h-4 w-4 shrink-0 text-muted-foreground transition-transform"
                    }
                  />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold">{subject.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      {progress.done} / {progress.total} · {pct(progress.done, progress.total)}%
                    </p>
                  </div>
                </button>
                {mode === "syllabus" && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <GhostButton
                      tone="blue"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => addChapter(subject.id)}
                    >
                      + Chapter
                    </GhostButton>
                    <button
                      type="button"
                      aria-pressed={isReordering}
                      onClick={() => {
                        setOpenSubjectId(subject.id);
                        setReorderingSubjectId((current) =>
                          current === subject.id ? "" : subject.id,
                        );
                      }}
                      className={
                        isReordering
                          ? "inline-flex h-7 items-center gap-1 rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 text-xs text-accent-blue"
                          : "inline-flex h-7 items-center gap-1 rounded-full border border-white/10 px-2 text-xs text-muted-foreground transition-colors hover:bg-track hover:text-foreground"
                      }
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                      {isReordering ? "Done" : "Reorder"}
                    </button>
                  </div>
                )}
                {mode === "revision" && (
                  <GhostButton
                    tone="blue"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => addRevisionType(subject.id)}
                  >
                    + Revision type
                  </GhostButton>
                )}
              </div>
              <div className="mt-1.5">
                <Bar
                  value={pct(progress.done, progress.total)}
                  tone={mode === "revision" ? "green" : "blue"}
                />
              </div>
              <div
                className={
                  isOpen
                    ? "mt-1.5 grid grid-rows-[1fr] transition-[grid-template-rows] duration-300"
                    : "grid grid-rows-[0fr] transition-[grid-template-rows] duration-300"
                }
              >
                <div className="min-h-0 overflow-hidden divide-y divide-white/[0.06]">
                  {subject.chapters.length ? (
                    <>
                      {subject.chapters.map((chapter, chapterIndex) => (
                        <ChapterRow
                          key={chapter.id}
                          subject={subject}
                          chapter={chapter}
                          mode={mode}
                          pinned={data.pinnedChapterIds.includes(chapter.id)}
                          reordering={isReordering}
                          onOpen={() => setSelected({ subject, chapter })}
                          onPin={() => togglePin(chapter.id)}
                          onMove={(direction) => moveChapter(subject.id, chapterIndex, direction)}
                          onDropChapter={(sourceId) =>
                            moveChapterTo(subject.id, sourceId, chapter.id)
                          }
                          onDragChange={setDraggingChapterId}
                          dragging={draggingChapterId === chapter.id}
                          canMoveUp={chapterIndex > 0}
                          canMoveDown={chapterIndex < subject.chapters.length - 1}
                        />
                      ))}
                    </>
                  ) : (
                    <p className="py-3 text-sm text-muted-foreground">No chapters yet.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>
      {selected && (
        <ChapterDrawer
          selected={selected}
          mode={mode}
          onClose={() => setSelected(null)}
          onPin={togglePin}
          onSetCompleted={setCompleted}
          onSetRevision={setRevision}
          onDeleted={() => setSelected(null)}
          confirm={confirm}
        />
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "shrink-0 rounded-full bg-accent-blue px-3 py-1.5 text-sm text-card"
          : "shrink-0 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-card hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function ChapterRow({
  subject,
  chapter,
  mode,
  pinned,
  reordering,
  onOpen,
  onPin,
  onMove,
  onDropChapter,
  onDragChange,
  dragging,
  canMoveUp,
  canMoveDown,
}: {
  subject: Subject;
  chapter: Chapter;
  mode: Mode;
  pinned: boolean;
  reordering: boolean;
  onOpen: () => void;
  onPin: () => void;
  onMove: (direction: -1 | 1) => void;
  onDropChapter: (sourceId: string) => void;
  onDragChange: (chapterId: string) => void;
  dragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { data } = useTracker();
  const revision = data.revision[subject.id];
  const revisionProgress =
    revision?.types.reduce(
      (sum, type) =>
        sum +
        Math.min(
          revDone(data, subject.id, chapter.id, type.id),
          revTarget(data, subject.id, chapter.id, type),
        ),
      0,
    ) ?? 0;
  const revisionTotal =
    revision?.types.reduce((sum, type) => sum + revTarget(data, subject.id, chapter.id, type), 0) ??
    0;
  const done = mode === "syllabus" ? chapter.completed : revisionProgress;
  const total = mode === "syllabus" ? chapter.total : revisionTotal;
  return (
    <div
      draggable={reordering}
      onDragStart={(event) => {
        if (!reordering) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", chapter.id);
        onDragChange(chapter.id);
      }}
      onDragOver={(event) => {
        if (reordering) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!reordering) return;
        event.preventDefault();
        onDropChapter(event.dataTransfer.getData("text/plain"));
        onDragChange("");
      }}
      onDragEnd={() => onDragChange("")}
      className={cn(
        "flex items-center gap-2 rounded-lg py-2 transition-all",
        reordering &&
          "cursor-grab border border-transparent px-2 hover:border-accent-blue/25 hover:bg-accent-blue/5 active:cursor-grabbing",
        dragging && "scale-[0.98] border-dashed border-accent-blue/50 bg-accent-blue/10 opacity-45",
      )}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{chapter.name}</span>
          {pinned && <Star className="h-3.5 w-3.5 shrink-0 fill-accent-blue text-accent-blue" />}
        </div>
        <div className="mt-1">
          <Bar value={pct(done, total)} tone={mode === "revision" ? "green" : "blue"} />
        </div>
      </button>
      <span className="w-18 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {done}/{total}
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {pct(done, total)}%
      </span>
      {reordering ? (
        <div className="flex shrink-0 gap-1">
          <span
            className="grid h-7 w-5 place-items-center text-muted-foreground"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            aria-label={`Move ${chapter.name} up`}
            className="grid h-7 w-7 place-items-center rounded-md bg-track text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            aria-label={`Move ${chapter.name} down`}
            className="grid h-7 w-7 place-items-center rounded-md bg-track text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPin}
          aria-label={pinned ? "Unpin chapter" : "Pin chapter"}
          className={
            pinned
              ? "grid h-7 w-7 place-items-center rounded-full bg-track text-accent-blue"
              : "grid h-7 w-7 place-items-center rounded-full bg-track text-muted-foreground hover:text-foreground"
          }
        >
          <Star className={pinned ? "h-4 w-4 fill-current" : "h-4 w-4"} />
        </button>
      )}
    </div>
  );
}

function ChapterDrawer({
  selected,
  mode,
  onClose,
  onPin,
  onSetCompleted,
  onSetRevision,
  onDeleted,
  confirm,
}: {
  selected: Exclude<Selected, null>;
  mode: Mode;
  onClose: () => void;
  onPin: (id: string) => void;
  onSetCompleted: (subjectId: string, chapterId: string, value: number) => void;
  onSetRevision: (subjectId: string, chapterId: string, typeId: string, value: number) => void;
  onDeleted: () => void;
  confirm: ReturnType<typeof useTrackerDialog>["confirm"];
}) {
  const { data, update } = useTracker();
  const { subject, chapter: initialChapter } = selected;
  const chapter =
    data.subjects
      .find((item) => item.id === subject.id)
      ?.chapters.find((item) => item.id === initialChapter.id) ?? initialChapter;
  const [name, setName] = useState(chapter.name);
  const [total, setTotal] = useState(String(chapter.total));
  const [editing, setEditing] = useState(false);
  const pinned = data.pinnedChapterIds.includes(chapter.id);
  const revision = data.revision[subject.id];
  const save = () =>
    update((draft) => {
      const target = draft.subjects
        .find((item) => item.id === subject.id)
        ?.chapters.find((item) => item.id === chapter.id);
      if (!target) return;
      target.name = name.trim() || target.name;
      target.total = Math.max(target.completed, Number(total) || 0);
    });
  const remove = () =>
    confirm({
      title: "Delete chapter?",
      description: `“${chapter.name}” and its progress will be removed.`,
      confirmLabel: "Delete chapter",
      danger: true,
      onConfirm: () => {
        update((draft) => {
          const target = draft.subjects.find((item) => item.id === subject.id);
          if (target) target.chapters = target.chapters.filter((item) => item.id !== chapter.id);
          draft.pinnedChapterIds = draft.pinnedChapterIds.filter((id) => id !== chapter.id);
        });
        onDeleted();
      },
    });
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        className="chapter-drawer h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#1c1c1c] p-5 text-zinc-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
              {subject.name} · chapter
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{chapter.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X />
          </button>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between font-mono text-sm text-zinc-400">
            <span>
              {chapter.completed} / {chapter.total} lectures
            </span>
            <span>{pct(chapter.completed, chapter.total)}%</span>
          </div>
          <div className="mt-2">
            <Bar value={pct(chapter.completed, chapter.total)} />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <span className="grid h-10 w-20 place-items-center rounded-lg bg-track font-mono">
            {chapter.completed}
          </span>
          <IconButton
            label="Increase completed lectures"
            variant="solid"
            onClick={() => onSetCompleted(subject.id, chapter.id, chapter.completed + 1)}
          >
            +
          </IconButton>
          <span className="text-sm text-zinc-400">of {chapter.total}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="rounded-lg bg-track px-3 py-2.5 text-sm font-medium"
          >
            {editing ? "Close edit" : "Edit chapter"}
          </button>
          <button
            type="button"
            onClick={() => onPin(chapter.id)}
            className="rounded-lg bg-track px-3 py-2.5 text-sm font-medium"
          >
            {pinned ? "★ Unpin" : "☆ Pin"}
          </button>
        </div>
        {revision && revision.types.length > 0 && (
          <section className="mt-5 rounded-xl bg-card p-4">
            <Label>Revision</Label>
            <div className="mt-3 space-y-4">
              {revision.types.map((type) => {
                const target = revTarget(data, subject.id, chapter.id, type);
                const done = revDone(data, subject.id, chapter.id, type.id);
                return (
                  <div key={type.id}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span>{type.name}</span>
                      <span className="font-mono text-zinc-400">
                        {done}/{target}
                      </span>
                    </div>
                    <RevisionDots
                      done={done}
                      target={target}
                      onSet={(value) => onSetRevision(subject.id, chapter.id, type.id, value)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {editing && (
          <section className="mt-5 rounded-xl bg-card p-4">
            <div>
              <label className="block text-sm text-zinc-400">
                Chapter name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#151515] px-3 text-zinc-100 outline-none focus:border-accent-blue"
                />
              </label>
              <label className="mt-3 block text-sm text-zinc-400">
                Total lectures
                <input
                  value={total}
                  onChange={(event) => setTotal(event.target.value.replace(/\D/g, ""))}
                  className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#151515] px-3 text-zinc-100 outline-none focus:border-accent-blue"
                  inputMode="numeric"
                />
              </label>
              <div className="mt-4 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    save();
                    setEditing(false);
                  }}
                  className="rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-card"
                >
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={remove}
                  className="px-2 text-sm font-medium text-destructive"
                >
                  Delete
                </button>
              </div>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
