import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUBJECTS, type Subject } from "@/lib/syllabus";
import { TASK_TYPES, type Task, type TaskType } from "@/lib/tasks";

type TaskDraft = { name: string; subject: Subject; type: TaskType };

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  onSubmit: (draft: TaskDraft) => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState<Subject>("Maths");
  const [type, setType] = useState<TaskType>("Lecture");

  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? "");
    setSubject(task?.subject ?? "Maths");
    setType(task?.type ?? "Lecture");
  }, [open, task]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), subject, type });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {task ? "Update the details of this task." : "Added to today automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-name">Task name</Label>
            <Input
              id="task-name"
              autoFocus
              placeholder="Lecture 5 of Polity"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subject} onValueChange={(v) => setSubject(v as Subject)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
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

export function CompleteTaskDialog({
  task,
  onOpenChange,
  onComplete,
}: {
  task: Task | null;
  onOpenChange: (v: boolean) => void;
  onComplete: (id: string, minutes: number) => void;
}) {
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");

  useEffect(() => {
    if (task) {
      setHours("0");
      setMinutes("30");
    }
  }, [task]);

  const total = Math.max(0, Number(hours) || 0) * 60 + Math.max(0, Number(minutes) || 0);

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Task Completed 🎯</DialogTitle>
          <DialogDescription>How much time did this task take?</DialogDescription>
        </DialogHeader>

        <p className="truncate text-sm font-medium text-foreground">{task?.name}</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="hrs">Hours</Label>
            <Input
              id="hrs"
              type="number"
              min={0}
              max={24}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mins">Minutes</Label>
            <Input
              id="mins"
              type="number"
              min={0}
              max={59}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[30, 45, 60, 90, 120].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setHours(String(Math.floor(m / 60)));
                setMinutes(String(m % 60));
              }}
              className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {m >= 60 ? `${m / 60}h` : `${m}m`}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!task || total <= 0}
            onClick={() => {
              if (task) onComplete(task.id, total);
              onOpenChange(false);
            }}
          >
            Save &amp; Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
