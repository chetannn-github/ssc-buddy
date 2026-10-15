import { LoaderCircle } from "lucide-react";
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
  onSubmit: (draft: TaskDraft) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Other");
  const [customSubject, setCustomSubject] = useState("");
  const [addedSubjects, setAddedSubjects] = useState<string[]>([]);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [type, setType] = useState<TaskType>("Lecture");
  const [schedule, setSchedule] = useState<"today" | "tomorrow">("today");
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? "");
    setSubject(task?.subject ?? subjects[0] ?? "Other");
    setCustomSubject("");
    setAddedSubjects([]);
    setAddSubjectOpen(false);
    setType(task?.type ?? "Lecture");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSchedule(task?.date === todayKey(tomorrow) ? "tomorrow" : "today");
  }, [open, task, subjects]);
  const submit = async () => {
    if (!name.trim() || isSaving) return;
    const date = new Date();
    if (schedule === "tomorrow") date.setDate(date.getDate() + 1);
    setIsSaving(true);
    try {
      await onSubmit({ name: name.trim(), subject: customSubject.trim() || subject, type, date: task?.date ?? todayKey(date) });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };
  const subjectOptions = [...new Set([...subjects, ...addedSubjects, "Other"] )];
  const addCustomSubject = () => {
    const value = customSubject.trim();
    if (!value) return;
    setAddedSubjects((current) => current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]);
    setSubject(value);
    setCustomSubject("");
    setAddSubjectOpen(false);
  };
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
              <Select value={subject} onValueChange={(value) => {
                if (value === "__custom__") { setCustomSubject(""); setAddSubjectOpen(true); return; }
                setSubject(value);
              }}>
                <SelectTrigger className="border-white/10 bg-[#181818] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#181818] text-zinc-100">
                  {subjectOptions.map((item) => (
                    <SelectItem
                      key={item}
                      value={item}
                      className="focus:bg-white/10 focus:text-zinc-100 data-[state=checked]:bg-zinc-100 data-[state=checked]:font-medium data-[state=checked]:text-zinc-900"
                    >
                      {item}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-sky-300 focus:bg-white/10 focus:text-sky-200">+ Add subject</SelectItem>
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
                      className="focus:bg-white/10 focus:text-zinc-100 data-[state=checked]:bg-zinc-100 data-[state=checked]:font-medium data-[state=checked]:text-zinc-900"
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
          <Button variant="ghost" disabled={isSaving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || isSaving}>
            {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {task ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <Dialog open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
        <DialogContent className="border-transparent bg-[#1b1b1b] text-zinc-100 shadow-2xl sm:max-w-sm">
          <DialogHeader><DialogTitle>Add subject</DialogTitle><DialogDescription>Create a subject just for your tasks.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="custom-task-subject">Subject name</Label><Input id="custom-task-subject" autoFocus value={customSubject} className="border-white/10 bg-[#181818] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-blue-500/40" placeholder="e.g. Polity" onChange={(event) => setCustomSubject(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCustomSubject(); }} /></div>
          <DialogFooter><Button variant="ghost" onClick={() => setAddSubjectOpen(false)}>Cancel</Button><Button disabled={!customSubject.trim()} onClick={addCustomSubject}>Add subject</Button></DialogFooter>
        </DialogContent>
      </Dialog>
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
  onComplete: (id: string, minutes: number) => void | Promise<void>;
}) {
  const [minutes, setMinutes] = useState("30");
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    if (task) {
      setMinutes("30");
    }
  }, [task]);
  const total = Math.max(0, Math.min(180, Number(minutes) || 0));
  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="border-transparent bg-[#1b1b1b] text-zinc-100 shadow-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Task completed</DialogTitle>
          <DialogDescription>How much time did this task take?</DialogDescription>
        </DialogHeader>
        <p className="truncate text-sm font-medium">{task?.name}</p>
        <div className="space-y-2">
          <Label htmlFor="task-minutes">Minutes spent</Label>
          <Input
            id="task-minutes"
            className="border-white/10 bg-[#181818] text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            type="number"
            min={1}
            max={180}
            value={minutes}
            onChange={(event) => {
              const value = event.target.value;
              setMinutes(value === "" ? "" : String(Math.min(180, Math.max(0, Number(value) || 0))));
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[30, 45, 60, 90, 120].map((duration) => (
            <button
              key={duration}
              type="button"
              onClick={() => {
                setMinutes(String(duration));
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
            disabled={!task || total <= 0 || isSaving}
            onClick={async () => {
              if (!task || isSaving) return;
              setIsSaving(true);
              try {
                await onComplete(task.id, total);
                onOpenChange(false);
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Save & complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
