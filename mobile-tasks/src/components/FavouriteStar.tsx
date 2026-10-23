import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated } from "react-native";
import Svg, { Path } from "react-native-svg";

// Same rounded Lucide Star outline used by the web tracker (ISC licensed).
export function FavouriteStar({ size = 16, color, filled = true }: { size?: number; color: string; filled?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(filled);
  const reduced = useRef(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) reduced.current = value; }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", value => { reduced.current = value; if (value) { scale.stopAnimation(); scale.setValue(1); } });
    return () => { mounted = false; listener.remove(); scale.stopAnimation(); };
  }, [scale]);
  useEffect(() => {
    if (previous.current === filled) return;
    previous.current = filled;
    scale.stopAnimation();
    if (reduced.current) { scale.setValue(1); return; }
    const animation = Animated.sequence([
      Animated.spring(scale, { toValue: filled ? 1.22 : 0.82, speed: 28, bounciness: 0, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 6, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [filled, scale]);
  return <Animated.View style={{ width: size, height: size, flexShrink: 0, transform: [{ scale }] }}><Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
  </Svg></Animated.View>;
}
