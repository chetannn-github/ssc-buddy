import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

export function AnimatedDropdownPanel({ open, style, children }: { open: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [mounted, setMounted] = useState(open), [reduced, setReduced] = useState(false);
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (open) setMounted(true);
    if (reduced) { phase.setValue(open ? 1 : 0); if (!open) setMounted(false); return; }
    const animation = Animated.timing(phase, { toValue: open ? 1 : 0, duration: open ? 220 : 150, easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished && !open) setMounted(false); });
    return () => animation.stop();
  }, [open, phase, reduced]);
  if (!open && !mounted) return null;
  return <Animated.View pointerEvents={open ? "auto" : "none"} accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"} style={[style, { opacity: phase, transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }, { scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>{children}</Animated.View>;
}
