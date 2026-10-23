import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { watchPublicStudyFocus } from "@/lib/web-focus-reader";
import { focusDayKey, formatFocusTime } from "../../../shared/study-focus";

export function PublicFocusTime({ uid, username }: { uid: string; username: string }) {
  const [focus, setFocus] = useState<{ days: Record<string, number>; timeZone: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setFocus(null);
    return watchPublicStudyFocus(getFirebaseFirestore(), uid, username, setFocus, () => setFocus(null));
  }, [uid, username]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  return <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm">
    <Clock3 className="h-4 w-4 text-zinc-400" /><span className="text-zinc-300">Today’s focus</span>
    <strong className="ml-auto text-zinc-100">{focus ? formatFocusTime(focus.days[focusDayKey(now, focus.timeZone)] ?? 0) : "—"}</strong>
  </div>;
}
