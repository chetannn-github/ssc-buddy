/** Keep the water normal aligned with gravity in screen coordinates. */
export function waterTiltTarget(x: number, y: number, previous: number): number {
  "worklet";
  // Flat phones settle towards screen-bottom; invalid readings retain the last tilt.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return previous;
  const target = Math.hypot(x, y) < 1.5 ? 0 : Math.atan2(-x, -y);
  // Unwrap across +/-180 degrees so a full rotation never spins the water backwards.
  return previous + Math.atan2(Math.sin(target - previous), Math.cos(target - previous));
}

export function waterOverflowStrength(fill: number, lift: number, height: number): number {
  if (!Number.isFinite(fill) || !Number.isFinite(lift) || !Number.isFinite(height) || fill <= 0 || height <= 0) return 0;
  return Math.max(0, Math.min(1, (Math.min(1, fill) + Math.max(0, lift) / height - 1.02) / 0.35));
}

/** A shallow puddle accelerates downhill, spreads, then drains at the lower edge. */
export function stepWaterPuddle(x: number, velocity: number, volume: number, tilt: number, width: number, delta: number) {
  "worklet";
  const dt = Math.max(0, Math.min(0.04, delta));
  const downhill = -Math.sin(tilt);
  const speed = (velocity + downhill * 420 * dt) * Math.exp(-3.2 * dt);
  const nextX = Math.max(8, Math.min(Math.max(8, width - 8), x + speed * dt));
  const exit = nextX <= 9 && downhill < -0.12 ? -1 : nextX >= width - 9 && downhill > 0.12 ? 1 : 0;
  return { x: nextX, velocity: exit ? speed * 0.45 : speed, volume: Math.max(0, volume - dt * (exit ? 0.7 : 0.018)), exit };
}
