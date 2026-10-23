import { useState, type PointerEvent } from "react";
import { Clock3, Keyboard } from "lucide-react";
import { ClockFaceMotion } from "./ClockFaceMotion";
import { useRef } from "react";
import { SlidingHighlight } from "./SlidingHighlight";
import { clockValueFromPoint } from "../mobile-tasks/src/domain/clock-hand";

export function StudyDurationPicker({ minutes, onCancel, onConfirm }: { minutes: number; onCancel: () => void; onConfirm: (minutes: number) => void }) {
  const [hour, setHour] = useState(Math.floor(minutes / 60)), [minute, setMinute] = useState(minutes % 60);
  const [part, setPart] = useState<"hour" | "minute">(minutes < 60 ? "minute" : "hour"), [keyboard, setKeyboard] = useState(false);
  const selected = part === "hour" ? hour : minute;
  const angle = selected * (part === "hour" ? 30 : 6) * Math.PI / 180;
  const labels = Array.from({ length: 12 }, (_, i) => part === "hour" ? i : i * 5);
  const choose = (value: number) => { if (part === "hour") setHour(value); else setMinute(value); };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const value = clockValueFromPoint((event.clientX - bounds.left) * 220 / bounds.width, (event.clientY - bounds.top) * 220 / bounds.height, part);
    if (value !== null) choose(part === "hour" ? value % 12 : value);
  };
  const total = hour * 60 + minute;
  const digits=useRef<HTMLDivElement>(null);
  const digitTransition={transition:typeof matchMedia!=="undefined"&&matchMedia("(prefers-reduced-motion: reduce)").matches?"none":"background-color 240ms cubic-bezier(.2,.7,.2,1), color 240ms ease"};
  return <div className="study-duration-picker">
    <h2 id="browser-study-title">Focus time</h2>
    <div ref={digits} className="study-duration-digits" style={{position:"relative",isolation:"isolate"}}><SlidingHighlight container={digits} active={part+(keyboard?"-keyboard":"")} />{(["hour", "minute"] as const).map((field, index) => <div key={field}>
      {index === 1 && <b>:</b>}<div style={{position:"relative"}}><span aria-hidden="true" style={{position:"absolute",left:0,right:0,top:0,height:56,borderRadius:12,background:"#2b2b2b",zIndex:-2}}/>{keyboard ? <input data-slide-key={field+'-keyboard'} style={{...digitTransition,background:"transparent"}} aria-label={field === "hour" ? "Hours" : "Minutes"} type="number" min={0} max={field === "hour" ? 12 : 59} value={field === "hour" ? hour : minute} onFocus={() => setPart(field)} onChange={event => { const value = Math.max(0, Math.min(field === "hour" ? 12 : 59, Number(event.target.value) || 0)); if (field === "hour") setHour(value); else setMinute(value); }} /> : <button data-slide-key={field} style={{...digitTransition,background:"transparent"}} aria-label={field === "hour" ? "Select hours" : "Select minutes"} aria-pressed={part === field} onClick={() => setPart(field)}>{String(field === "hour" ? hour : minute).padStart(2, "0")}</button>}<small>{field === "hour" ? "Hours" : "Minutes"}</small></div>
    </div>)}</div>
    {!keyboard && <div className="study-duration-clock" onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); point(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.currentTarget.releasePointerCapture(event.pointerId); if (part === "hour") setPart("minute"); } }}>
      <ClockFaceMotion mode={part}>
      <svg viewBox="0 0 220 220" aria-hidden="true"><line x1="110" y1="110" x2={110 + Math.sin(angle) * 82} y2={110 - Math.cos(angle) * 82} /><circle cx="110" cy="110" r="4" /><circle cx={110 + Math.sin(angle) * 82} cy={110 - Math.cos(angle) * 82} r="17" /></svg>
      {labels.map((value, index) => <button key={value} aria-label={`${value} ${part === "hour" ? "hours" : "minutes"}`} aria-pressed={selected === value} style={{ left: `${50 + Math.sin(index * Math.PI / 6) * 37.3}%`, top: `${50 - Math.cos(index * Math.PI / 6) * 37.3}%` }} onPointerDown={event => event.stopPropagation()} onClick={() => { choose(value); if (part === "hour") setPart("minute"); }}>{value}</button>)}
      </ClockFaceMotion>
    </div>}
    {(total < 1 || total > 720) && <p role="alert" className="browser-study-error">Choose 1 minute to 12 hours.</p>}
    <div className="study-duration-actions"><button aria-label={keyboard ? "Use clock" : "Use keyboard"} onClick={() => setKeyboard(!keyboard)}>{keyboard ? <Clock3 size={20} /> : <Keyboard size={20} />}</button><span /><button onClick={onCancel}>Cancel</button><button disabled={total < 1 || total > 720} onClick={() => onConfirm(total)}>Save</button></div>
  </div>;
}
