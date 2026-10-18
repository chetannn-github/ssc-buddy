/** Cumulative thresholds: Level 0 recovery, then 0, 500, 1000, 2000… */
export const xpForLevel = (level: number) => level <= 0 ? -500 : level === 1 ? 0 : 500 * 2 ** (level - 2);

export function xpSegmentProgress(xp: number, level: number) {
  const start = xpForLevel(level);
  const end = xpForLevel(level + 1);
  return Math.max(0, Math.min(1, (xp - start) / (end - start)));
}

export function summarizeXp(xp: number) {
  let level = 0;
  if (xp >= 0) {
    level = 1;
    while (xp >= xpForLevel(level + 1)) level += 1;
  }
  return { xp, level, levelStart: xpForLevel(level), nextLevelXp: xpForLevel(level + 1), progress: xpSegmentProgress(xp, level) };
}
