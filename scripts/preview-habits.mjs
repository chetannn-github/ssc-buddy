import fs from "node:fs";
// Isolated UI fixture: real Habits components with an in-memory store, no account/network writes.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "node:path";
const root = process.cwd();
const server = await createServer({
  configFile: false,
  root,
  plugins: [
    {
      name: "habit-preview-fixtures",
      enforce: "pre",
      resolveId(source) {
        if (source === "@/lib/habits") return path.join(root, "scripts/fixtures/habits/store.ts");
        if (source === "@/lib/auth-context") return "\0habit-auth";
        if (source === "@/components/layout/AppShell") return "\0habit-shell";
        if (source === "@/lib/habit-reminders") return "\0habit-reminders";
      },
      load(id) {
        const clean = id.replaceAll("\\", "/").split("?")[0];
        if (clean.endsWith("/src/lib/habits.ts"))
          return fs
            .readFileSync(path.join(root, "scripts/fixtures/habits/store.ts"), "utf8")
            .replace(
              "../../../mobile-tasks/src/domain/habits",
              "/mobile-tasks/src/domain/habits.ts",
            );
        if (
          clean.endsWith("/src/lib/auth-context.tsx") ||
          clean.endsWith("/src/lib/auth-context.ts")
        )
          return 'export const useAuthUser = () => ({uid:"preview-only"})';
        if (clean.endsWith("/src/components/layout/AppShell.tsx"))
          return "export const AppShell = ({children}) => children";
        if (clean.endsWith("/src/lib/habit-reminders.ts"))
          return "export const requestHabitReminders = async () => {}; export const useHabitReminders = () => {}";
        if (id === "\0habit-auth") return 'export const useAuthUser = () => ({uid:"preview-only"})';
        if (id === "\0habit-shell") return "export const AppShell = ({children}) => children";
        if (id === "\0habit-reminders")
          return "export const requestHabitReminders = async () => {}; export const useHabitReminders = () => {}";
      },
    },
    react(),
    tailwind(),
  ],
  resolve: { alias: { "@": path.join(root, "src") }, dedupe: ["react", "react-dom"] },
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
});
await server.listen();
console.log("Habits UI fixture: http://127.0.0.1:4175/scripts/fixtures/habits/index.html");
