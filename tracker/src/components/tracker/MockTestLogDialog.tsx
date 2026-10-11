import { useEffect, useState } from "react";
import { todayISO, uid, type TrackerData } from "@/lib/tracker";

const totalMarksByType: Record<string, string> = {
  Sectional: "25",
  Pre: "200",
  Mains: "390",
};

function DarkDropdown({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value)?.label ?? "Select";

  return (
    <div className="relative mt-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-xl bg-[#303030] px-3 text-left text-sm text-zinc-100 outline-none transition hover:bg-[#373737] disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-zinc-500"
      >
        <span>{selected}</span>
        <span className="text-xs text-zinc-500">⌄</span>
      </button>
      {open && !disabled && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-[#242424] py-1 shadow-xl ring-1 ring-white/5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${
                option.value === value ? "text-white" : "text-zinc-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MockTestLogDialog({
  open,
  data,
  onClose,
  onSave,
}: {
  open: boolean;
  data: TrackerData;
  onClose: () => void;
  onSave: (next: TrackerData) => void;
}) {
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id ?? "");
  const [type, setType] = useState("Sectional");
  const [date, setDate] = useState(todayISO());
  const [score, setScore] = useState("");
  const [total, setTotal] = useState("");
  const [accuracy, setAccuracy] = useState("");
  const [error, setError] = useState("");
  const isSectional = type === "Sectional";

  useEffect(() => {
    if (!open) return;
    setSubjectId(data.subjects[0]?.id ?? "");
    setType("Sectional");
    setDate(todayISO());
    setScore("");
    setTotal(totalMarksByType["Sectional"] ?? "25");
    setAccuracy("");
    setError("");
  }, [data.subjects, open]);

  if (!open) return null;
  const field =
    "h-10 w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none transition focus:border-blue-400/70 disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericScore = Number(score);
    const numericTotal = Number(total);
    const numericAccuracy = Number(accuracy);
    if (!date || (isSectional && !subjectId) || !score || !total || !accuracy) {
      setError("Fill all required fields.");
      return;
    }
    if (
      !Number.isFinite(numericScore) ||
      !Number.isFinite(numericTotal) ||
      !Number.isFinite(numericAccuracy) ||
      numericTotal <= 0 ||
      numericScore < 0 ||
      numericScore > numericTotal ||
      numericAccuracy < 0 ||
      numericAccuracy > 100
    ) {
      setError("Enter a valid score and accuracy.");
      return;
    }
    const next = structuredClone(data);
    next.tests.log.unshift({
      id: uid(),
      date,
      createdAt: new Date().toISOString(),
      subjectId: isSectional ? subjectId : "__all__",
      type,
      score: numericScore,
      total: numericTotal,
      accuracy: numericAccuracy,
      notes: "",
    });
    onSave(next);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-mock-test-title"
        className="mock-test-dialog w-full max-w-lg rounded-2xl border border-white/10 bg-[#1c1c1c] p-5 text-zinc-100 shadow-2xl"
      >
        <p className="font-mono text-[11px] tracking-[0.18em] text-blue-300 uppercase">Mock test</p>
        <h2 id="log-mock-test-title" className="mt-1 text-xl font-semibold">
          Log mock test
        </h2>
        <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <label className="text-sm text-zinc-300">
            Test type
            <DarkDropdown
              value={type}
              options={["Sectional", "Pre", "Mains"].map((option) => ({
                value: option,
                label: option,
              }))}
              onChange={(nextType) => {
                setType(nextType);
                setTotal(totalMarksByType[nextType] ?? "");
                if (nextType === "Sectional") setSubjectId(data.subjects[0]?.id ?? "");
              }}
            />
          </label>
          <label className="text-sm text-zinc-300">
            Subject
            <DarkDropdown
              value={isSectional ? subjectId : "__all__"}
              options={[
                ...(!isSectional ? [{ value: "__all__", label: "All subjects" }] : []),
                ...data.subjects.map((subject) => ({ value: subject.id, label: subject.name })),
              ]}
              onChange={setSubjectId}
              disabled={!isSectional}
            />
          </label>
          <label className="text-sm text-zinc-300">
            Date
            <input
              className={`${field} mt-1.5`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="text-sm text-zinc-300">
            Score
            <input
              className={`${field} mt-1.5`}
              type="number"
              min="0"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              required
            />
          </label>
          <label className="text-sm text-zinc-300">
            Total marks
            <input
              className={`${field} mt-1.5`}
              type="number"
              min="1"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              required
            />
          </label>
          <label className="text-sm text-zinc-300">
            Accuracy %
            <input
              className={`${field} mt-1.5`}
              type="number"
              min="0"
              max="100"
              value={accuracy}
              onChange={(e) => setAccuracy(e.target.value)}
              required
            />
          </label>
          {error && <p className="sm:col-span-2 text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/8 px-3 py-2 text-sm text-zinc-200 hover:bg-white/12"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-400"
            >
              Save mock test
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
