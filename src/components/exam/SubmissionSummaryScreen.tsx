import { ArrowLeft, Check, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/exam";

export function SubmissionSummaryScreen({ title, count, attempted, seconds, elapsed, onBack, onSubmit }: {
  title: string; count: number; attempted: number; seconds: number; elapsed: number;
  onBack: () => void; onSubmit: () => void;
}) {
  return <section aria-label="Session summary" className="card-surface mx-auto max-w-3xl overflow-hidden">
    <div className="border-b border-border px-5 py-4 sm:px-6">
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Before you submit</p>
      <h1 className="mt-1 text-xl font-semibold">Session summary</h1>
      <p className="mt-1 text-sm text-muted-foreground">{title}</p>
    </div>
    <div className="space-y-6 px-5 py-6 sm:px-6">
      <div><p className="text-5xl font-semibold tabular-nums">{attempted}<span className="text-2xl text-muted-foreground">/{count}</span></p><p className="mt-2 text-sm text-muted-foreground">Questions attempted</p></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground transition-[width]" style={{width:`${count ? attempted / count * 100 : 0}%`}} /></div>
      <dl className="grid grid-cols-3 gap-2">{[["Total",count],["Attempted",attempted],["Unattempted",Math.max(0,count-attempted)]].map(([label,value]) => <div key={label}><dd className="text-2xl font-semibold tabular-nums">{value}</dd><dt className="mt-1 text-xs text-muted-foreground">{label}</dt></div>)}</dl>
      <div className="space-y-3 border-t border-border pt-5 text-sm">
        <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" />Time spent</span><span className="font-medium tabular-nums">{formatClock(elapsed)}</span></div>
        <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Time left</span><span className="font-medium tabular-nums">{formatClock(seconds)}</span></div>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
      <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" />Keep solving</Button>
      <Button className="bg-[#f9fcf5] text-[#111] hover:bg-white/90" onClick={onSubmit}><Check className="h-4 w-4" />Submit session</Button>
    </div>
  </section>;
}
