import { HABIT_COLORS } from "./habit-colors";

const ORIGINAL_ACCENTS = [
  { name: "Yellow", color: "#ffe000" },
  { name: "Green", color: "#8ee53f" },
  { name: "Purple", color: "#b18aff" },
  { name: "Pink", color: "#ff8fbd" },
  { name: "Red", color: "#ff666e" },
  { name: "Blue", color: "#70b4ff" },
  { name: "Cyan", color: "#4de1ff" },
  { name: "Teal", color: "#45d6c2" },
  { name: "Mint", color: "#7ef0b2" },
  { name: "Lime", color: "#c5ee51" },
  { name: "Orange", color: "#ffad4d" },
  { name: "Coral", color: "#ff927b" },
  { name: "Gold", color: "#f8ca63" },
  { name: "Lavender", color: "#d1b3ff" },
  { name: "Rose", color: "#f5a3d7" },
  { name: "Ice blue", color: "#b7dcff" },
] as const;
export const APP_ACCENTS = [
  ...ORIGINAL_ACCENTS,
  ...Object.entries(HABIT_COLORS)
    .filter(([, color]) => !ORIGINAL_ACCENTS.some((option) => option.color === color))
    .map(([name, color]) => ({ name: name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()), color })),
] as const;

/** Keep filled controls readable for the darker habit colors too. */
export function accentInk(accent: string) {
  const rgb = [1, 3, 5].map((offset) => parseInt(accent.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  return luminance > 0.179 ? "#171400" : "#fafafa";
}
export type AppAccent = typeof APP_ACCENTS[number]["color"];
export function normalizeAppAccent(value: unknown): AppAccent {
  return APP_ACCENTS.find((option) => option.color === value)?.color ?? "#ffe000";
}
const primaryColors = new Set<string>([...APP_ACCENTS.map((option) => option.color), "#ffe000", "#60a5fa", "#93c5fd", "#3b82f6", "#2563eb", "#1d4ed8"]);
const inkColors = new Set(["#171400", "#081a31", "#082f49", "#172554"]);
export function accentStyleValue(value: unknown, accent: AppAccent): any {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (primaryColors.has(lower)) return accent;
    if (["#285d91", "#315c83", "#285f94"].includes(lower)) return accent + "66";
    if (inkColors.has(lower)) return accentInk(accent);
    if (["#162c45", "#16345c"].includes(lower)) return accent + "18";
    const alphaHex = lower.match(/^(#[0-9a-f]{6})([0-9a-f]{2})$/);
    if (alphaHex && primaryColors.has(alphaHex[1]!)) return accent + alphaHex[2];
    const rgba = lower.match(/^rgba\(\s*(?:96\s*,\s*165\s*,\s*250|59\s*,\s*130\s*,\s*246)\s*,\s*([.\d]+)\s*\)$/);
    if (rgba) return accent + Math.round(Math.max(0, Math.min(1, Number(rgba[1]))) * 255).toString(16).padStart(2, "0");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => accentStyleValue(item, accent));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "color" && item === "#101010" ? accentInk(accent) : accentStyleValue(item, accent)]));
  }
  return value;
}
