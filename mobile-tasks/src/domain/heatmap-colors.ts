const PALETTES = [
  ["#a7f3d0", "#6ee7b7", "#10b981", "#047857"],
  ["#bfdbfe", "#60a5fa", "#2563eb", "#1e40af"],
  ["#fecaca", "#f87171", "#ef4444", "#991b1b"],
  ["#e9d5ff", "#c084fc", "#9333ea", "#6b21a8"],
  ["#a5f3fc", "#22d3ee", "#0891b2", "#155e75"],
  ["#fed7aa", "#fb923c", "#ea580c", "#9a3412"],
  ["#fbcfe8", "#f472b6", "#db2777", "#9d174d"],
];
export type HeatmapColorCycle = { seed: number; previousShift: number; shift: number };
export function fixedHeatmapColor(level: number, mode: "activity" | "tasks") {
  return PALETTES[mode === "tasks" ? 3 : 0]![Math.max(0, Math.min(3, level - 1))]!;
}
let lastVisit: HeatmapColorCycle | undefined;
export function nextProfileColorTheme() {
  lastVisit = nextHeatmapColorCycle(lastVisit);
  return { ...lastVisit, previousShift: -1 };
}
export function nextHeatmapColorCycle(
  previous?: HeatmapColorCycle,
  random = Math.random,
): HeatmapColorCycle {
  const previousShift = previous?.shift ?? -1;
  return {
    seed: (previous?.seed ?? 0) + 1,
    previousShift,
    shift:
      ((previous?.shift ?? 0) + 1 + Math.floor(random() * (PALETTES.length - 1))) % PALETTES.length,
  };
}
function hash(key: string) {
  let value = 0;
  for (const character of key) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
export function heatmapCellColors(key: string, level: number, cycle: HeatmapColorCycle) {
  const index = Math.max(0, Math.min(3, level - 1));
  const offset = 0;
  const timing = hash(`${cycle.seed}:${key}`);
  return {
    previous:
      PALETTES[cycle.previousShift < 0 ? 0 : (offset + cycle.previousShift) % PALETTES.length]![
        index
      ]!,
    color: PALETTES[(offset + cycle.shift) % PALETTES.length]![index]!,
    delay: timing % 1600,
    duration: 900 + (timing % 500),
  };
}
