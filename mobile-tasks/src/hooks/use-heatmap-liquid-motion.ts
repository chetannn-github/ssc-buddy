import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing } from "react-native";
import type { HeatmapColorCycle } from "../domain/heatmap-colors";

/** One native animation clock for the whole heatmap, rather than a loop per day. */
export function useHeatmapLiquidMotion(
  cycle: HeatmapColorCycle,
  fillDuration = 4000,
  fillKey?: string,
) {
  const phase = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReducedMotion(value);
      })
      .catch(() => {
        if (mounted) setReducedMotion(true);
      });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    const app = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => {
      mounted = false;
      motion.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    if (reducedMotion !== false || !foreground) return;
    phase.setValue(0);
    const animation = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [phase, reducedMotion, foreground]);
  useEffect(() => {
    if (reducedMotion === null) return;
    if (reducedMotion || !foreground) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    const fill = Animated.timing(reveal, {
      toValue: 1,
      duration: fillDuration,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    fill.start();
    return () => {
      fill.stop();
    };
  }, [cycle, fillDuration, fillKey, reducedMotion, foreground, reveal]);
  return { phase, reveal, cycle };
}
