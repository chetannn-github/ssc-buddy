import { useMemo } from "react";

type Segment = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  segments: Segment[];
  centerLabel?: string;
  centerValue?: string | number;
  centerSubValue?: string | number;
  size?: number;
  thickness?: number;
};

/**
 * Lightweight SVG donut chart. Renders proportional arcs for each segment
 * with an optional score/label in the center.
 */
export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  centerSubValue,
  size = 120,
  thickness = 16,
}: Props) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const arcs = useMemo(() => {
    if (total === 0) return [];
    let offset = 0;
    return segments.map((s) => {
      const fraction = s.value / total;
      const length = fraction * circumference;
      const arc = {
        ...s,
        dasharray: `${length} ${circumference - length}`,
        dashoffset: -offset,
      };
      offset += length;
      return arc;
    });
  }, [segments, total, circumference]);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        total === 0
          ? "No data"
          : segments.map((s) => `${s.label} ${s.value}`).join(", ")
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
          opacity={0.25}
        />
        {total > 0 &&
          arcs.map((a) => (
            <circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              strokeLinecap="butt"
            />
          ))}
      </svg>
      {(centerValue != null || centerSubValue != null || centerLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          {centerValue != null && (
            <span
              className="font-semibold text-foreground"
              style={{ fontSize: size * 0.22 }}
            >
              {centerValue}
            </span>
          )}
          {centerSubValue != null && (
            <span
              className="font-medium text-muted-foreground"
              style={{ fontSize: size * 0.12 }}
            >
              {centerSubValue}
            </span>
          )}
          {centerLabel && (
            <span
              className="mt-0.5 font-medium text-muted-foreground"
              style={{ fontSize: size * 0.1 }}
            >
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
