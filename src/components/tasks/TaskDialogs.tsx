import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatedChoices } from "../../../shared/AnimatedChoices";
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
  defaultSchedule = "today",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: DailyTask | null;
  subjects: string[];
  onSubmit: (draft: TaskDraft) => void | Promise<void>;
  defaultSchedule?: "today" | "tomorrow";
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Other");
  const [customSubject, setCustomSubject] = useState("");
  const [addedSubjects, setAddedSubjects] = useState<string[]>([]);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [type, setType] = useState<TaskType>("Lecture");
  const [schedule, setSchedule] = useState<"today" | "tomorrow">("today");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    if (!open) return;
    setSaveError("");
    setName(task?.name ?? "");
    setSubject(task?.subject ?? subjects[0] ?? "Other");
    setCustomSubject("");
    setAddedSubjects([]);
    setAddSubjectOpen(false);
    setType(task?.type ?? "Lecture");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSchedule(task ? (task.date === todayKey(tomorrow) ? "tomorrow" : "today") : defaultSchedule);
  }, [open, task, subjects, defaultSchedule]);
  const submit = async () => {
    if (!name.trim() || isSaving) return;
    const date = new Date();
    if (schedule === "tomorrow") date.setDate(date.getDate() + 1);
    setIsSaving(true);
    setSaveError("");
    try {
      await onSubmit({ name: name.trim(), subject: customSubject.trim() || subject, type, date: task?.date ?? todayKey(date) });
      onOpenChange(false);
    } catch {
      setSaveError("Could not save task. Please try again.");
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
    <Dialog open={open} onOpenChange={(value) => { if (!isSaving) onOpenChange(value); }}>
      <DialogContent className="border-transparent bg-[#121212] text-zinc-100 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "Add Task"}</DialogTitle>
          {task && <DialogDescription>Update this task.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-name">Task name</Label>
            <Input
              id="task-name"
              autoFocus
              className="border-white/10 bg-[#121212] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-primary/40"
              value={name}
              placeholder="Lecture 5 of Polity"
              onChange={(event) => setName(event.target.value.toUpperCase())}
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
                <SelectTrigger className="border-white/10 bg-[#121212] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#121212] text-zinc-100">
                  {subjectOptions.map((item) => (
                    <SelectItem
                      key={item}
                      value={item}
                      className="focus:bg-white/10 focus:text-zinc-100 data-[state=checked]:bg-primary data-[state=checked]:font-medium data-[state=checked]:text-primary-foreground"
                    >
                      {item}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-primary focus:bg-white/10 focus:text-primary">+ Add subject</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Task type</Label>
              <Select value={type} onValueChange={(value) => setType(value as TaskType)}>
                <SelectTrigger className="border-white/10 bg-[#121212] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#121212] text-zinc-100">
                  {["Practice Session", "Lecture", ...TASK_TYPES.filter((type) => type !== "Practice Session" && type !== "Lecture")].map((item) => (
                    <SelectItem
                      key={item}
                      value={item}
                      className="focus:bg-white/10 focus:text-zinc-100 data-[state=checked]:bg-primary data-[state=checked]:font-medium data-[state=checked]:text-primary-foreground"
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
              <AnimatedChoices className="completion-time-choices" label="Schedule for" options={[{ value: "today", label: "Today", disabled: isSaving }, { value: "tomorrow", label: "Tomorrow", disabled: isSaving }]} value={schedule} onChange={value => setSchedule(value as "today" | "tomorrow")} />
            </div>
          )}
        </div>
        {saveError && <p role="alert" className="text-xs text-red-300">{saveError}</p>}
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
        <DialogContent className="border-transparent bg-[#121212] text-zinc-100 shadow-2xl sm:max-w-sm">
          <DialogHeader><DialogTitle>Add subject</DialogTitle><DialogDescription>Create a subject just for your tasks.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="custom-task-subject">Subject name</Label><Input id="custom-task-subject" autoFocus value={customSubject} className="border-white/10 bg-[#121212] text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-primary/40" placeholder="e.g. Polity" onChange={(event) => setCustomSubject(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") addCustomSubject(); }} /></div>
          {saveError && <p role="alert" className="text-xs text-red-300">{saveError}</p>}
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
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    if (task) {
      setSaveError("");
      setMinutes("30");
    }
  }, [task]);
  const total = Math.max(0, Math.min(180, Number(minutes) || 0));
  return (
    <Dialog open={Boolean(task)} onOpenChange={(value) => { if (!isSaving) onOpenChange(value); }}>
      <DialogContent className="border-transparent bg-[#121212] text-zinc-100 shadow-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Task completed</DialogTitle>
          <DialogDescription>How much time did this task take?</DialogDescription>
        </DialogHeader>
        <p className="truncate text-sm font-medium">{task?.name}</p>
        <div className="space-y-2">
          <Label htmlFor="task-minutes">Minutes spent</Label>
          <Input
            id="task-minutes"
            className="border-white/10 bg-[#121212] text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
        <AnimatedChoices className="completion-time-choices" label="Time spent" options={[30, 45, 60, 90, 120].map(duration => ({ value: String(duration), label: duration >= 60 ? `${duration / 60}h` : `${duration}m`, disabled: isSaving }))} value={String(Number(minutes))} onChange={setMinutes} />
        {saveError && <p role="alert" className="text-xs text-red-300">{saveError}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!task || total <= 0 || isSaving}
            onClick={async () => {
              if (!task || isSaving) return;
              setIsSaving(true);
              setSaveError("");
              try {
                await onComplete(task.id, total);
                onOpenChange(false);
              } catch {
                setSaveError("Could not complete task. Please try again.");
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
