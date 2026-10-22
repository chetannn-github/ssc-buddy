import { useEffect, useState, type CSSProperties } from "react";
import type { User } from "firebase/auth";
import { observeAuth, watchProfileAccent } from "../lib/firebase";
import { removeDesktopHabit, type DesktopHabitPin } from "../lib/desktop-habit-widgets";
import { normalizeAppAccent, accentInk } from "../../../mobile-tasks/src/domain/app-accent";
import { BrowserStudyLock } from "./BrowserStudyLock";

export function PinnedStudyWindow({ pin }: { pin: DesktopHabitPin }) {
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false);
  const [accent, setAccent] = useState(() => normalizeAppAccent(undefined));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => observeAuth(next => { setUser(next); setReady(true); }), []);
  useEffect(() => user?.uid === pin.uid ? watchProfileAccent(user, value => setAccent(normalizeAppAccent(value))) : undefined, [user, pin.uid]);
  useEffect(() => { document.body.classList.add("pinned-habit-body", "pinned-study-body"); return () => document.body.classList.remove("pinned-habit-body", "pinned-study-body"); }, []);
  useEffect(() => {
    const close = () => setMenu(null);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("blur", close); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("blur", close); window.removeEventListener("keydown", key); };
  }, []);
  // Portal dialogs inherit the same account accent as the compact card.
  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty("--accent", accent); style.setProperty("--accent-ink", accentInk(accent)); style.setProperty("--glow-accent", accent);
  }, [accent]);
  const remove = () => { void removeDesktopHabit().catch(() => setError("Could not remove widget.")); };
  return <main className="study-desktop-card" style={{ "--accent": accent, "--glow-accent": accent } as CSSProperties} onContextMenu={event => {
    event.preventDefault(); setMenu({ x: Math.max(6, Math.min(innerWidth - 176, event.clientX)), y: Math.max(6, Math.min(innerHeight - 54, event.clientY)) });
  }}>
    <div className="accent-top-glow" aria-hidden="true" />
    {!ready ? <p className="study-desktop-message">Loading…</p> : user?.uid === pin.uid ? <BrowserStudyLock uid={user.uid} desktop /> : <div className="study-desktop-message"><b data-tauri-drag-region>Study Lock</b><p>Sign in to your account in the main widget.</p></div>}
    {error && <p className="browser-study-error" role="alert">{error}</p>}
    {menu && <div className="pinned-context-dismiss" onPointerDown={() => setMenu(null)}><div role="menu" className="task-context-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={event => event.stopPropagation()}><button role="menuitem" onClick={remove}>Remove widget</button></div></div>}
  </main>;
}
