import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

export function HabitProgressFill({ progress, color }: { progress: number; color: string }) {
  const target = Math.max(0, Math.min(1, progress));
  const fill = useRef(new Animated.Value(target)).current;
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reducedMotion) {
      fill.setValue(target);
      return;
    }
    const animation = Animated.timing(fill, {
      toValue: target,
      duration: 450,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [target, fill, reducedMotion]);
  return <Animated.View style={{ height: "100%", width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }), backgroundColor: color, borderRadius: 4 }} />;
}
