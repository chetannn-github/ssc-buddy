import { useEffect, useId, useRef, useState } from "react";
import type { timerDial } from "../../../mobile-tasks/src/domain/date-timers";
import "./timer-liquid.css";

export function TimerLiquidDial({ dial, color, size = 160, title, onEdit }: { dial: ReturnType<typeof timerDial>; color: string; size?: number; title?: string; onEdit?: () => void }) {
  const progress = Math.max(0, Math.min(1, dial.progress));
  const borderId = `timer-border-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [splash, setSplash] = useState(0);
  const [lift, setLift] = useState(0);
  const motion = useRef({ lift: 0, velocity: 0, time: 0, frame: 0 });
  const reduced = useRef(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      cancelAnimationFrame(motion.current.frame);
      motion.current = { lift: 0, velocity: 0, time: 0, frame: 0 };
      setLift(0);
    };
    const update = () => { reduced.current = media.matches; if (media.matches) stop(); };
    const visible = () => { if (document.hidden) stop(); };
    update(); media.addEventListener("change", update); document.addEventListener("visibilitychange", visible);
    return () => { cancelAnimationFrame(motion.current.frame); media.removeEventListener("change", update); document.removeEventListener("visibilitychange", visible); };
  }, []);
  useEffect(() => {
    if (progress === 0) {
      cancelAnimationFrame(motion.current.frame);
      motion.current = { lift: 0, velocity: 0, time: 0, frame: 0 }; setLift(0);
    }
  }, [progress]);
  const play = () => {
    if (progress <= 0 || reduced.current) return;
    setSplash(value => value + 1);
    const state = motion.current;
    state.velocity = Math.min(4, state.velocity + 1.7);
    if (state.frame) return;
    const step = (time: number) => {
      const dt = state.time ? Math.min(0.032, (time - state.time) / 1000) : 1 / 60;
      state.time = time;
      state.velocity += (-10 * state.lift - 5 * state.velocity) * dt;
      state.lift = Math.max(-0.025, Math.min(1, state.lift + state.velocity * dt));
      if (state.lift >= 1 && state.velocity > 0) state.velocity = 0;
      setLift(state.lift);
      if (Math.abs(state.lift) < 0.001 && Math.abs(state.velocity) < 0.005) {
        state.lift = 0; state.velocity = 0; state.time = 0; state.frame = 0; setLift(0); return;
      }
      state.frame = requestAnimationFrame(step);
    };
    state.frame = requestAnimationFrame(step);
  };
  return <div className="relative mx-auto mt-1 shrink-0" style={{ width: size, height: size }}>
    <button type="button" style={{ position: "absolute", left: (size - 160) / 2, top: (size - 160) / 2, transform: `scale(${size / 160})` }} className="relative h-40 w-40 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400" aria-label={`${dial.label} ${dial.status.toLowerCase()}, play with water`} onClick={play}>
      <div className="timer-liquid-tank" aria-hidden="true" style={{ backgroundColor: color + "0d" }}>
        <div className="timer-liquid-fill" style={{ transition: lift !== 0 ? "none" : undefined, height: `${Math.max(0, Math.min(1, progress + lift)) * 100}%`, opacity: progress > 0 ? 1 : 0, background: `linear-gradient(to bottom, ${color}a0, ${color}45)` }}>
          <svg className="timer-liquid-wave" width="348" height="14" viewBox="0 0 348 14"><path d="M0 7 Q14.5 0 29 7 T58 7 T87 7 T116 7 T145 7 T174 7 T203 7 T232 7 T261 7 T290 7 T319 7 T348 7 V14 H0Z" fill={color} /></svg>
          {splash > 0 && <span key={splash} className="timer-liquid-ripple" />}
          {[0, 1, 2].map(index => <i key={index} className="timer-liquid-bubble" style={{ left: `${25 + index * 25}%`, animationDelay: `${index * -1.1}s` }} />)}
        </div>
      </div>
      <svg viewBox="0 0 160 160" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs><mask id={borderId} maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160" style={{ maskType: "luminance" }}><rect x="0" y="0" width="160" height="160" fill="black" /><circle cx="80" cy="80" r="63" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeDasharray={2 * Math.PI * 63} strokeDashoffset={2 * Math.PI * 63 * (1 - progress)} opacity={progress > 0 ? 1 : 0} transform="rotate(-90 80 80)" /></mask></defs>
        <circle cx="80" cy="80" r="63" fill="none" stroke="#343434" strokeWidth="9" />
        <g mask={`url(#${borderId})`}>
          <circle cx="80" cy="80" r="63" fill="none" stroke={color} strokeWidth="9" />
          {progress > 0 && <>
            <circle className="timer-border-shine" cx="80" cy="80" r="63" fill="none" stroke="#ffffff" strokeOpacity=".45" strokeWidth="5" strokeLinecap="round" strokeDasharray="16 380" transform="rotate(-90 80 80)" />
            <circle className="timer-border-bubbles" cx="80" cy="80" r="63" fill="none" stroke="#ffffff" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 65" />
          </>}
        </g>
      </svg>
      <div className="timer-liquid-text absolute inset-0 flex flex-col items-center justify-center px-6"><span className="max-w-full text-[clamp(1.4rem,5vw,2rem)] leading-none font-semibold tracking-tight text-white tabular-nums">{dial.label}</span>{dial.status && <span className="mt-1.5 text-[10px] font-medium tracking-widest text-white">{dial.status}</span>}{title && <span className="mt-2 line-clamp-2 max-w-full break-words text-center text-xs leading-tight font-semibold text-white">{title}</span>}</div>
    </button>
    {title && onEdit && <button type="button" onClick={onEdit} aria-label={`Edit ${title}`} className="absolute left-[22%] top-[59%] h-[24%] w-[56%] rounded-md focus-visible:outline-2 focus-visible:outline-sky-400" />}
  </div>;
}
