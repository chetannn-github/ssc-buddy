import { normalizeAppAccent, accentInk } from "../../mobile-tasks/src/domain/app-accent";
export {
  APP_ACCENTS,
  normalizeAppAccent,
  accentInk,
  type AppAccent,
} from "../../mobile-tasks/src/domain/app-accent";

export function applyWebAccent(value: unknown) {
  if (typeof document === "undefined") return;
  const accent = normalizeAppAccent(value),
    style = document.documentElement.style;
  style.setProperty("--app-accent", accent);
  style.setProperty("--app-accent-ink", accentInk(accent));
  style.setProperty("--app-accent-soft", accent + "18");
  style.setProperty("--app-accent-border", accent + "66");
}
