import { useSyncExternalStore } from "react";
import { StyleSheet } from "react-native";
import { accentInk, accentStyleValue, normalizeAppAccent, type AppAccent } from "./domain/app-accent";

let currentAccent: AppAccent = "#ffe000";
const listeners = new Set<() => void>();
export function setAppAccent(value: unknown) {
  const next = normalizeAppAccent(value);
  if (currentAccent === next) return;
  currentAccent = next;
  listeners.forEach((notify) => notify());
}
export function useAppAccent() {
  return useSyncExternalStore((notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; }, () => currentAccent, () => "#ffe000" as AppAccent);
}

// Resolve static styles against the current accent, without remounting screens
// or losing open dialogs, scroll positions and unfinished forms.
export function createThemedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(styles: T & StyleSheet.NamedStyles<any>): T {
  let cachedAccent: AppAccent | undefined;
  let cached: T;
  return new Proxy({ ...styles }, {
    get(target, key) {
      if (!(key in target)) return undefined;
      if (cachedAccent !== currentAccent) {
        cached = StyleSheet.create(accentStyleValue(target, currentAccent));
        cachedAccent = currentAccent;
      }
      return (cached as any)[key];
    },
    set(target, key, value) {
      Reflect.set(target, key, value);
      cachedAccent = undefined;
      return true;
    },
  });
}
export const colors = {
  button: "#f9fcf5", buttonInk: "#111111",
  background: "#000000", surface: "#1b1b1b", surfaceRaised: "#242424",
  border: "#303030", text: "#fafafa", muted: "#a1a1aa", subdued: "#71717a",
  get accent() { return currentAccent; },
  get accentDeep() { return accentInk(currentAccent); },
  completeSurface: "#162c45", completeBorder: "#285f94",
} as const;
export const dailyTaskColors = {
  get accent() { return currentAccent; },
  get ink() { return accentInk(currentAccent); }, completeSurface: "#1a1a1a", completeBorder: "#303030",
} as const;
