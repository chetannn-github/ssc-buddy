import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import Svg, { Circle, Defs, G, Mask } from "react-native-svg";
import Reanimated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);
const randomBubble = () => ({
  position: 0.04 + Math.random() * 0.92,
  size: 0.8 + Math.random() * 0.9,
  drift: (Math.random() - 0.5) * 0.1,
  offset: Math.random() * Math.PI * 2,
  duration: 1000 + Math.round(Math.random() * 1300),
  delay: Math.round(Math.random() * 700),
});

function RingBubble({
  progress,
  center,
  radius,
}: {
  progress: SharedValue<number>;
  center: number;
  radius: number;
}) {
  const phase = useSharedValue(0);
  const [bubble, setBubble] = useState(randomBubble);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const respawn = useCallback(() => {
    if (mounted.current) setBubble(randomBubble());
  }, []);
  useEffect(() => {
    phase.value = 0;
    phase.value = withDelay(
      bubble.delay,
      withTiming(1, { duration: bubble.duration, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(respawn)();
      }),
    );
    return () => cancelAnimation(phase);
  }, [phase, bubble, respawn]);
  const animatedProps = useAnimatedProps(() => {
    const angle =
      -Math.PI / 2 +
      ((bubble.position + Math.sin(phase.value * Math.PI) * bubble.drift) *
        Math.PI *
        2 *
        progress.value) /
        100;
    const distance = radius + Math.sin(phase.value * Math.PI * 2 + bubble.offset) * 2;
    return {
      cx: center + Math.cos(angle) * distance,
      cy: center + Math.sin(angle) * distance,
      r: bubble.size * (0.5 + phase.value * 0.5),
      opacity: Math.sin(phase.value * Math.PI) * 0.85,
    };
  });
  return <AnimatedCircle fill="#e0f2fe" animatedProps={animatedProps} />;
}

/** All liquid effects are masked to the current completion arc. */
export function TaskRingFill({
  percent,
  size = 112,
  stroke = 10,
  color = "#60a5fa",
  liquidBoost = false,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  liquidBoost?: boolean;
}) {
  const value = Math.max(0, Math.min(100, percent));
  const progress = useSharedValue(0);
  const shine = useSharedValue(0);
  const maskId = `task-ring-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [reducedMotion, setReducedMotion] = useState(false);
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * 2 * radius;
  const bubbling = value > 0 && !reducedMotion;
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
    progress.value = reducedMotion
      ? value
      : withTiming(value, { duration: 1000, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(progress);
  }, [progress, value, reducedMotion]);
  useEffect(() => {
    if (!bubbling) return;
    shine.value = 0;
    shine.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(shine);
  }, [shine, bubbling]);
  const maskProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value / 100),
    opacity: progress.value > 0 ? 1 : 0,
  }));
  const shineProps = useAnimatedProps(() => ({ strokeDashoffset: -circumference * shine.value }));

  return (
    <Svg width={size} height={size} style={styles.svg} pointerEvents="none" accessible={false}>
      <Defs>
        <Mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="white"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animatedProps={maskProps}
            rotation="-90"
            origin={`${center}, ${center}`}
          />
        </Mask>
      </Defs>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#343434"
        strokeWidth={stroke}
      />
      <G mask={`url(#${maskId})`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
          />
          {bubbling && (
            <>
              <AnimatedCircle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="#e0f2fe"
                opacity={liquidBoost ? 0.62 : 0.38}
                strokeWidth={stroke * (liquidBoost ? 0.72 : 0.6)}
                strokeLinecap="round"
                strokeDasharray={[liquidBoost ? 24 : 16, circumference - (liquidBoost ? 24 : 16)]}
                animatedProps={shineProps}
                rotation="-90"
                origin={`${center}, ${center}`}
              />
              {Array.from({ length: liquidBoost ? 10 : 7 }, (_, index) => (
                <RingBubble key={index} progress={progress} center={center} radius={radius} />
              ))}
            </>
          )}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({ svg: { position: "absolute", top: 0, left: 0 } });
