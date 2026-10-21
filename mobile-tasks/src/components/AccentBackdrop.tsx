import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View } from "react-native";
import { useAppAccent } from "../theme";
/** Decorative layer only: never intercepts scrolls or changes text colors. */
export function AccentBackdrop() {
  const accent = useAppAccent();
  const drift = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReducedMotion(value);
      })
      .catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    let motion: Animated.CompositeAnimation | null = null;
    const stop = () => {
      motion?.stop();
      motion = null;
    };
    const start = () => {
      if (motion || reducedMotion) return;
      motion = Animated.loop(
        Animated.sequence([
          Animated.timing(drift, {
            toValue: 1,
            duration: 14000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift, {
            toValue: -1,
            duration: 22000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift, {
            toValue: 0,
            duration: 14000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      motion.start();
    };
    if (reducedMotion) drift.setValue(0);
    else if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [drift, reducedMotion]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View
        style={{
          position: "absolute",
          top: -8,
          left: -28,
          right: -28,
          height: 490,
          opacity: drift.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.88, 1, 0.94] }),
          transform: [
            { translateX: drift.interpolate({ inputRange: [-1, 1], outputRange: [-18, 18] }) },
            { translateY: drift.interpolate({ inputRange: [-1, 1], outputRange: [-4, 6] }) },
          ],
        }}
      >
        <Svg width="100%" height={490}>
          <Defs>
            <RadialGradient id="accent-halo" cx="52%" cy="0%" rx="70%" ry="95%">
              <Stop offset="0" stopColor={accent} stopOpacity={0.16} />
              <Stop offset="0.55" stopColor={accent} stopOpacity={0.055} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#accent-halo)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
