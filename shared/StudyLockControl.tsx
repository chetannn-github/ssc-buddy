import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Firestore } from "firebase/firestore";
import { watchStudyControl, watchStudyDevices, startStudySession, type StudyControl, type StudyDevice, normalizeStudyDomain, saveStudyWebsites } from "./study-lock";
import { StudyDurationPicker } from "./StudyDurationPicker";
import { Clock3, Globe2, MonitorUp, Monitor, Plus, LockKeyhole, X } from "lucide-react";
type Session = { endsAt: number; domains: string[] };
type Status = { session: Session | null; connected: number; protected: number };
const remaining = (endsAt: number) => {
  const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
export function StudyLockControl({ uid, desktop = false, profile = false, getDatabase, source = "windows", onResize, onPin }: { uid: string; desktop?: boolean; profile?: boolean; getDatabase: () => Firestore; source?: string; onResize?: (expanded: boolean) => Promise<void>; onPin?: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [status, setStatus] = useState<Status | null>(null);
  const [minutes, setMinutes] = useState("25"), [domains, setDomains] = useState(() => typeof localStorage === "undefined" ? "" : localStorage.getItem(`ssc-browser-allowlist:${uid}`) ?? "chatgpt.com");
  const [website, setWebsite] = useState(""), [pickingTime, setPickingTime] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const resizeSequence = useRef(Promise.resolve());
  useEffect(() => {
    if (!desktop || !onResize) return;
    resizeSequence.current = resizeSequence.current.catch(() => undefined).then(() => onResize(open)).catch(() => { setError("Could not resize Study Lock."); });
  }, [desktop, open, onResize]);
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    setStatus(null);
    const db = getDatabase(); let control: StudyControl | null = null, devices: StudyDevice[] = [];
    const refresh = () => {
      const session = control?.session && control.session.endsAt > Date.now() ? control.session : null;
      const connected = devices.filter(device => Date.now() - device.lastSeenAt < 90000);
      setStatus({ session, connected: connected.length, protected: session ? connected.filter(device => device.sessionId === session.id && !device.error).length : 0 });
    };
    const failed = (e: Error) => setError(/firebase/i.test(e.message) ? "Could not load your study session. Please try again." : e.message);
    const stopControl = watchStudyControl(db, uid, value => { control = value; if (Array.isArray(value?.allowedDomains)) setDomains(value.allowedDomains.slice(0, 3).join("\n")); refresh(); }, failed);
    const stopDevices = watchStudyDevices(db, uid, value => { devices = value; refresh(); }, failed);
    const timer = setInterval(refresh, 1000);
    return () => { stopControl(); stopDevices(); clearInterval(timer); };
  }, [uid, getDatabase]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (pickingTime) setPickingTime(false); else setOpen(false); }
      if (event.key === "Tab") {
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]') ?? []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); trigger.current?.focus(); };
  }, [open, pickingTime]);
  const websites = domains.split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
  const addWebsite = () => {
    if (!website.trim()) return;
    try {
      const domain = normalizeStudyDomain(website.trim());
      if (websites.length >= 3 && !websites.includes(domain)) throw Error("Maximum 3 websites per session.");
      const next = [...new Set([...websites, domain])].join("\n");
      setDomains(next); setWebsite(""); setError(""); localStorage.setItem(`ssc-browser-allowlist:${uid}`, next);
      void run(() => saveStudyWebsites(getDatabase(), uid, next.split("\n").filter(Boolean), source));
    } catch (e) { setError(e instanceof Error ? e.message : "Enter a domain like parmar.com."); }
  };
  const session = status?.session;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); try { await action(); } catch (e) { const message = String(e); setError(/firebase/i.test(message) ? "Could not update your study session. Please try again." : message); } finally { setBusy(false); }
  };
  return <>
    {desktop ? <section className="study-desktop-content">
      <div className="study-desktop-heading"><span data-tauri-drag-region><LockKeyhole size={14} />Study Lock</span><button className="study-desktop-settings" aria-label="Study Lock settings" onClick={() => setOpen(true)}><Clock3 size={16} /></button></div>
      <strong className="study-desktop-time">{session ? remaining(session.endsAt) : "Ready to focus"}</strong>
      <div className="study-desktop-sites">{(session?.domains ?? websites).map(domain => <span key={domain} title={domain}>{domain}</span>)}</div>
      <div className="study-desktop-footer"><span><i className={status?.connected ? "connected" : ""} />{status?.connected ? status.connected + " connected" : "No browser connected"}</span><button ref={trigger} onClick={() => setOpen(true)}>{session ? "View session" : "Set up session"}</button></div>
    </section> : <button ref={trigger} className={`browser-study-trigger ${profile ? "study-profile-trigger" : "icon-button"} ${session ? "active" : ""}`} aria-label="Study Lock" title={session ? `Study Lock - ${remaining(session.endsAt)}` : "Study Lock"} onClick={() => setOpen(true)}><LockKeyhole size={17} />{profile && <><span>Study Lock</span><small>{session ? remaining(session.endsAt) : "Set up session"}</small></>}{session && !profile && <i aria-hidden="true" />}</button>}

    {open && createPortal(<div className="browser-study-overlay" onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }} onContextMenu={e => e.stopPropagation()}>
      <section ref={dialog} className={`browser-study-dialog ${session && !pickingTime ? "is-running" : ""}`} role="dialog" aria-modal="true" aria-labelledby="browser-study-title">
        {pickingTime && !session ? <StudyDurationPicker minutes={Number(minutes)} onCancel={() => setPickingTime(false)} onConfirm={value => { setMinutes(String(value)); setPickingTime(false); }} /> : <>
        <div className="browser-study-heading"><h2 id="browser-study-title">Browser Study Lock</h2>{onPin && <button aria-label="Add Study Lock desktop widget" title="Add desktop widget" disabled={busy} onClick={() => void run(() => onPin())}><MonitorUp size={17} /></button>}<button aria-label="Close Study Lock" onClick={() => setOpen(false)}><X size={18} /></button></div>
        <div className={`browser-study-connection ${status?.connected ? "connected" : ""}`} role="status"><Monitor size={12} /><i /><span>{status?.connected ? `${status.connected} connected` : "No browser connected"}</span>{session && <span>{status?.protected ? "Protected" : "Connecting..."}</span>}</div>
        {session ? <>
          <div className="browser-study-live-time">{remaining(session.endsAt)}</div>
          <div className="browser-study-domains">{session.domains.map(domain => <span key={domain} title={domain}>{domain}</span>)}</div>
        </> : <>
          <div className="study-websites"><h3>Allowed websites <small>{websites.length}/3</small></h3>
            <div className="study-domain-entry"><Globe2 size={15} /><input aria-label="Website domain" value={website} onChange={event => setWebsite(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addWebsite(); } }} placeholder="parmar.com" spellCheck={false} autoCapitalize="none" /><button aria-label="Add website" disabled={!website.trim() || busy || websites.length >= 3} onClick={addWebsite}><Plus size={17} /></button></div>
            <div className="study-domain-chips">{websites.map(domain => <span key={domain} title={domain}>{domain}<button aria-label={`Remove ${domain}`} onClick={() => { const next = websites.filter(value => value !== domain).join("\n"); setDomains(next); localStorage.setItem(`ssc-browser-allowlist:${uid}`, next); void run(() => saveStudyWebsites(getDatabase(), uid, next.split("\n").filter(Boolean))); }}><X size={12} /></button></span>)}</div>
          </div>
          <button className="study-duration-trigger" onClick={() => setPickingTime(true)}><Clock3 size={17} /><span>Study time</span><strong>{Number(minutes) >= 60 ? `${Math.floor(Number(minutes) / 60)}h ${Number(minutes) % 60 ? `${Number(minutes) % 60}m` : ""}` : `${minutes} min`}</strong></button>
          <button className="browser-study-primary" disabled={busy || !status?.connected || !websites.length || !!website.trim()} onClick={() => void run(async () => {
            const duration = Number(minutes); if (!Number.isInteger(duration) || duration < 1 || duration > 720) throw Error("Choose 1–720 minutes.");
            await startStudySession(getDatabase(), uid, duration, websites, source); localStorage.setItem(`ssc-browser-allowlist:${uid}`, domains);
          })}>{busy ? "Please wait…" : "Start study lock"}</button>
        </>}
        {error && <p className="browser-study-error" role="alert">{error}</p>}
        </>}
      </section>
    </div>, document.body)}
  </>;
}
