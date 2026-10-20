/** Snap a clock-face touch to an hour (1–12) or an exact minute (0–59). */
export function clockValueFromPoint(
  x: number,
  y: number,
  part: "hour" | "minute",
  size = 220,
): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0)
    return null;
  const dx = x - size / 2,
    dy = y - size / 2;
  // Grabbing the center should not jump the existing hand to an arbitrary value.
  if (Math.hypot(dx, dy) < 14) return null;
  const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
  const steps = part === "hour" ? 12 : 60;
  const value = Math.round((angle / (2 * Math.PI)) * steps) % steps;
  return part === "hour" ? value || 12 : value;
}
