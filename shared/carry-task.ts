import type { Task } from "../mobile-tasks/src/domain/tasks";

export function copyPastTask(task: Task, target: string, today: string, id: string, createdAt: string): Task {
  const tomorrow = new Date(today + "T12:00:00");
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  if (task.completed || task.date >= today) throw new Error("Only incomplete tasks from previous days can be added again.");
  if (target !== today && target !== tomorrowKey) throw new Error("Choose today or tomorrow.");
  return { ...task, id, date: target, createdAt, completed: false, completedAt: null, minutesSpent: null };
}
