import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration, formatTime, type Task } from "@/lib/daily-tasks";

function TaskRow({
  task,
  readOnly,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  readOnly?: boolean | undefined;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={`group grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${
        task.completed
          ? "border-primary/25 bg-accent-soft"
          : "border-border bg-surface-2 hover:border-primary/25"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={readOnly}
        aria-label={task.completed ? "Mark as not done" : "Mark as done"}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${
          task.completed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-surface text-transparent hover:border-primary/60"
        }`}
      >
        <Check className="h-3 w-3" />
      </button>

      <div className="min-w-0">
        <p
          className={`truncate text-sm font-medium ${
            task.completed ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {task.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{task.subject}</span>
          <span>·</span>
          <span>{formatDuration(task.targetMinutes)}</span>
          {task.completed && task.completedAt && (
            <span className="text-primary">• Completed {formatTime(task.completedAt)}</span>
          )}
        </p>
      </div>

      {!readOnly && (
        <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit task">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Delete task"
            className="hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

export function TaskBoard({
  title,
  tasks,
  readOnly,
  embedded,
  onAdd,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  tasks: Task[];
  readOnly?: boolean | undefined;
  embedded?: boolean | undefined;
  onAdd?: () => void;
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <section className={embedded ? "" : "panel p-4 sm:p-5"}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="label-caps">{title}</p>
          <h2 className="mt-1 truncate text-base font-semibold">
            {pending.length} pending · {done.length} done
          </h2>
        </div>
        {!readOnly && onAdd && (
          <Button onClick={onAdd} className="shrink-0">
            <Plus className="h-4 w-4" /> Add task
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="mt-8 mb-4 text-center text-sm text-muted-foreground">
          No tasks for this day yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {[...pending, ...done].map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              readOnly={readOnly}
              onToggle={() => onToggle(task.id)}
              onEdit={() => onEdit(task)}
              onDelete={() => onDelete(task.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
