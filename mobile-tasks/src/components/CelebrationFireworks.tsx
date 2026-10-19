import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

const bursts = [{ left: "17%", top: "20%" }, { left: "82%", top: "27%" }, { left: "27%", top: "72%" }, { left: "76%", top: "77%" }] as const;
const colors = ["#fcd34d", "#a78bfa", "#67e8f9", "#fb7185", "#86efac"];

function FireworkBurst({ index }: { index: number }) {
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(index * 550),
      Animated.loop(Animated.sequence([
        Animated.timing(phase, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(600),
      ])),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, phase]);
  return <View style={{ position: "absolute", left: bursts[index]!.left, top: bursts[index]!.top }}>
    {Array.from({ length: 12 }, (_, spark) => {
      const angle = spark * Math.PI / 6;
      const distance = 65 + spark % 3 * 18;
      return <Animated.View key={spark} style={{
        position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: colors[(index + spark) % colors.length],
        opacity: phase.interpolate({ inputRange: [0, 0.12, 0.6, 0.85, 1], outputRange: [0, 1, 0.8, 0, 0] }),
        transform: [
          { translateX: phase.interpolate({ inputRange: [0, 0.12, 0.6, 1], outputRange: [0, 0, Math.cos(angle) * distance, Math.cos(angle) * distance] }) },
          { translateY: phase.interpolate({ inputRange: [0, 0.12, 0.6, 1], outputRange: [18, 0, Math.sin(angle) * distance, Math.sin(angle) * distance + 28] }) },
          { scale: phase.interpolate({ inputRange: [0, 0.12, 0.6, 1], outputRange: [0.2, 1.2, 0.7, 0.1] }) },
        ],
      }} />;
    })}
  </View>;
}

export function CelebrationFireworks() {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  if (reducedMotion) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
    {bursts.map((_, index) => <FireworkBurst key={index} index={index} />)}
  </View>;
}
