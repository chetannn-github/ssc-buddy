import { useId } from "react";

/** Square cell with a clipped, animated fill proportional to daily progress. */
export function HeatmapCell({ intensity, color, future = false, x, y, size = 100 }: {
  intensity: number; color: string; future?: boolean; x?: number; y?: number; size?: number;
}) {
  const clip = useId().replace(/:/g, "");
  const level = future ? 0 : Math.max(0, Math.min(1, intensity));
  return <svg x={x} y={y} width={size} height={size} viewBox="0 0 100 100" className="heatmap-liquid-cell" aria-hidden="true">
    <defs><clipPath id={clip}><rect width="100" height="100" rx="18" /></clipPath></defs>
    <g clipPath={`url(#${clip})`} fill={color}>
      <rect width="100" height="100" opacity={future ? .04 : .12} />
      {level > 0 && <g className="heatmap-liquid-level" style={{ transform: `translateY(${100 - level * 100}px)` }}>
        <path className="heatmap-liquid-wave" d="M0 0 Q25 -10 50 0 T100 0 T150 0 T200 0 V110 H0 Z" />
      </g>}
    </g>
  </svg>;
}
