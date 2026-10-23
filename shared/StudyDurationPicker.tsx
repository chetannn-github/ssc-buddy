import { useState, type PointerEvent } from "react";
import { Clock3, Keyboard } from "lucide-react";
import { ClockFaceMotion } from "./ClockFaceMotion";
import { useRef } from "react";
import { SlidingHighlight } from "./SlidingHighlight";
import { ClockHand } from "./ClockHand";
import { clockValueFromPoint } from "../mobile-tasks/src/domain/clock-hand";

export function StudyDurationPicker({ minutes, onCancel, onConfirm, timeOfDay=false,title="Focus time" }: { minutes: number; onCancel: () => void; onConfirm: (minutes: number) => void;timeOfDay?:boolean;title?:string }) {
  const [hour, setHour] = useState(Math.floor(minutes / 60)), [minute, setMinute] = useState(minutes % 60);
  const [part, setPart] = useState<"hour" | "minute">(minutes < 60 ? "minute" : "hour"), [keyboard, setKeyboard] = useState(false);
  const selected = part === "hour" ? (timeOfDay?hour%12:hour) : minute;
  const displayHour=timeOfDay?hour%12||12:hour;
  const angle = selected * (part === "hour" ? 30 : 6);
  const [dragging,setDragging]=useState(false);
  const labels = Array.from({ length: 12 }, (_, i) => part === "hour" ? i : i * 5);
  const choose = (value: number) => { if (part === "hour") setHour(timeOfDay?value%12+(hour>=12?12:0):value); else setMinute(value); };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const value = clockValueFromPoint((event.clientX - bounds.left) * 220 / bounds.width, (event.clientY - bounds.top) * 220 / bounds.height, part);
    if (value !== null) choose(part === "hour" ? value % 12 : value);
  };
  const total = hour * 60 + minute;
  const valid=timeOfDay?total>=0&&total<1440:total>=1&&total<=720;
  const period=useRef<HTMLDivElement>(null);
  const digits=useRef<HTMLDivElement>(null);
  const digitTransition={transition:typeof matchMedia!=="undefined"&&matchMedia("(prefers-reduced-motion: reduce)").matches?"none":"background-color 240ms cubic-bezier(.2,.7,.2,1), color 240ms ease"};
  return <div className={`study-duration-picker ${timeOfDay?"is-time-of-day":""}`}>
    <h2 id="browser-study-title">{title}</h2>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"center",gap:8}}>
    <div ref={digits} className="study-duration-digits" style={{position:"relative",isolation:"isolate"}}><SlidingHighlight container={digits} active={part+(keyboard?"-keyboard":"")} />{(["hour", "minute"] as const).map((field, index) => <div key={field}>
      {index === 1 && <b>:</b>}<div style={{position:"relative",...(timeOfDay?{width:64}:{})}}><span aria-hidden="true" style={{position:"absolute",left:0,right:0,top:0,height:56,borderRadius:12,background:"#2b2b2b",zIndex:-2}}/>{keyboard ? <input data-slide-key={field+'-keyboard'} style={{...digitTransition,background:"transparent"}} aria-label={field === "hour" ? "Hours" : "Minutes"} type="number" min={0} max={field === "hour" ? 12 : 59} value={field === "hour" ? displayHour : minute} onFocus={() => setPart(field)} onChange={event => { const value = Math.max(0, Math.min(field === "hour" ? 12 : 59, Number(event.target.value) || 0));if(field==="hour")setHour(timeOfDay?value%12+(hour>=12?12:0):value);else setMinute(value); }} /> : <button data-slide-key={field} style={{...digitTransition,background:"transparent"}} aria-label={field === "hour" ? "Select hours" : "Select minutes"} aria-pressed={part === field} onClick={() => setPart(field)}>{String(field === "hour" ? displayHour : minute).padStart(2, "0")}</button>}<small>{field === "hour" ? "Hours" : "Minutes"}</small></div>
    </div>)}</div>
    {timeOfDay&&<div ref={period} role="group" aria-label="AM or PM" style={{position:"relative",isolation:"isolate",width:46,height:56,flexShrink:0,borderRadius:10,overflow:"hidden",background:"#2b2b2b"}}><SlidingHighlight container={period} active={hour>=12?"PM":"AM"} color="#f9fcf5" radius={0}/>{["AM","PM"].map((label,index)=><button type="button" key={label} data-slide-key={label} aria-label={label} aria-pressed={(hour>=12?1:0)===index} onClick={()=>setHour(hour%12+index*12)} style={{display:"block",width:"100%",height:28,padding:0,border:0,background:"transparent",fontSize:11,color:(hour>=12?1:0)===index?"#111":"#ddd"}}>{label}</button>)}</div>}
    </div>
    {!keyboard && <div className="study-duration-clock" onPointerDown={event => { if (event.button !== 0) return; setDragging(false);event.currentTarget.setPointerCapture(event.pointerId); point(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) {setDragging(true);point(event);} }} onPointerCancel={()=>setDragging(false)} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.currentTarget.releasePointerCapture(event.pointerId);setDragging(false); if (part === "hour") setPart("minute"); } }}>
      <ClockFaceMotion mode={part}>
      <ClockHand angle={angle} dragging={dragging}/>
      {labels.map((value, index) => <button key={value} aria-label={`${timeOfDay&&part==="hour"&&value===0?12:value} ${part === "hour" ? "hours" : "minutes"}`} aria-pressed={selected === value} style={{ left: `${50 + Math.sin(index * Math.PI / 6) * 37.3}%`, top: `${50 - Math.cos(index * Math.PI / 6) * 37.3}%` }} onPointerDown={event => event.stopPropagation()} onClick={() => { choose(value); if (part === "hour") setPart("minute"); }}>{timeOfDay&&part==="hour"&&value===0?12:value}</button>)}
      </ClockFaceMotion>
    </div>}
    {!valid && <p role="alert" className="browser-study-error">{timeOfDay?"Choose a valid time.":"Choose 1 minute to 12 hours."}</p>}
    <div className="study-duration-actions"><button aria-label={keyboard ? "Use clock" : "Use keyboard"} onClick={() => setKeyboard(!keyboard)}>{keyboard ? <Clock3 size={20} /> : <Keyboard size={20} />}</button><span /><button onClick={onCancel}>Cancel</button><button disabled={!valid} onClick={() => onConfirm(total)}>Save</button></div>
  </div>;
}
