import { useEffect, useState } from "react";
import { todayISO, uid, type TrackerData } from "@/lib/tracker";

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
    setTotal("");
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
      setError("Score must be within total marks, and accuracy must be between 0% and 100%.");
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
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1c1c1c] p-5 text-zinc-100 shadow-2xl"
      >
        <p className="font-mono text-[11px] tracking-[0.18em] text-blue-300 uppercase">Mock test</p>
        <h2 id="log-mock-test-title" className="mt-1 text-xl font-semibold">
          Log mock test
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Add the result to track your marks and accuracy.
        </p>
        <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <label className="text-sm text-zinc-300">
            Test type
            <select
              className={`${field} mt-1.5`}
              value={type}
              onChange={(event) => {
                const nextType = event.target.value;
                setType(nextType);
                if (nextType === "Sectional") setSubjectId(data.subjects[0]?.id ?? "");
              }}
            >
              <option>Sectional</option>
              <option>Pre</option>
              <option>Mains</option>
            </select>
          </label>
          <label className="text-sm text-zinc-300">
            Subject
            <select
              className={`${field} mt-1.5`}
              value={isSectional ? subjectId : "__all__"}
              onChange={(event) => setSubjectId(event.target.value)}
              disabled={!isSectional}
              required={isSectional}
            >
              {!isSectional && <option value="__all__">All subjects</option>}
              {data.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
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
          {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
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
