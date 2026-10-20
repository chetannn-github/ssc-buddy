import { HABIT_ICON_CATALOG } from "../../../mobile-tasks/src/domain/habit-icons";
const paths = new Map(HABIT_ICON_CATALOG.map((icon) => [icon.name as string, icon.path]));
export function HabitIcon({ name, className = "h-6 w-6" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d={paths.get(name) ?? paths.get("medal")} />
    </svg>
  );
}
