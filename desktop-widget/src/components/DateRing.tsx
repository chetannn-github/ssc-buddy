import { useId } from "react";

export function DateRing({ percent, selected, day }: { percent: number; selected: boolean; day: number }) {
  const id = "date-ring-" + useId().replace(/:/g, "");
  const value = Math.max(selected ? 2 : 0, percent), length = 116.24;
  return <span className="date-ring"><svg viewBox="0 0 43 43" aria-hidden="true">
    <defs><mask id={id}><circle cx="21.5" cy="21.5" r="18.5" fill="none" stroke="white" strokeWidth="3" strokeDasharray={length} strokeDashoffset={length * (1 - value / 100)} transform="rotate(-90 21.5 21.5)" /></mask></defs>
    <circle cx="21.5" cy="21.5" r="18.5" fill="none" stroke={selected ? "#535353" : "#292929"} strokeWidth="3" />
    <g mask={`url(#${id})`}><circle cx="21.5" cy="21.5" r="18.5" fill="none" className="date-ring-value" strokeWidth="3" />
      {percent > 0 && <circle cx="21.5" cy="21.5" r="18.5" fill="none" stroke="white" strokeWidth="1.5" opacity=".4" strokeLinecap="round" strokeDasharray="8 108.24" className="date-ring-flow" />}
    </g>
  </svg><b>{day}</b></span>;
}
