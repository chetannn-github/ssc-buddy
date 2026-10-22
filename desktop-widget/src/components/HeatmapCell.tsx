import { useId, type CSSProperties } from "react";

const wavePath = "M0 0 Q25 -10 50 0 T100 0 T150 0 T200 0 V110 H0 Z";

/** Square cell with a clipped, animated fill proportional to daily progress. */
export function HeatmapCell({ intensity, color, future = false, x, y, size = 100 }: {
  intensity: number; color: string; future?: boolean; x?: number; y?: number; size?: number;
}) {
  const clip = useId().replace(/:/g, "");
  const level = future ? 0 : Math.max(0, Math.min(1, intensity));
  const liquidClip = `${clip}-liquid`;
  const offset = 100 - level * 100;
  return <svg x={x} y={y} width={size} height={size} viewBox="0 0 100 100" className="heatmap-liquid-cell" aria-hidden="true"
    style={{ "--heatmap-bubble-rise": `${-Math.max(4, level * 100 - 4)}px` } as CSSProperties}>
    <defs>
      <clipPath id={clip}><rect width="100" height="100" rx="18" /></clipPath>
      {/* Keep the wave directly inside clipPath; nested groups hide bubbles in WebView2. */}
      {level > 0 && <clipPath id={liquidClip} transform={`translate(0 ${offset})`}>
        <path className="heatmap-liquid-wave" d={wavePath} />
      </clipPath>}
    </defs>
    <g clipPath={`url(#${clip})`} fill={color}>
      <rect width="100" height="100" opacity={future ? .04 : .12} />
      {level > 0 && <>
        <g className="heatmap-liquid-level" style={{ transform: `translateY(${offset}px)` }}>
          <path className="heatmap-liquid-wave" d={wavePath} />
        </g>
        <g clipPath={`url(#${liquidClip})`}>
          <circle className="heatmap-cell-bubble" cx="24" cy="94" r="8" />
          <circle className="heatmap-cell-bubble heatmap-cell-bubble-second" cx="52" cy="94" r="6.5" />
          <circle className="heatmap-cell-bubble heatmap-cell-bubble-third" cx="78" cy="94" r="7.5" />
        </g>
      </>}
    </g>
  </svg>;
}
