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
import {
  TASK_TYPES,
  todayKey,
  type DailyTask,
  type TaskDraft,
  type TaskType,
} from "@/lib/daily-tasks";

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  subjects,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: DailyTask | null;
  subjects: string[];
  onSubmit: (draft: TaskDraft) => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Other");
  const [type, setType] = useState<TaskType>("Lecture");
  const [schedule, setSchedule] = useState<"today" | "tomorrow">("today");
  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? "");
    setSubject(task?.subject ?? subjects[0] ?? "Other");
    setType(task?.type ?? "Lecture");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSchedule(task?.date === todayKey(tomorrow) ? "tomorrow" : "today");
  }, [open, task, subjects]);
  const submit = () => {
    if (!name.trim()) return;
    const date = new Date();
    if (schedule === "tomorrow") date.setDate(date.getDate() + 1);
    onSubmit({ name: name.trim(), subject, type, date: task?.date ?? todayKey(date) });
    onOpenChange(false);
  };
  const subjectOptions = [...new Set([...subjects, "Other"])];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-transparent bg-[#1b1b1b] text-zinc-100 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          {task && <DialogDescription>Update this task.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-name">Task name</Label>
            <Input
              id="task-name"
              autoFocus
              className="border-white/10 bg-[#181818] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-blue-500/40"
              value={name}
              placeholder="Lecture 5 of Polity"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="border-white/10 bg-[#181818] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#181818] text-zinc-100">
                  {subjectOptions.map((item) => (
                    <SelectItem
                      key={item}
                      value={item}
                      className="focus:bg-white/10 focus:text-zinc-100"
                    >
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Task type</Label>
              <Select value={type} onValueChange={(value) => setType(value as TaskType)}>
                <SelectTrigger className="border-white/10 bg-[#181818] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#181818] text-zinc-100">
                  {TASK_TYPES.map((item) => (
                    <SelectItem
                      key={item}
                      value={item}
                      className="focus:bg-white/10 focus:text-zinc-100"
                    >
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!task && (
            <div className="space-y-2">
              <Label>Schedule for</Label>
              <div className="flex gap-2">
                {(["today", "tomorrow"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSchedule(option)}
                    className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${schedule === option ? "border-white/25 bg-white/10 text-zinc-100" : "border-white/10 bg-[#181818] text-zinc-400 hover:bg-white/5"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {" "}
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
  task: DailyTask | null;
  onOpenChange: (open: boolean) => void;
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
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="border-transparent bg-[#1b1b1b] text-zinc-100 shadow-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Task completed</DialogTitle>
          <DialogDescription>How much time did this task take?</DialogDescription>
        </DialogHeader>
        <p className="truncate text-sm font-medium">{task?.name}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="task-hours">Hours</Label>
            <Input
              id="task-hours"
              className="border-white/10 bg-[#181818] text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              type="number"
              min={0}
              max={24}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-minutes">Minutes</Label>
            <Input
              id="task-minutes"
              className="border-white/10 bg-[#181818] text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[30, 45, 60, 90, 120].map((duration) => (
            <button
              key={duration}
              type="button"
              onClick={() => {
                setHours(String(Math.floor(duration / 60)));
                setMinutes(String(duration % 60));
              }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {duration >= 60 ? `${duration / 60}h` : `${duration}m`}
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
            Save & complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
