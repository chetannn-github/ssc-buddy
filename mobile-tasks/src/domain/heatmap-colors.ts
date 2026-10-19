// Activity levels run from light to dark within each vibrant color family.
const PALETTES = [
  ["#e52e4d", "#c91638", "#a90e2e", "#870b26"],
  ["#bccb20", "#9eae13", "#7e8f0c", "#606f08"],
  ["#316ad6", "#2452b5", "#1b3f95", "#142f75"],
  ["#bbff35", "#91ee00", "#6fc800", "#509900"],
  ["#a345de", "#8a2bc2", "#701ba2", "#58127e"],
];
export const HEATMAP_EMPTY_COLOR = "#202024";
export type HeatmapColorCycle = { seed: number; previousShift: number; shift: number };
export function heatmapPaletteColor(level: number, cycle: HeatmapColorCycle, mode: "activity" | "tasks") {
  if (level <= 0) return HEATMAP_EMPTY_COLOR;
  const palette = (cycle.shift + (mode === "tasks" ? 4 : 0)) % PALETTES.length;
  return PALETTES[palette]![Math.max(0, Math.min(3, level - 1))]!;
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
      previous
        ? (previous.shift + 1 + Math.floor(random() * (PALETTES.length - 1))) % PALETTES.length
        : Math.floor(random() * PALETTES.length),
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
