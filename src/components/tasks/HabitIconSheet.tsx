import { useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  HABIT_ICON_CATALOG,
  HABIT_ICON_GROUPS,
} from "../../../mobile-tasks/src/domain/habit-icons";
import { HabitIcon } from "./HabitIcon";
export function HabitIconSheet({
  value,
  tint,
  onSelect,
  onClose,
}: {
  value: string;
  tint: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(""),
    [group, setGroup] = useState("All");
  const groups = group === "All" ? HABIT_ICON_GROUPS : [group];
  const matches = HABIT_ICON_CATALOG.filter(
    (icon) =>
      icon.name.replaceAll("-", " ").includes(search.toLowerCase().trim()) ||
      icon.group.toLowerCase().includes(search.toLowerCase().trim()),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="fixed bottom-0 top-auto flex h-[86dvh] max-h-[86dvh] flex-col translate-y-0 overflow-hidden rounded-t-3xl border-white/5 bg-[#121212] px-3 pb-0 pt-3 text-white sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:h-[75dvh] sm:max-w-2xl sm:rounded-2xl [&>button]:text-zinc-400">
        <div className="mx-auto h-1 w-9 rounded-full bg-zinc-700" />
        <DialogTitle className="mb-3 text-center">Icon</DialogTitle>
        <label className="flex shrink-0 items-center gap-3 rounded-xl border border-white/10 bg-[#121212] p-3">
          <Search className="h-5 w-5 text-zinc-500" />
          <input
            aria-label="Search icons"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search icons"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <div className="flex min-h-14 shrink-0 items-center gap-2 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["All", ...HABIT_ICON_GROUPS].map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setGroup(item)}
              className="shrink-0 rounded-full bg-[#121212] px-4 py-2.5 text-xs"
              style={{
                color: group === item ? tint : "#999",
                backgroundColor: group === item ? tint + "40" : undefined,
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {groups.map((category) => {
            const icons = matches.filter((icon) => icon.group === category);
            return icons.length ? (
              <section key={category}>
                <h3 className="mb-2 mt-4 text-sm font-semibold text-zinc-500">{category}</h3>
                <div className="grid grid-cols-6 gap-1.5">
                  {icons.map((icon) => (
                    <button
                      type="button"
                      key={icon.name}
                      aria-label={icon.name}
                      aria-pressed={value === icon.name}
                      onClick={() => {
                        onSelect(icon.name);
                        onClose();
                      }}
                      className="grid aspect-square place-items-center rounded-xl border border-transparent bg-[#121212]"
                      style={{
                        color: value === icon.name ? tint : "white",
                        borderColor: value === icon.name ? tint : undefined,
                        backgroundColor: value === icon.name ? tint + "25" : undefined,
                      }}
                    >
                      <HabitIcon name={icon.name} className="h-7 w-7" />
                    </button>
                  ))}
                </div>
              </section>
            ) : null;
          })}
          {!matches.length && <p className="p-8 text-center text-zinc-500">No icons found.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
