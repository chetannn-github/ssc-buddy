import type { User } from "firebase/auth";
import { accentInk } from "@/lib/app-accent";
import { RollingNumber } from "@/components/ui/rolling-number";
import { Link } from "@tanstack/react-router";
import { Check, Flame, ListChecks, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { HabitEditor } from "@/components/tasks/HabitEditor";
import { HabitIcon } from "@/components/tasks/HabitIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { useHabits } from "@/lib/habits";
import {
  HABIT_COLORS,
  HABIT_DEFAULT_COLORS,
  habitCalendar,
  habitDay,
  habitEntry,
  canEditHabitDay,
  habitIsComplete,
  habitIntensity,
  habitDue,
  habitScheduled,
  habitStats,
  normalizeHabitSettings,
  type Habit,
  type HabitColor,
  type HabitDayAction,
} from "../../../mobile-tasks/src/domain/habits";
export function HabitsPanel({
  user,
  api,
  today,
  selected,
  dueOnly,
  enabled,
  addRequest,
}: {
  user: User | null;
  api: ReturnType<typeof useHabits>;
  today: string;
  selected: string;
  dueOnly: boolean;
  enabled: boolean;
  addRequest: number;
}) {
  const { habits, loading, error, retry, save, remove, updateDay } = api;
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const [detail, setDetail] = useState<{ id: string; day: string } | null>(null);
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const locked = useRef(false),
    previousRequest = useRef(addRequest);
  useEffect(() => {
    if (previousRequest.current !== addRequest && !locked.current) {
      setMessage("");
      setEditing("new");
    }
    previousRequest.current = addRequest;
  }, [addRequest]);
  useEffect(() => {
    setEditing(null);
    setDeleting(null);
    setDetail(null);
    setMessage("");
  }, [user?.uid, enabled]);
  const act = async (work: () => Promise<void>, after?: () => void) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
      after?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save. Try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const openDetail = (habit: Habit, day: string) => {
    const entry = habitEntry(habit, day);
    setCount(String(entry.count));
    setMessage("");
    setDetail({ id: habit.id, day });
  };
  const detailHabit = habits.find((habit) => habit.id === detail?.id),
    detailSettings = normalizeHabitSettings(detailHabit?.settings);
  const scoped = habits,
    due = habits.filter((habit) => habitDue(habit, selected));
  const mark = (id: string, day: string, action: HabitDayAction) => {
    void updateDay(id, day, action).catch(() => undefined);
  };
  const tap = (habit: Habit) => {
    const settings = normalizeHabitSettings(habit.settings);
    if (settings.tracking === "checklist") openDetail(habit, selected);
    else
      mark(
        habit.id,
        selected,
        settings.tracking === "count"
          ? { type: "increment", amount: settings.step }
          : { type: "toggle" },
      );
  };
  return (
    <div className="space-y-5">
      {!enabled ? (
        <p className="py-10 text-center text-zinc-500">
          Habits are turned off.{" "}
          <Link to="/profile" className="text-primary">
            Enable in Profile settings
          </Link>
        </p>
      ) : (
        <>
          {!user ? (
            <p className="py-10 text-center text-zinc-500">Sign in to track your habits.</p>
          ) : loading ? (
            <LoaderCircle className="mx-auto animate-spin text-yellow-300" />
          ) : error ? (
            <div role="alert">
              {error}
              <Button onClick={retry}>Try again</Button>
            </div>
          ) : (
            <>
              {!(dueOnly ? due : scoped).length && (
                <div className="rounded-3xl bg-[#121212] p-10 text-center">
                  <p className="text-zinc-500">
                    {habits.length
                      ? "All caught up for this day."
                      : "Make room for a better routine."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditing("new")}
                    className="mt-5 rounded-full bg-[#ffe000] px-6 py-3 font-semibold text-black"
                  >
                    ＋ Add habit
                  </button>
                </div>
              )}
              {(dueOnly ? due : scoped).map((habit) => {
                const stats = habitStats(habit, today),
                  settings = normalizeHabitSettings(habit.settings),
                  tint = HABIT_COLORS[habit.color],
                  entry = habitEntry(habit, selected),
                  done = habitIsComplete(habit, selected),
                  available = habitScheduled(habit, selected) && canEditHabitDay(selected, today);
                return (
                  <ContextMenu key={habit.id} modal={false}>
                    <ContextMenuTrigger asChild disabled={busy}>
                      <article
                        tabIndex={0}
                        className="min-w-0 rounded-2xl border border-white/10 bg-[#121212] p-4 sm:p-5"
                      >
                        <div className="mb-4 flex items-center gap-3">
                          <button
                            type="button"
                            aria-label={"Edit " + habit.name}
                            disabled={busy}
                            onClick={() => {
                              setMessage("");
                              setEditing(habit);
                            }}
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
                            style={{ color: tint, backgroundColor: tint + "12" }}
                          >
                            <HabitIcon name={settings.icon} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <h2 className="break-words font-semibold sm:text-lg">{habit.name}</h2>
                            <div
                              className="mt-1 flex flex-wrap items-center gap-1 text-xs"
                              style={{ color: tint }}
                            >
                              <Flame className="h-3.5 w-3.5" />
                              <RollingNumber value={stats.streak} />
                              {settings.tracking !== "tick" && (
                                <span className="text-zinc-500">
                                  {" "}
                                  ·{" "}
                                  {settings.tracking === "count"
                                    ? `${entry.count}/${settings.dailyGoal} ${settings.unit}`
                                    : `${entry.checks.filter((id) => settings.checklist.some((item) => item.id === id)).length}/${settings.checklist.length}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!available || busy}
                                aria-label={
                                  settings.tracking === "count"
                                    ? "Add " + settings.step
                                    : done
                                      ? "Undo completed day"
                                      : "Complete day"
                                }
                                onClick={(event) => {
                                  if (
                                    settings.tracking !== "checklist" &&
                                    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
                                  )
                                    event.currentTarget.animate(
                                      [
                                        { transform: "scale(1)" },
                                        { transform: "scale(1.16)" },
                                        { transform: "scale(1)" },
                                      ],
                                      { duration: 320, easing: "ease-out" },
                                    );
                                  tap(habit);
                                }}
                                onContextMenu={(event) => {
                                  if (settings.tracking === "count") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openDetail(habit, selected);
                                  }
                                }}
                                className="grid h-10 w-10 place-items-center rounded-full border disabled:opacity-30"
                                style={{
                                  backgroundColor: done ? tint : tint + "20",
                                  borderColor: tint + "30",
                                  color: done ? accentInk(tint) : "white",
                                  opacity: !available || busy ? 0.3 : 1,
                                }}
                              >
                                {settings.tracking === "count" ? (
                                  <Plus className="h-7 w-7" />
                                ) : settings.tracking === "checklist" && !done ? (
                                  <ListChecks className="h-6 w-6" />
                                ) : (
                                  <Check className="h-7 w-7" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                        <HabitGrid habit={habit} today={today} selected={selected} />
                        {!!habit.targetDays && (
                          <>
                            <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/5">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: stats.progress * 100 + "%",
                                  backgroundColor: tint,
                                }}
                              />
                            </div>
                            <p className="mt-2 text-xs" style={{ color: tint }}>
                              {stats.total}/{habit.targetDays} days
                              {stats.total >= habit.targetDays ? " · Challenge complete!" : ""}
                            </p>
                          </>
                        )}
                      </article>
                    </ContextMenuTrigger>
                    <ContextMenuContent
                      className="border-white/10 bg-[#121212] text-white"
                      onCloseAutoFocus={(event) => event.preventDefault()}
                    >
                      <ContextMenuItem
                        disabled={busy}
                        className="gap-2"
                        onSelect={() => {
                          setMessage("");
                          setEditing(habit);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit Habit
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={busy}
                        className="gap-2 text-red-300"
                        onSelect={() => {
                          setMessage("");
                          setDeleting(habit);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </>
          )}
        </>
      )}
      {!!message && !editing && !deleting && !detail && (
        <p role="status" className="text-sm text-zinc-400">
          {message}
        </p>
      )}
      {editing && (
        <HabitEditor
          key={editing === "new" ? "new" : editing.id}
          habit={editing === "new" ? null : editing}
          initialColor={
            (HABIT_DEFAULT_COLORS[habits.length % HABIT_DEFAULT_COLORS.length] ??
              "yellow") as HabitColor
          }
          busy={busy}
          error={message}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          onSave={(details) =>
            act(
              () => save(details, editing !== "new" ? editing : undefined),
              () => setEditing(null),
            )
          }
        />
      )}
      <Dialog
        open={!!detail && !!detailHabit}
        onOpenChange={(open) => {
          if (!open && !busy) setDetail(null);
        }}
      >
        <DialogContent className="top-auto bottom-0 translate-y-0 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:max-w-lg sm:rounded-2xl max-h-[75dvh] gap-2.5 p-3.5 [&>button.absolute]:hidden overflow-y-auto rounded-t-3xl rounded-b-none border-white/10 bg-[#121212] text-white">
          <div aria-hidden="true" className="mx-auto h-1 w-8 rounded-full bg-zinc-700" />
          <div className="my-1 flex items-center gap-3">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-black"
              style={{
                backgroundColor: detailHabit ? HABIT_COLORS[detailHabit.color] : "#ffe000",
              }}
            >
              <HabitIcon name={detailSettings.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">{detailHabit?.name}</DialogTitle>
              <p className="mt-1 text-xs text-zinc-500">
                {detailSettings.tracking === "checklist"
                  ? "Checklist"
                  : detailSettings.tracking === "count"
                    ? "Count"
                    : "Habit"}{" "}
                ·{" "}
                {detail &&
                  new Date(detail.day + "T12:00:00").toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
              </p>
            </div>
            {detailHabit && detail && detailSettings.tracking === "checklist" && (
              <span
                className="rounded-full px-3 py-2 font-semibold"
                style={{ backgroundColor: HABIT_COLORS[detailHabit.color] + "25" }}
              >
                <RollingNumber
                  value={
                    habitEntry(detailHabit, detail.day).checks.filter((id) =>
                      detailSettings.checklist.some((item) => item.id === id),
                    ).length
                  }
                  suffix={"/" + detailSettings.checklist.length}
                />
              </span>
            )}
          </div>
          {detailHabit && detail && detailSettings.tracking === "count" && (
            <>
              <label className="text-xs text-zinc-400">
                Count · {detailSettings.unit || "units"} / {detailSettings.dailyGoal} daily goal
                <Input
                  disabled={!detail || !canEditHabitDay(detail.day, today)}
                  type="number"
                  min={0}
                  step="any"
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </label>
              <Button
                disabled={busy || !detail || !canEditHabitDay(detail.day, today)}
                onClick={() =>
                  mark(detailHabit.id, detail.day, { type: "count", value: Number(count) })
                }
              >
                Update count
              </Button>
            </>
          )}
          {detailHabit &&
            detail &&
            detailSettings.tracking === "checklist" &&
            detailSettings.checklist.map((item, index) => {
              const checked = habitEntry(detailHabit, detail.day).checks.includes(item.id),
                tint = HABIT_COLORS[detailHabit.color];
              return (
                <button
                  type="button"
                  role="checkbox"
                  aria-label={item.title}
                  aria-checked={checked}
                  key={item.id}
                  disabled={busy || !canEditHabitDay(detail.day, today)}
                  onClick={(event) => {
                    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
                      event.currentTarget
                        .querySelector("[data-check]")
                        ?.animate(
                          [
                            { transform: "scale(1)" },
                            { transform: "scale(1.16)" },
                            { transform: "scale(1)" },
                          ],
                          { duration: 320 },
                        );
                    mark(detailHabit.id, detail.day, { type: "check", id: item.id });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-2xl border p-2.5 text-left disabled:opacity-40"
                  style={{
                    backgroundColor: checked ? tint + "28" : "#0e0e0e",
                    borderColor: checked ? tint + "70" : "#262626",
                  }}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm"
                    style={{ backgroundColor: checked ? tint + "30" : "#202020" }}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={
                      "flex-1 text-sm " + (checked ? "text-zinc-400 line-through" : "text-white")
                    }
                  >
                    {item.title}
                  </span>
                  <span
                    data-check
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                    style={{
                      backgroundColor: checked ? tint : tint + "22",
                      color: checked ? "black" : "white",
                    }}
                  >
                    <Check className="h-5 w-5" />
                  </span>
                </button>
              );
            })}
          {detailHabit && detail && detailSettings.tracking === "tick" && (
            <Button
              disabled={busy || !detail || !canEditHabitDay(detail.day, today)}
              onClick={() => mark(detailHabit.id, detail.day, { type: "toggle" })}
            >
              {habitIsComplete(detailHabit, detail.day)
                ? detailSettings.type === "quit"
                  ? "Mark a slip"
                  : "Undo completion"
                : detailSettings.type === "quit"
                  ? "Mark a slip"
                  : "Mark complete"}
            </Button>
          )}
          {!!message && (
            <p role="alert" className="text-red-300">
              {message}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent className="rounded-3xl border-white/10 bg-[#121212] text-white">
          <DialogHeader>
            <DialogTitle>Delete habit?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">Remove “{deleting?.name}” and its history?</p>
          {!!message && (
            <p role="alert" className="text-red-300">
              {message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deleting)
                  void act(
                    () => remove(deleting.id),
                    () => setDeleting(null),
                  );
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
const HabitGrid = memo(function HabitGrid({
  habit,
  today,
  selected,
}: {
  habit: Habit;
  today: string;
  selected: string;
}) {
  const cells = useMemo(() => habitCalendar(today, 12), [today]),
    tint = HABIT_COLORS[habit.color];
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth;
  }, [today, habit.id]);
  return (
    <div
      ref={scroll}
      style={{ WebkitOverflowScrolling: "touch" }}
      role="region"
      aria-label={habit.name + " heatmap"}
      tabIndex={0}
      className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain py-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        className="grid w-max gap-[3px] pr-1"
        style={{
          gridTemplateRows: "repeat(7, 1fr)",
          gridTemplateColumns: "repeat(" + Math.ceil(cells.length / 7) + ", 15px)",
        }}
      >
        {cells.map((cell) => {
          const level = habitIntensity(habit, cell.key);
          return (
            <span
              role="img"
              key={cell.key}
              title={
                cell.key + (level >= 1 ? " · Completed" : " · " + Math.round(level * 100) + "%")
              }
              aria-label={
                cell.key +
                (level >= 1 ? ", completed" : ", " + Math.round(level * 100) + " percent")
              }
              style={{
                gridRow: cell.row + 1,
                gridColumn: cell.column + 1,
                aspectRatio: "1",
                borderRadius: 3,
                backgroundColor: level > 0 ? tint : tint + "22",
                opacity: cell.future
                  ? 0.3
                  : cell.key < habitDay(new Date(habit.createdAt))
                    ? 0.8
                    : level > 0
                      ? 0.25 + 0.75 * level
                      : 1,
                outline: cell.key === selected ? "1px solid " + tint : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
});
