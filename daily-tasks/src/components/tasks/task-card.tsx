import { Check, Circle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration, type Task } from "@/lib/tasks";

export function TaskCard({
  task,
  onRequestComplete,
  onReopen,
  onEdit,
  onDelete,
}: {
  task: Task;
  onRequestComplete: (task: Task) => void;
  onReopen: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3 transition-all duration-200 sm:px-4",
        task.completed ? "opacity-70" : "hover:border-primary/30 hover:bg-surface-2",
      )}
    >
      <button
        type="button"
        aria-label={task.completed ? "Mark as pending" : "Mark as complete"}
        onClick={() => (task.completed ? onReopen(task.id) : onRequestComplete(task))}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors",
          task.completed
            ? "border-primary/60 bg-primary text-primary-foreground"
            : "border-border text-transparent hover:border-primary/60 hover:text-primary/50",
        )}
      >
        {task.completed ? <Check className="size-4" /> : <Circle className="size-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            task.completed ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {task.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {task.subject} · {task.type}
          {task.completed && task.minutesSpent ? (
            <span className="text-primary"> · {formatDuration(task.minutesSpent)}</span>
          ) : null}
        </p>
      </div>

      <span
        className={cn(
          "hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-block",
          task.completed
            ? "bg-primary-soft text-primary"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {task.completed ? "Completed" : "Pending"}
      </span>

      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
        <Button size="icon" variant="ghost" className="size-8" onClick={() => onEdit(task)}>
          <Pencil className="size-3.5" />
          <span className="sr-only">Edit</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 hover:text-destructive"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="size-3.5" />
          <span className="sr-only">Delete</span>
        </Button>
      </div>
    </div>
  );
}
