import { useEffect, useRef } from "react";
import { BackHandler } from "react-native";

/** Register only the visible leaf screen, so Back goes up one level at a time. */
export function useAndroidBack(onBack: () => boolean | void, enabled = true) {
  const latest = useRef(onBack);
  useEffect(() => { latest.current = onBack; });
  useEffect(() => {
    if (!enabled) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => latest.current() !== false);
    return () => subscription.remove();
  }, [enabled]);
}
