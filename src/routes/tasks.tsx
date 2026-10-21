import { createFileRoute } from "@tanstack/react-router";
import { TasksWorkspace } from "@/components/tasks/TasksWorkspace";
export const Route = createFileRoute("/tasks")({ component: TasksWorkspace });
