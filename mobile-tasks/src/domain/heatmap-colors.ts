// Activity levels run from light to dark within each vibrant color family.
const PALETTES = [
  ["#ffc4cc", "#ff97a7", "#ff6c81", "#ff405b"],
  ["#fff6c2", "#fff09a", "#ffe967", "#ffe234"],
  ["#e3ffb3", "#c8ff77", "#acfa3b", "#8ef000"],
  ["#ead2ff", "#d9afff", "#c88cff", "#b76aff"],
  ["#ffe0c0", "#ffc88f", "#ffad5d", "#ff922e"],
];
export const HEATMAP_EMPTY_COLOR = "#2c2c30";
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
