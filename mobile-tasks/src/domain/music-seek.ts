export function musicRingProgress(x: number, y: number, size: number): number {
  return ((Math.atan2(y - size / 2, x - size / 2) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
}

/** Drag continuously across the top seam without jumping between song ends. */
export function continueMusicSeek(previous: number, next: number): number {
  let delta = next - previous;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return Math.max(0, Math.min(1, previous + delta));
}
