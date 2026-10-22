import { accentInk } from "@/lib/app-accent";
import { HabitIconSheet } from "./HabitIconSheet";
import { HabitIcon } from "./HabitIcon";
import { AnimatedChoices } from "../../../shared/AnimatedChoices";
import { useRef, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { requestHabitReminders } from "@/lib/habit-reminders";
import {
  HABIT_COLORS,
  HABIT_COLOR_COLUMNS,
  HABIT_FREQUENCIES,
  habitFormDetails,
  canSaveHabit,
  normalizeHabitSettings,
  type Habit,
  type HabitColor,
  type HabitSettings,
  type HabitSaveDetails,
} from "../../../mobile-tasks/src/domain/habits";
const input =
  "w-full rounded-xl border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-[var(--habit-color)]";
const section = "space-y-3 rounded-xl border border-white/10 bg-[#121212] p-4 text-sm";
export function HabitEditor({
  habit,
  initialColor,
  busy: parentBusy,
  error,
  onClose,
  onSave,
}: {
  habit: Habit | null;
  initialColor: HabitColor;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (details: HabitSaveDetails) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const busy = parentBusy || saving;
  const [name, setName] = useState(habit?.name ?? ""),
    [color, setColor] = useState<HabitColor>(habit?.color ?? initialColor),
    [target, setTarget] = useState(habit?.targetDays ? String(habit.targetDays) : "");
  const [settings, setSettings] = useState(() => normalizeHabitSettings(habit?.settings));
  const [goal, setGoal] = useState(String(settings.dailyGoal)),
    [amount, setAmount] = useState(String(settings.step)),
    [message, setMessage] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const [adding, setAdding] = useState(false),
    [itemName, setItemName] = useState("");
  const tint = HABIT_COLORS[color],
    patch = (value: Partial<HabitSettings>) => setSettings((old) => ({ ...old, ...value }));
  const canSave = canSaveHabit(name, color, target, settings, goal, amount);
  const save = async () => {
    if (busy || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setMessage("");
    try {
      const details = habitFormDetails(name, color, target, settings, goal, amount);
      const next = details.settings;
      if (
        next.reminder ||
        (next.tracking === "checklist" && next.checklist.some((item) => item.reminder))
      )
        await requestHabitReminders();
      await onSave({ ...details, settings: next });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save habit.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const toggleDay = (key: "weekdays" | "monthdays", day: number) =>
    patch({
      [key]: settings[key].includes(day)
        ? settings[key].filter((value) => value !== day)
        : [...settings[key], day],
    });
  const palette = (
    <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-2xl bg-[#121212] p-3">
      {HABIT_COLOR_COLUMNS.map((column, index) => (
        <div key={index} className="flex shrink-0 flex-col gap-3">
          {column.map((option) => (
            <button
              type="button"
              key={option}
              aria-label={option}
              aria-pressed={color === option}
              onClick={() => setColor(option)}
              className="h-7 w-7 rounded-full"
              style={{
                backgroundColor: HABIT_COLORS[option],
                outline: color === option ? "2px solid white" : undefined,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
  const frequency = (
    <section className={section}>
      <h3 className="mb-1.5">Frequency</h3>
      {(Object.keys(HABIT_FREQUENCIES) as HabitSettings["frequency"][]).map((key) => (
        <label
          key={key}
          className={`flex items-center gap-2.5 py-1.5 ${settings.type === "quit" && key !== "daily" ? "cursor-not-allowed opacity-30" : "cursor-pointer"}`}
        >
          <input
            type="radio"
            className="h-5 w-5 appearance-none rounded-full border-2 border-white checked:border-[var(--habit-color)] checked:bg-[var(--habit-color)] checked:shadow-[inset_0_0_0_3px_black]"
            disabled={settings.type === "quit" && key !== "daily"}
            name="habit-frequency"
            checked={settings.frequency === key}
            onChange={() => patch({ frequency: key })}
            style={{ accentColor: tint, "--habit-color": tint } as React.CSSProperties}
          />
          <span className={settings.type === "quit" && key !== "daily" ? "line-through" : undefined}>{HABIT_FREQUENCIES[key]}</span>
        </label>
      ))}
      {settings.frequency === "weekdays" && (
        <div className="flex flex-wrap gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay("weekdays", index)}
              className="rounded-lg border border-white/10 px-2.5 py-2 text-sm"
              style={{
                backgroundColor: settings.weekdays.includes(index) ? tint + "40" : undefined,
              }}
            >
              {day}
            </button>
          ))}
        </div>
      )}
      {settings.frequency === "monthdays" && (
        <>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <button
                type="button"
                key={day}
                onClick={() => toggleDay("monthdays", day)}
                className="rounded-lg border border-white/10 p-2 text-sm"
                style={{
                  backgroundColor: settings.monthdays.includes(day) ? tint + "40" : undefined,
                }}
              >
                {day}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">Dates absent from a month are rest days.</p>
        </>
      )}
      {settings.frequency === "period" && (
        <div className="flex gap-3">
          <input
            type="number"
            aria-label="Days per period"
            min={1}
            max={settings.period === "week" ? 7 : 31}
            className={input}
            value={settings.perPeriod}
            onChange={(event) =>
              patch({
                perPeriod: Math.max(
                  1,
                  Math.min(settings.period === "week" ? 7 : 31, Number(event.target.value) || 1),
                ),
              })
            }
          />
          <select
            aria-label="Period"
            className={input}
            value={settings.period}
            onChange={(event) =>
              patch({
                period: event.target.value as "week" | "month",
                perPeriod: Math.min(settings.perPeriod, event.target.value === "week" ? 7 : 31),
              })
            }
          >
            <option value="week">Per week</option>
            <option value="month">Per month</option>
          </select>
        </div>
      )}
    </section>
  );
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#121212] p-0 text-white sm:max-w-4xl [&>button]:hidden"
      style={{ "--habit-color": tint } as React.CSSProperties}>
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
        <div><DialogTitle className="text-lg font-semibold">{habit ? "Edit habit" : "Create a habit"}</DialogTitle><p className="mt-1 text-xs text-zinc-500">Choose how you want to track your routine.</p></div>
        <button type="button" aria-label="Close habit editor" disabled={busy} onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
      </header>
      <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={(event) => { event.preventDefault(); if (canSave) void save(); }}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><fieldset disabled={busy} className="m-0 grid min-w-0 gap-5 border-0 p-5 sm:grid-cols-2 sm:p-6">
          <div className="min-w-0 space-y-4">
            <section className={section}>
              <label htmlFor="habit-title" className="block text-xs font-medium text-zinc-400">Habit name</label>
              <input autoFocus id="habit-title" className={input} placeholder="e.g. READ EVERY DAY" value={name} onChange={(event) => setName(event.target.value.toUpperCase())} maxLength={80} />
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-zinc-500">Color & icon</span>
                <button type="button" aria-label="Choose habit icon" onClick={() => setThemeOpen(true)} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5">
                  <HabitIcon name={settings.icon} className="h-4 w-4" /><span>Change icon</span>
                </button>
              </div>
              {palette}
            </section>
<section className={section}>
                <h3>Type</h3>
                <AnimatedChoices className="habit-choice-switch" label="Habit type" options={[{ value: "build", label: "Build A Habit" }, { value: "quit", label: "Quit A Habit" }]} value={settings.type} onChange={(type) => {
                  patch({ type: type as "build" | "quit", ...(type === "quit" ? { frequency: "daily" } : {}) });
                  setGoal(type === "quit" ? "0" : "1");
                }} />
                <p className="text-center text-xs text-zinc-500">
                  {settings.type === "quit"
                    ? "Completed by default – only mark the days you slipped. Streak is counted as slip-free days."
                    : "Do it regularly. Tap to mark it done."}
                </p>
              </section>
<section className={section}><h3>Reminder & challenge</h3>                <label className="mt-4 flex items-center justify-between">
                  Set Reminder
                  <input
                    type="checkbox"
                    checked={!!settings.reminder}
                    onChange={(event) => patch({ reminder: event.target.checked ? "09:00" : null })}
                    style={{ accentColor: tint, "--habit-color": tint } as React.CSSProperties}
                    className="h-7 w-11 shrink-0 appearance-none rounded-full border-2 border-white bg-[#121212] before:block before:h-4 before:w-4 before:translate-x-1 before:translate-y-[3px] before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-5"
                  />
                </label>
                {settings.reminder && (
                  <input
                    type="time"
                    aria-label="Reminder time"
                    className={input}
                    value={settings.reminder}
                    onChange={(event) => patch({ reminder: event.target.value })}
                  />
                )}
                <label className="mt-4 block space-y-2">
                  Challenge target (optional)
                  <input
                    className={input}
                    type="number"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    min={1}
                    max={10000}
                    placeholder="70 days"
                  />
                </label>
                <p className="text-xs text-zinc-500">
                  Each completed day counts toward your target.
                </p>
              </section>
          </div>
          <div className="min-w-0 space-y-4">
            {frequency}
<section className={section}>
                <h3>Tracking</h3>
                <AnimatedChoices className="habit-choice-switch" label="Habit tracking" options={[{ value: "tick", label: "Tick" }, { value: "count", label: "Count" }, { value: "checklist", label: "Checklist" }]} value={settings.tracking} onChange={(tracking) => patch({ tracking: tracking as "tick" | "count" | "checklist" })} />
                <p className="text-center text-xs text-zinc-500">
                  {settings.tracking === "tick"
                    ? settings.type === "quit"
                      ? "Tap to mark a slip."
                      : "Tap once to mark the day done."
                    : settings.tracking === "count"
                      ? settings.type === "quit"
                        ? "Log each time — the day stays clean up to your limit."
                        : "Set a daily goal and how much each tap adds."
                      : "Complete every checklist item to finish the day."}
                </p>
                {settings.tracking === "count" && (
                  <>
                    <label className="block space-y-2 text-xs text-zinc-400">
                      {settings.type === "quit" ? "DAILY LIMIT" : "DAILY GOAL (optional)"}
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={settings.type === "quit" ? 0 : 0.001}
                          step="any"
                          className={input}
                          value={goal}
                          onChange={(event) => setGoal(event.target.value)}
                        />
                        <button
                          type="button"
                          className="rounded-xl bg-[#121212] px-4 text-xl"
                          onClick={() =>
                            setGoal(
                              String(Math.max(settings.type === "quit" ? 0 : 1, Number(goal) - 1)),
                            )
                          }
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-[#121212] px-4 text-xl"
                          onClick={() => setGoal(String((Number(goal) || 0) + 1))}
                        >
                          +
                        </button>
                      </div>
                    </label>
                    <label className="block space-y-2 text-xs text-zinc-400">
                      UNIT (optional)
                      <input
                        className={input}
                        value={settings.unit}
                        onChange={(event) => patch({ unit: event.target.value })}
                        maxLength={30}
                        placeholder="km, pages, minutes..."
                      />
                    </label>
                    <label className="block space-y-2 text-xs text-zinc-400">
                      EACH TAP ADDS
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={0.001}
                          step="any"
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          className={input + " min-w-0 flex-1"}
                        />
                        <button
                          type="button"
                          aria-label="Decrease tap amount"
                          className="rounded-xl bg-[#121212] px-4 text-xl"
                          onClick={() =>
                            setAmount(String(Math.max(0.001, (Number(amount) || 1) - 1)))
                          }
                        >
                          −
                        </button>
                        <button
                          type="button"
                          aria-label="Increase tap amount"
                          className="rounded-xl bg-[#121212] px-4 text-xl"
                          onClick={() => setAmount(String((Number(amount) || 0) + 1))}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-center text-xs text-zinc-500">
                        Right-click the habit button to edit its count
                      </p>{" "}
                    </label>
                  </>
                )}
                {settings.tracking === "checklist" && (
                  <>
                    {settings.checklist.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <span>
                          {item.title}
                          {item.reminder ? " · " + item.reminder : ""}
                        </span>
                        <button
                          aria-label={"Remove " + item.title}
                          type="button"
                          onClick={() =>
                            patch({
                              checklist: settings.checklist.filter((value) => value.id !== item.id),
                            })
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setItemName("");
                        setAdding(true);
                      }}
                      style={{ color: tint }}
                    >
                      ＋ Add Checklist
                    </button>
                  </>
                )}
</section>
          </div>
          {!!(message || error) && <p role="alert" className="text-sm text-red-300 sm:col-span-2">{message || error}</p>}
        </fieldset></div>
        <footer className="relative z-10 bg-[#121212] flex shrink-0 items-center justify-end gap-3 border-t border-white/10 px-5 py-4 sm:px-6">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">Cancel</button>
          <button type="submit" disabled={busy || !canSave} aria-busy={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#f9fcf5] px-5 py-2 text-sm font-semibold text-[#111111] disabled:opacity-40">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{busy ? "Saving…" : habit ? "Save changes" : "Create habit"}
          </button>
        </footer>
      </form>
        {themeOpen && (
          <HabitIconSheet
            value={settings.icon}
            tint={tint}
            onSelect={(icon) => patch({ icon })}
            onClose={() => setThemeOpen(false)}
          />
        )}

        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="rounded-3xl border-white/10 bg-[#121212] p-7 text-white">
            <DialogTitle className="text-center">Add Checklist</DialogTitle>
            <input
              autoFocus
              className={input}
              placeholder="Enter Checklist Title"
              value={itemName}
              onChange={(event) => setItemName(event.target.value.toUpperCase())}
              maxLength={80}
            />
            <div className="flex items-center justify-end gap-6">
              <button type="button" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!itemName.trim()}
                onClick={() => {
                  patch({
                    checklist: [
                      ...settings.checklist,
                      { id: crypto.randomUUID(), title: itemName.trim(), reminder: null },
                    ],
                  });
                  setAdding(false);
                }}
                className="rounded-xl px-6 py-3 font-semibold text-black"
                style={{ backgroundColor: tint, color: accentInk(tint) }}
              >
                Add
              </button>
            </div>
          </DialogContent>
        </Dialog>
    </DialogContent>
  </Dialog>;
}
