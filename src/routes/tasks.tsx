import { createFileRoute } from "@tanstack/react-router";
import { TasksWorkspace } from "@/components/tasks/TasksWorkspace";
export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks · SSC Buddy" }, { property: "og:title", content: "Tasks · SSC Buddy" }] }),
  component: TasksWorkspace });
