/** Keep rotation continuous and take the shorter route across 12 / 00. */
export function nearestClockAngle(current: number, target: number): number {
  if (!Number.isFinite(current)) current=0;
  if (!Number.isFinite(target)) return current;
  const delta=((target-current)%360+540)%360-180;
  return current+(delta===-180?180:delta);
}
