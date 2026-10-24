import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LockKeyhole, PenLine } from "lucide-react";
import { useAuthUser } from "@/lib/auth-context";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { watchStudyControl, settleStudyFocus, type StudySession } from "../../shared/study-lock";
import { SlotTime } from "../../shared/SlotTime";
import "../../shared/study-lock.css";
import "./focus-session.css";

const PracticeSession = lazy(() => import("@/routes/test").then(module => ({ default: module.PracticeSession })));

export function FocusSessionGate({ children }: { children: ReactNode }) {
  const user = useAuthUser();
  const [session, setSession] = useState<StudySession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [practice, setPractice] = useState(false);
  const [image, setImage] = useState("/avatars/1.jpg");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setSession(null);
    if (!user) return;
    return watchStudyControl(getFirebaseFirestore(), user.uid, value => setSession(value?.session ?? null), () => {});
  }, [user?.uid]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const active = !!session && session.endsAt > now;
  const openPractice = useCallback(() => {
    if (!active || practice) return;
    window.history.pushState({ ...window.history.state, focusPractice: true }, "", window.location.href);
    setPractice(true);
  }, [active, practice]);
  useEffect(() => {
    window.addEventListener("ssc-focus-practice", openPractice);
    return () => window.removeEventListener("ssc-focus-practice", openPractice);
  }, [openPractice]);
  useEffect(() => {
    const back = () => setPractice(false);
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    if (!session || !user) return;
    void settleStudyFocus(getFirebaseFirestore(), user.uid, session).catch(() => {});
  }, [session?.id, user?.uid, Math.floor(now / 60000), active]);
  useEffect(() => {
    if (!active) { setPractice(false); return; }
    dialog.current?.showModal();
    window.dispatchEvent(new Event("ssc-music-pause"));
    let cancelled = false;
    void fetch("/avatars/manifest.json").then(r => r.json()).then((files: string[]) => {
      const file = files[Math.floor(Math.random() * files.length)];
      if (!cancelled && file) setImage(`/avatars/${encodeURIComponent(file)}`);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [active, session?.id]);
  const seconds = session ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : 0;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <>
    <div inert={active}>{children}</div>
    {active && <dialog ref={dialog} className="focus-session-gate" onCancel={event => event.preventDefault()} aria-label="Focus session active">
      {practice ? <div style={{ position: "relative" }}><Suspense fallback={<p className="p-6">Loading practice session…</p>}><PracticeSession focusLocked /></Suspense></div> : <div className="focus-session-center">
        <div className="focus-session-image"><img src={image} alt="Motivational image" /></div>
        <section className="focus-session-details">
          <div className="focus-session-brand"><LockKeyhole size={17} aria-hidden="true" />Focus Lock</div>
          <p className="focus-session-eyebrow">ONE SESSION. ONE STEP CLOSER.</p>
          <h1>Your goals deserve this time.</h1>
          <div className="focus-session-timer"><SlotTime value={time} /></div>
          <button onClick={openPractice}><PenLine size={18} aria-hidden="true" />Practice session</button>
        </section>
      </div>}
    </dialog>}
  </>;
}
