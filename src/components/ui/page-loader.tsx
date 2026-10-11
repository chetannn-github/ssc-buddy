import { LoaderCircle } from "lucide-react";

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-[#f7f9fc] text-slate-600">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}
