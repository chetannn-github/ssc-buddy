import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration, type Subject, type Task, type TaskType } from "@/lib/daily-tasks";

const PRESETS = [30, 60, 90, 120, 180];

export function TaskDialog({
  open,
  onOpenChange,
  date,
  task,
  subjects,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  task?: Task | null;
  subjects: string[];
  onSubmit: (values: {
    name: string;
    subject: Subject;
    type: TaskType;
    targetMinutes: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState<Subject>("Other");
  const [type, setType] = useState<TaskType>("other");
  const [minutes, setMinutes] = useState(120);

  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? "");
    setSubject(task?.subject ?? subjects[0] ?? "Other");
    setType(task?.type ?? "other");
    setMinutes(task?.targetMinutes ?? 120);
  }, [open, task, subjects]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || minutes <= 0) return;
    onSubmit({ name: trimmed, subject, type, targetMinutes: Math.round(minutes) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{task ? "Edit task" : "Add task"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label htmlFor="task-name">Task name</Label>
            <Input
              id="task-name"
              autoFocus
              value={name}
              placeholder="Complete Geometry lectures"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="bg-surface-2"
            />
          </div>

          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={subject} onValueChange={(v) => setSubject(v as Subject)}>
              <SelectTrigger className="bg-surface-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...subjects, "Other"]
                  .filter((s, index, all) => all.indexOf(s) === index)
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Task type</Label>
            <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
              <SelectTrigger className="bg-surface-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["lecture", "revision", "mock", "practice session", "other"] as TaskType[]).map(
                  (item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-target">Target time</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMinutes(p)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    minutes === p
                      ? "border-primary/40 bg-accent-soft text-primary"
                      : "border-border bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {formatDuration(p)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="task-target"
                type="number"
                min={5}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="w-28 bg-surface-2"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Scheduled for{" "}
            {new Date(date).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {task ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
