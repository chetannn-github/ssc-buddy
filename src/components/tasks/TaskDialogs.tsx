import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_TYPES, type DailyTask, type TaskDraft, type TaskType } from "@/lib/daily-tasks";

export function TaskFormDialog({ open, onOpenChange, task, subjects, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; task: DailyTask | null; subjects: string[]; onSubmit: (draft: TaskDraft) => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Other");
  const [type, setType] = useState<TaskType>("Lecture");
  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? "");
    setSubject(task?.subject ?? subjects[0] ?? "Other");
    setType(task?.type ?? "Lecture");
  }, [open, task, subjects]);
  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), subject, type });
    onOpenChange(false);
  };
  const subjectOptions = [...new Set([...subjects, "Other"])];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="border-white/10 bg-[#1b1b1b] text-zinc-100 sm:max-w-md"><DialogHeader><DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle><DialogDescription>{task ? "Update this task." : "It will be added to today automatically."}</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="task-name">Task name</Label><Input id="task-name" autoFocus value={name} placeholder="Lecture 5 of Polity" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Subject</Label><Select value={subject} onValueChange={setSubject}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{subjectOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Task type</Label><Select value={type} onValueChange={(value) => setType(value as TaskType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TASK_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div></div></div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={!name.trim()}> {task ? "Save changes" : "Add task"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function CompleteTaskDialog({ task, onOpenChange, onComplete }: { task: DailyTask | null; onOpenChange: (open: boolean) => void; onComplete: (id: string, minutes: number) => void }) {
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  useEffect(() => { if (task) { setHours("0"); setMinutes("30"); } }, [task]);
  const total = Math.max(0, Number(hours) || 0) * 60 + Math.max(0, Number(minutes) || 0);
  return <Dialog open={Boolean(task)} onOpenChange={onOpenChange}><DialogContent className="border-white/10 bg-[#1b1b1b] text-zinc-100 sm:max-w-sm"><DialogHeader><DialogTitle>Task completed</DialogTitle><DialogDescription>How much time did this task take?</DialogDescription></DialogHeader><p className="truncate text-sm font-medium">{task?.name}</p><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="task-hours">Hours</Label><Input id="task-hours" type="number" min={0} max={24} value={hours} onChange={(event) => setHours(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="task-minutes">Minutes</Label><Input id="task-minutes" type="number" min={0} max={59} value={minutes} onChange={(event) => setMinutes(event.target.value)} /></div></div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!task || total <= 0} onClick={() => { if (task) onComplete(task.id, total); onOpenChange(false); }}>Save & complete</Button></DialogFooter></DialogContent></Dialog>;
}
