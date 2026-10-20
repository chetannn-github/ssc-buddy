import { HabitIconSheet } from "./HabitIconSheet";
import { HabitIcon } from "./HabitIcon";
import { useRef, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { requestHabitReminders } from "@/lib/habit-reminders";
import {
  HABIT_COLORS,
  HABIT_COLOR_COLUMNS,
  HABIT_ICONS,
  HABIT_SYMBOLS,
  HABIT_FREQUENCIES,
  habitDetails,
  habitFormDetails,
  canSaveHabit,
  normalizeHabitSettings,
  validateHabitSettings,
  type Habit,
  type HabitColor,
  type HabitSettings,
  type HabitSaveDetails,
} from "../../../mobile-tasks/src/domain/habits";
const input =
  "w-full rounded-xl border border-white/10 bg-[#0e0e0e] px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-yellow-300";
const section = "space-y-2.5 rounded-2xl bg-[#0e0e0e] p-3 text-sm";
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
    [step, setStep] = useState(3),
    [message, setMessage] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
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
  const next = () => {
    if (!name.trim()) {
      setMessage("Enter a habit title.");
      return;
    }
    if (
      step === 2 &&
      ((settings.frequency === "weekdays" && !settings.weekdays.length) ||
        (settings.frequency === "monthdays" && !settings.monthdays.length))
    ) {
      setMessage("Select at least one day.");
      return;
    }
    setMessage("");
    setStep(step + 1);
  };
  const toggleDay = (key: "weekdays" | "monthdays", day: number) =>
    patch({
      [key]: settings[key].includes(day)
        ? settings[key].filter((value) => value !== day)
        : [...settings[key], day],
    });
  const palette = (
    <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-2xl bg-[#101010] p-3">
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
  const theme = (
    <>
      <div className="flex items-center gap-4 rounded-3xl bg-[#101010] p-4">
        <span
          className="grid h-10 w-10 place-items-center rounded-full text-2xl"
          style={{ backgroundColor: tint + "18", color: tint }}
        >
          <HabitIcon name={settings.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name || "Your habit"}</p>
          <p className="text-xs text-zinc-500">
            {target ? target + " day challenge" : "Build your routine"}
          </p>
        </div>
        <span
          className="grid h-10 w-10 place-items-center rounded-full text-black"
          style={{ backgroundColor: tint }}
        >
          <Check />
        </span>
      </div>
      <label className="block space-y-3">
        <span>Select Habit Color</span>
        <span className="flex gap-4 rounded-3xl bg-[#101010] p-4">
          {(Object.keys(HABIT_COLORS) as HabitColor[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              aria-pressed={color === option}
              onClick={() => setColor(option)}
              className="h-9 w-9 rounded-full"
              style={{
                backgroundColor: HABIT_COLORS[option],
                outline: color === option ? "3px solid white" : undefined,
              }}
            />
          ))}
        </span>
      </label>
      <div className="space-y-3">
        <p>Select Habit Icon</p>
        <div className="grid grid-cols-7 gap-3 rounded-3xl bg-[#101010] p-4">
          {HABIT_ICONS.map((icon, index) => (
            <button
              type="button"
              key={icon}
              aria-label={icon}
              aria-pressed={settings.icon === icon}
              onClick={() => patch({ icon })}
              className="grid h-9 place-items-center rounded-lg text-xl"
              style={{
                color: settings.icon === icon ? tint : "white",
                backgroundColor: settings.icon === icon ? tint + "20" : undefined,
              }}
            >
              <HabitIcon name={icon} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
  const frequency = (
    <section className="space-y-1 rounded-2xl bg-[#0e0e0e] px-3 py-2.5 text-sm">
      <h3 className="mb-1.5">Frequency</h3>
      {(Object.keys(HABIT_FREQUENCIES) as HabitSettings["frequency"][]).map((key) => (
        <label
          key={key}
          className="flex cursor-pointer items-center gap-2.5 py-1.5 disabled:opacity-30"
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
          {HABIT_FREQUENCIES[key]}
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none sm:h-auto sm:max-h-[94dvh] sm:rounded-lg flex-col gap-0 overflow-hidden border-white/10 bg-black p-0 text-white sm:max-w-xl [&>button]:hidden">
        <header className="flex shrink-0 items-center gap-3 px-4 py-3">
          <button type="button" aria-label="Back" disabled={busy} onClick={onClose}>
            <ArrowLeft />
          </button>
          <DialogTitle className="flex-1 text-lg font-normal">
            {habit ? "Edit Habit" : "Add Habit"}
          </DialogTitle>
          {step === 3 && (
            <button
              type="button"
              disabled={busy || !canSave}
              aria-busy={busy}
              onClick={() => void save()}
              className="flex items-center gap-2 disabled:opacity-40"
            >
              {busy ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  Save <Check />
                </>
              )}
            </button>
          )}
        </header>
        {!habit && step < 3 && (
          <div className="mx-6 h-2 shrink-0 overflow-hidden rounded-full bg-[#202020]">
            <div
              className="h-full rounded-full bg-[#ffe000] transition-all"
              style={{ width: (step + 1) * 25 + "%" }}
            />
          </div>
        )}
        <fieldset
          disabled={busy}
          className="min-h-0 min-w-0 w-full space-y-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-3 sm:p-5"
        >
          {step === 0 ? (
            <div className="flex min-h-[45vh] flex-col">
              <h2 className="mt-8 text-center text-3xl font-bold">
                What Habit Do You Want To Track?
              </h2>
              <label className="my-auto block space-y-3">
                <span className="text-lg">Habit Title</span>
                <input
                  autoFocus
                  className={input + " border-yellow-300"}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  placeholder="Wake Up Early"
                />
              </label>
            </div>
          ) : step === 1 ? (
            <>
              <h2 className="py-4 text-center text-2xl font-bold">Customize Tracker Theme</h2>
              {theme}
            </>
          ) : step === 2 ? (
            <>
              <h2 className="py-8 text-center text-2xl font-bold">
                How often do you want to do this habit?
              </h2>
              {frequency}
            </>
          ) : (
            <>
              <input
                aria-label="Habit title"
                className={input}
                placeholder="Enter Habit Title"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />

              <div className="flex items-center gap-10 py-1">
                <button
                  type="button"
                  aria-label="Choose habit color"
                  onClick={() => setColorsOpen((value) => !value)}
                  className="flex items-center gap-3"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#101010]">
                    <span className="h-5 w-5 rounded-full" style={{ backgroundColor: tint }} />
                  </span>
                  Color
                </button>
                <button
                  type="button"
                  aria-label="Choose habit icon"
                  onClick={() => setThemeOpen(true)}
                  className="flex items-center gap-3"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#101010]">
                    <HabitIcon name={settings.icon} className="h-5 w-5" />
                  </span>
                  Icon
                </button>
              </div>
              {colorsOpen && palette}
              <section className={section}>
                <h3>Type</h3>
                <div className="flex gap-3">
                  {(["build", "quit"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      className="flex-1 rounded-xl bg-[#1b1b1b] px-3 py-2.5 font-semibold"
                      style={{ backgroundColor: settings.type === type ? tint + "40" : undefined }}
                      onClick={() => {
                        patch({ type, ...(type === "quit" ? { frequency: "daily" } : {}) });
                        setGoal(type === "quit" ? "0" : "1");
                      }}
                    >
                      {type === "build" ? "Build A Habit" : "Quit A Habit"}
                    </button>
                  ))}
                </div>
                <p className="text-center text-xs text-zinc-500">
                  {settings.type === "quit"
                    ? "Completed by default – only mark the days you slipped. Streak is counted as slip-free days."
                    : "Do it regularly. Tap to mark it done."}
                </p>
              </section>
              {frequency}
              <section className={section}>
                <h3>Tracking</h3>
                <div className="flex gap-3">
                  {(["tick", "count", "checklist"] as const).map((tracking) => (
                    <button
                      type="button"
                      key={tracking}
                      disabled={false}
                      className="flex-1 rounded-xl bg-[#1b1b1b] py-3 capitalize disabled:opacity-30"
                      style={{
                        backgroundColor: settings.tracking === tracking ? tint + "40" : undefined,
                      }}
                      onClick={() => patch({ tracking })}
                    >
                      {tracking}
                    </button>
                  ))}
                </div>
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
                          className="rounded-xl bg-[#1b1b1b] px-4 text-xl"
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
                          className="rounded-xl bg-[#1b1b1b] px-4 text-xl"
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
                          className="rounded-xl bg-[#1b1b1b] px-4 text-xl"
                          onClick={() =>
                            setAmount(String(Math.max(0.001, (Number(amount) || 1) - 1)))
                          }
                        >
                          −
                        </button>
                        <button
                          type="button"
                          aria-label="Increase tap amount"
                          className="rounded-xl bg-[#1b1b1b] px-4 text-xl"
                          onClick={() => setAmount(String((Number(amount) || 0) + 1))}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-center text-xs text-zinc-500">
                        Long press opens the count editor
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
                <label className="mt-4 flex items-center justify-between">
                  Set Reminder
                  <input
                    type="checkbox"
                    checked={!!settings.reminder}
                    onChange={(event) => patch({ reminder: event.target.checked ? "09:00" : null })}
                    style={{ accentColor: tint, "--habit-color": tint } as React.CSSProperties}
                    className="h-7 w-11 shrink-0 appearance-none rounded-full border-2 border-white bg-black before:block before:h-4 before:w-4 before:translate-x-1 before:translate-y-[3px] before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-5"
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
            </>
          )}
          {!!(message || error) && (
            <p role="alert" className="text-sm text-red-300">
              {message || error}
            </p>
          )}
        </fieldset>
        {!habit && step < 3 && (
          <footer className="flex shrink-0 items-center gap-5 p-6">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="flex-1 rounded-full bg-[#ffe000] py-4 text-lg font-bold text-black"
            >
              Next
            </button>
          </footer>
        )}
        {themeOpen && (
          <HabitIconSheet
            value={settings.icon}
            tint={tint}
            onSelect={(icon) => patch({ icon })}
            onClose={() => setThemeOpen(false)}
          />
        )}

        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="rounded-3xl border-white/10 bg-[#101010] p-7 text-white">
            <DialogTitle className="text-center">Add Checklist</DialogTitle>
            <input
              autoFocus
              className={input}
              placeholder="Enter Checklist Title"
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
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
                style={{ backgroundColor: tint }}
              >
                Add
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
