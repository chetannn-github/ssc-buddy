import { useId } from "react";
import { Flame } from "lucide-react";
import "./streak-liquid.css";

// Lucide's flame outline, reused as a mask for the decorative liquid.
const FLAME =
  "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4Z";

export function StreakLiquidFlame({ active, className }: { active: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (!active) return <Flame aria-hidden="true" className={className} />;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className}>
      <defs>
        <clipPath id={`${id}-flame`}>
          <path d={FLAME} />
        </clipPath>
        <linearGradient id={`${id}-fire`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.5" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-flame)`}>
        <path d={FLAME} fill="#78350f" />
        <g className="streak-liquid-fill">
          <rect width="24" height="24" fill={`url(#${id}-fire)`} />
          <path
            className="streak-liquid-wave"
            d="M-24 9 Q-18 5 -12 9 T0 9 T12 9 T24 9 T36 9 T48 9 V24 H-24Z"
            fill="#f97316"
            opacity="0.5"
          />
          <circle className="streak-liquid-bubble" cx="10" cy="21" r="1" fill="#fff7ed" />
          <circle
            className="streak-liquid-bubble streak-liquid-bubble-second"
            cx="15"
            cy="22"
            r="0.8"
            fill="#fef3c7"
          />
        </g>
      </g>
      <path d={FLAME} fill="none" stroke="#fbbf24" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}
