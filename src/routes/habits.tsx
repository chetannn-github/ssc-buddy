import { createFileRoute } from "@tanstack/react-router";
import { TasksWorkspace } from "@/components/tasks/TasksWorkspace";
export const Route = createFileRoute("/habits")({
  head: () => ({ meta: [{ title: "Habits · SSC Buddy" }, { property: "og:title", content: "Habits · SSC Buddy" }] }),
  component: () => <TasksWorkspace initialSection="habits" /> });
