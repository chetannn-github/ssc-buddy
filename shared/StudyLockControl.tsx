import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Firestore } from "firebase/firestore";
import { watchStudyControl, watchStudyDevices, watchStudyFocusDay, recordStudyFocus, type StudySession, startStudySession, type StudyControl, type StudyDevice, normalizeStudyDomain, saveStudyWebsites, pauseStudySession, resumeStudySession } from "./study-lock";
import { emptyFocusDay, focusDayKey, todayFocusMilliseconds, formatFocusMinutes, formatFocusTime, type FocusDay } from "./study-focus";
import { SlotTime } from "./SlotTime";
import { AnimatedChoices } from "./AnimatedChoices";
import { StudyDurationPicker } from "./StudyDurationPicker";
import { publishStudyFocusDay } from "./study-lock";
import { MAX_STUDY_WEBSITES } from "./study-selection";
import { Clock3, Globe2, MonitorUp, Monitor, Pause, Play, Plus, LockKeyhole, X } from "lucide-react";
type Session = { endsAt: number; domains: string[]; paused?: boolean; remainingMs?: number };
type Status = { session: Session | null; connected: number; protected: number };
const remaining = (session: Session | number) => {
  const seconds = Math.max(0, Math.ceil((typeof session === "number" ? session - Date.now() : session.paused ? Number(session.remainingMs) || 0 : session.endsAt - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
export function StudyLockControl({ uid, desktop = false, profile = false, getDatabase, source = "windows", onResize, onPin, lockedImage, onPracticeSession }: { uid: string; desktop?: boolean; profile?: boolean; getDatabase: () => Firestore; source?: string; onResize?: (expanded: boolean) => Promise<void>; onPin?: () => Promise<void>; lockedImage?: string; onPracticeSession?: () => void }) {
  const [open, setOpen] = useState(false), [status, setStatus] = useState<Status | null>(null);
  const [minutes, setMinutes] = useState("25"), [domains, setDomains] = useState(() => typeof localStorage === "undefined" ? "" : localStorage.getItem(`ssc-browser-allowlist:${uid}`) ?? "chatgpt.com");
  const [website, setWebsite] = useState(""), [pickingTime, setPickingTime] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now()), [focusData, setFocusData] = useState<FocusDay>(emptyFocusDay);
  const [focusSession, setFocusSession] = useState<StudySession | null>(null);
  const lastFinalCredit = useRef("");
  const date = focusDayKey(now, focusSession?.timeZone);
  const checkpoint = Math.floor(now / 60000), ended = !!focusSession && !focusSession.paused && now >= focusSession.endsAt;
  useEffect(() => {
    setFocusData(emptyFocusDay());
    return watchStudyFocusDay(getDatabase(), uid, date, setFocusData, () => setError("Could not load today's focus time."));
  }, [uid, date, getDatabase]);
  useEffect(() => {
    if (!focusSession || (ended && lastFinalCredit.current === focusSession.id)) return;
    void recordStudyFocus(getDatabase(), uid, focusSession).then(() => { if (ended) lastFinalCredit.current = focusSession.id; }).catch(() => { /* Retry the next checkpoint, including after reconnect. */ });
  }, [uid, focusSession?.id, checkpoint, ended, getDatabase]);
  const todayFocus = todayFocusMilliseconds(focusData, focusSession, now);
  useEffect(() => { void publishStudyFocusDay(getDatabase(), uid, date, focusSession?.timeZone).catch(() => {}); }, [uid, date, focusData.totalMilliseconds, checkpoint, getDatabase]);
  const resizeSequence = useRef(Promise.resolve());
  useEffect(() => {
    if (!desktop || !onResize) return;
    resizeSequence.current = resizeSequence.current.catch(() => undefined).then(() => onResize(open)).catch(() => { setError("Could not resize Focus Lock."); });
  }, [desktop, open, onResize]);
  const trigger = useRef<HTMLButtonElement>(null), desktopTrigger = useRef<HTMLElement>(null), dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    setStatus(null);
    const db = getDatabase(); let control: StudyControl | null = null, devices: StudyDevice[] = [];
    const refresh = () => {
      setNow(Date.now());
      const session = control?.session && (control.session.paused || control.session.endsAt > Date.now()) ? control.session : null;
      const connected = devices.filter(device => Date.now() - device.lastSeenAt < 90000);
      setStatus({ session, connected: connected.length, protected: session ? connected.filter(device => device.sessionId === session.id && !device.error).length : 0 });
    };
    const failed = (e: Error) => setError(/firebase/i.test(e.message) ? "Could not load your focus session. Please try again." : e.message);
    const stopControl = watchStudyControl(db, uid, value => { control = value; setFocusSession(value?.session ?? null); if (Array.isArray(value?.allowedDomains)) setDomains(value.allowedDomains.slice(0, MAX_STUDY_WEBSITES).join("\n")); refresh(); }, failed);
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
    return () => { window.removeEventListener("keydown", key, true); (desktop ? desktopTrigger.current : trigger.current)?.focus(); };
  }, [open, pickingTime]);
  const websites = domains.split(/[\n,]+/).map(value => value.trim()).filter(Boolean).slice(0, MAX_STUDY_WEBSITES);
  useEffect(() => { if (websites.length >= MAX_STUDY_WEBSITES) setWebsite(""); }, [websites.length]);
  const addWebsite = () => {
    if (!website.trim()) return;
    try {
      const domain = normalizeStudyDomain(website.trim());
      if (websites.length >= MAX_STUDY_WEBSITES && !websites.includes(domain)) throw Error(`Maximum ${MAX_STUDY_WEBSITES} websites per session.`);
      const next = [...new Set([...websites, domain])].join("\n");
      setDomains(next); setWebsite(""); setError(""); localStorage.setItem(`ssc-browser-allowlist:${uid}`, next);
      void run(() => saveStudyWebsites(getDatabase(), uid, next.split("\n").filter(Boolean), source));
    } catch (e) { setError(e instanceof Error ? e.message : "Enter a domain like parmar.com."); }
  };
  const session = status?.session;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); try { await action(); } catch (e) { const message = String(e); setError(/firebase/i.test(message) ? "Could not update your focus session. Please try again." : message); } finally { setBusy(false); }
  };
  return <>
    {desktop ? <section ref={desktopTrigger} className="study-desktop-content" {...(!session ? { role: "button", tabIndex: 0, "aria-label": "Set up Focus Lock", onClick: () => setOpen(true), onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(true); } } } : {})}>
      <div className="study-desktop-heading"><span data-tauri-drag-region><LockKeyhole size={14} />Focus Lock</span>{session && <button className={`study-desktop-toggle ${session.paused ? "is-paused" : "is-running"}`} type="button" aria-label={session.paused ? "Resume Focus Lock" : "Pause Focus Lock"} title={session.paused ? "Resume focus" : "Pause focus"} disabled={busy} onClick={event => { event.stopPropagation(); void run(() => session.paused ? resumeStudySession(getDatabase(), uid, source) : pauseStudySession(getDatabase(), uid, source)); }}>{session.paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}</button>}</div>
      <div className="study-desktop-summary"><span className="study-desktop-daily">Today's focus time <b><SlotTime value={formatFocusTime(todayFocus)} /></b></span><strong className={`study-desktop-time ${session ? "is-running" : ""}`}>{session ? <SlotTime value={remaining(session)} /> : "Ready to focus"}</strong></div>
    </section> : <button ref={trigger} className={`browser-study-trigger ${profile ? "study-profile-trigger" : "icon-button"} ${session ? "active" : ""}`} aria-label="Focus Lock" title={session ? `Focus Lock - ${remaining(session.endsAt)}` : "Focus Lock"} onClick={() => setOpen(true)}><LockKeyhole size={17} />{profile && <><span>Focus Lock</span><small>Today · <SlotTime value={formatFocusTime(todayFocus)} /></small></>}{session && !profile && <i aria-hidden="true" />}</button>}

    {open && createPortal(<div className="browser-study-overlay" onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }} onContextMenu={e => e.stopPropagation()}>
      <section ref={dialog} className={`browser-study-dialog ${desktop ? "study-desktop-dialog" : ""} ${source === "web" ? "web-focus-lock" : ""} ${session && !pickingTime ? "is-running" : ""} ${session && lockedImage ? "focus-lock-visual" : ""}`} role="dialog" aria-modal="true" aria-labelledby="browser-study-title">
        {session && lockedImage && <div className="focus-lock-image"><img src={lockedImage} alt="Focus motivation" /></div>}
        <div className="focus-lock-dialog-content">
        {pickingTime && !session ? <StudyDurationPicker minutes={Number(minutes)} onCancel={() => setPickingTime(false)} onConfirm={value => { setMinutes(String(value)); setPickingTime(false); }} /> : <>
        <div className="browser-study-heading"><h2 id="browser-study-title">Focus Lock</h2>{onPin && <button aria-label="Add Focus Lock desktop widget" title="Add desktop widget" disabled={busy} onClick={() => void run(() => onPin())}><MonitorUp size={17} /></button>}{source !== "web" && <button aria-label="Close Focus Lock" onClick={() => setOpen(false)}><X size={18} /></button>}</div>
        {source !== "windows" && source !== "web" && <div className={`browser-study-connection ${status?.connected ? "connected" : ""}`} role="status"><Monitor size={12} /><i /><span>{status?.connected ? `${status.connected} connected` : "No browser connected"}</span></div>}
        {source !== "windows" && source !== "web" && (!desktop || !session) && <div className="study-focus-today"><span>Today's focus</span><strong>{formatFocusTime(todayFocus)}</strong></div>}
        {session ? <>
          {lockedImage && <><p className="focus-lock-eyebrow">ONE SESSION. ONE STEP CLOSER.</p><h3 className="focus-lock-message">Your goals deserve this time.</h3></>}
          <div className="browser-study-live-time"><SlotTime value={remaining(session)} /></div>
          <button className="browser-study-secondary study-pause-button" disabled={busy} onClick={() => void run(() => session.paused ? resumeStudySession(getDatabase(), uid, source) : pauseStudySession(getDatabase(), uid, source))}>{busy ? "Please wait…" : session.paused ? "Resume focus" : "Take a break"}</button>
          {source === "web" ? (onPracticeSession && <button className="focus-lock-recall" onClick={() => { setOpen(false); onPracticeSession(); }}>Practice session</button>) : source !== "windows" && !desktop && <div className="browser-study-domains">{session.domains.slice(0, MAX_STUDY_WEBSITES).map(domain => lockedImage ? <a key={domain} href={`https://${domain}`} className="focus-lock-site" rel="noreferrer"><span className="focus-lock-site-icon">{domain.replace(/^www\./, "").charAt(0).toUpperCase()}</span><strong>{domain}</strong><span aria-hidden="true">&#8599;</span></a> : <span key={domain} title={domain}>{domain}</span>)}</div>}
        </> : <>
          <div className="study-websites"><h3>Allowed websites <small>{websites.length}/{MAX_STUDY_WEBSITES}</small></h3>
            {websites.length < MAX_STUDY_WEBSITES && <div className="study-domain-entry"><Globe2 size={15} /><input aria-label="Website domain" value={website} onChange={event => setWebsite(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addWebsite(); } }} placeholder="parmar.com" spellCheck={false} autoCapitalize="none" /><button aria-label="Add website" disabled={!website.trim() || busy} onClick={addWebsite}><Plus size={17} /></button></div>}
            <div className="study-domain-chips">{websites.map(domain => <span key={domain} title={domain}>{domain}<button aria-label={`Remove ${domain}`} onClick={() => { const next = websites.filter(value => value !== domain).join("\n"); setDomains(next); localStorage.setItem(`ssc-browser-allowlist:${uid}`, next); void run(() => saveStudyWebsites(getDatabase(), uid, next.split("\n").filter(Boolean))); }}><X size={12} /></button></span>)}</div>
          </div>
          <button className="study-duration-trigger" onClick={() => setPickingTime(true)}><Clock3 size={17} /><span>Focus time</span><strong><SlotTime value={formatFocusMinutes(Number(minutes))} /></strong></button>
          <AnimatedChoices className="study-time-presets" label="Focus duration" options={[15, 30, 60, 90].map(value => ({ value: String(value), label: formatFocusMinutes(value), disabled: busy }))} value={minutes} onChange={setMinutes} />
          <button className="browser-study-primary" disabled={busy || !websites.length || !!website.trim()} onClick={() => void run(async () => {
            const duration = Number(minutes); if (!Number.isInteger(duration) || duration < 1 || duration > 720) throw Error("Choose 1–720 minutes.");
            await startStudySession(getDatabase(), uid, duration, websites, source); localStorage.setItem(`ssc-browser-allowlist:${uid}`, domains);
          })}>{busy ? "Please wait…" : "Start Focus Lock"}</button>
        </>}
        {error && <p className="browser-study-error" role="alert">{error}</p>}
        </>}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
