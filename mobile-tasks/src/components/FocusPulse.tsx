import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

/** Opacity only: no layout motion, timer writes or JS animation on native nodes. */
export function FocusPulse({ active = true, children, style, label }: { active?: boolean; children?: ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    opacity.setValue(1);
    if (!active || reduced) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(opacity, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => { animation.stop(); opacity.setValue(1); };
  }, [active, reduced, opacity]);
  return <Animated.View pointerEvents="none" accessible={!!label} accessibilityLabel={label} style={[style, { opacity }]}>{children}</Animated.View>;
}
