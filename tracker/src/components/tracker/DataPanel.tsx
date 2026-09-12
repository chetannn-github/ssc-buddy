import { useRef, useState } from "react";
import { useTracker } from "@/lib/tracker-store";
import { IMPORT_PROMPT, type TrackerData } from "@/lib/tracker";
import { GhostButton, Label } from "./ui";

export function DataPanel() {
  const { data, replace, reset } = useTracker();
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ssc-cgl-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const applyJson = (raw: string) => {
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
      const parsed = JSON.parse(cleaned) as TrackerData;
      replace(parsed);
      setMsg("Data imported.");
      setText("");
      setImporting(false);
    } catch {
      setMsg("That doesn't look like valid JSON. Paste the raw JSON only.");
    }
  };

  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>Data</Label>
        <div className="flex flex-wrap gap-2">
          <GhostButton onClick={exportJson}>Export JSON</GhostButton>
          <GhostButton
            onClick={() => {
              setImporting((v) => !v);
              setMsg("");
            }}
          >
            Import JSON
          </GhostButton>
          <GhostButton
            tone="danger"
            onClick={() => {
              if (window.confirm("Reset all tracker data to defaults?")) reset();
            }}
          >
            Reset
          </GhostButton>
        </div>
      </div>
      <p className="mt-3 font-mono text-[13px] text-muted-foreground">
        Saved in this browser only. Export a backup regularly.
      </p>

      {importing && (
        <div className="mt-4 space-y-4 rounded-2xl bg-card p-4 sm:p-5">
          <div>
            <Label>Option 1 · Upload a JSON file</Label>
            <div className="mt-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) applyJson(await f.text());
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <GhostButton tone="blue" onClick={() => fileRef.current?.click()}>
                Choose file
              </GhostButton>
            </div>
          </div>

          <div>
            <Label>Option 2 · Paste JSON</Label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder='{ "version": 1, "subjects": [...] }'
              className="mt-2 w-full rounded-2xl bg-track p-3 font-mono text-[13px] text-foreground outline-none focus:ring-2 focus:ring-accent-blue/40"
            />
            <GhostButton tone="blue" onClick={() => applyJson(text)}>
              Import pasted JSON
            </GhostButton>
          </div>

          <div>
            <Label>Option 3 · Build the JSON with ChatGPT</Label>
            <p className="mt-2 text-sm text-muted-foreground">
              Copy this prompt, paste it into ChatGPT along with photos of your chapters and lecture
              counts, then paste the JSON it returns above.
            </p>
            <div className="mt-2 flex gap-2">
              <GhostButton
                tone="blue"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(IMPORT_PROMPT);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setMsg("Copy failed — select the prompt below and copy manually.");
                  }
                }}
              >
                {copied ? "Copied ✓" : "Copy ChatGPT prompt"}
              </GhostButton>
            </div>
            <pre className="mt-3 max-h-48 overflow-auto rounded-2xl bg-track p-3 font-mono text-[12px] whitespace-pre-wrap text-muted-foreground">
              {IMPORT_PROMPT}
            </pre>
          </div>

          {msg && <p className="font-mono text-[13px] text-foreground">{msg}</p>}
        </div>
      )}
    </div>
  );
}
