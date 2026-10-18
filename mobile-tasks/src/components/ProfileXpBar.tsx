import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const randomBubble = () => ({
  left: 3 + Math.random() * 94,
  size: 2 + Math.random() * 2,
  drift: -9 + Math.random() * 18,
  duration: 900 + Math.round(Math.random() * 1400),
  delay: Math.round(Math.random() * 650),
});

function RandomXpBubble({ vertical = false }: { vertical?: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  const [bubble, setBubble] = useState(randomBubble);
  useEffect(() => {
    let active = true;
    phase.setValue(0);
    const animation = Animated.timing(phase, {
      toValue: 1,
      delay: bubble.delay,
      duration: bubble.duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (active && finished) setBubble(randomBubble());
    });
    return () => {
      active = false;
      animation.stop();
    };
  }, [phase, bubble]);
  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: vertical ? 2 : `${bubble.left}%`,
          top: vertical ? `${bubble.left}%` : 3,
          width: bubble.size,
          height: bubble.size,
          opacity: phase.interpolate({
            inputRange: [0, 0.2, 0.75, 1],
            outputRange: [0, 0.7, 0.6, 0],
          }),
          transform: [
            { translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [6, -7] }) },
            {
              translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [0, bubble.drift] }),
            },
            { scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
          ],
        },
      ]}
    />
  );
}

/** Fill on each Profile visit, with a gentle game-style simmer inside the XP. */
export function LiquidProgressBar({
  progress,
  vertical = false,
  color = "#9b75f5",
  height = 9,
  label = "Study progress",
  style,
  bubbleCount = 3,
}: {
  progress: number;
  vertical?: boolean;
  color?: string;
  height?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
  bubbleCount?: number;
}) {
  const fill = useRef(new Animated.Value(0)).current;
  const simmer = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const target = Math.max(0, Math.min(1, progress));
  const simmering = target > 0;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (reducedMotion) {
      fill.setValue(target);
      return;
    }
    const animation = Animated.timing(fill, {
      toValue: target,
      delay: 120,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fill, target, reducedMotion]);
  useEffect(() => {
    if (reducedMotion || !simmering) return;
    simmer.setValue(0);
    const animation = Animated.loop(
      Animated.timing(simmer, {
        toValue: 1,
        duration: 2100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [simmer, reducedMotion, simmering]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
      onLayout={(event) => setWidth(vertical ? event.nativeEvent.layout.height : event.nativeEvent.layout.width)}
      style={[styles.track, vertical ? { height: "100%", width: height } : { height }, style]}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: color },
          vertical
            ? { width: "100%", bottom: undefined, height: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }
            : { width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
        ]}
      >
        {!reducedMotion && (
          <>
            <Animated.View
              style={[
                styles.shine,
                vertical && { width: "100%", height: 30, bottom: undefined },
                {
                  transform: [
                    vertical ? {
                      translateY: simmer.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-40, width + 40],
                      }),
                    } : {
                      translateX: simmer.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-40, width + 40],
                      }),
                    },
                  ],
                },
              ]}
            />
            {simmering &&
              Array.from({ length: bubbleCount }, (_, index) => <RandomXpBubble key={index} vertical={vertical} />)}
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 9,
    overflow: "hidden",
    borderRadius: 6,
    backgroundColor: "#303030",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "#9b75f5",
  },
  shine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 30,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,.23)",
  },
  bubble: {
    position: "absolute",
    top: 3,
    borderRadius: 3,
    backgroundColor: "#f5f5f5",
    opacity: 0.65,
  },
});

export function ProfileXpBar({ progress }: { progress: number }) {
  return (
    <LiquidProgressBar progress={progress} label="XP progress to next level" bubbleCount={6} />
  );
}
