import { useEffect, useId, useState } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Mask, Rect, Stop } from "react-native-svg";
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);
const AnimatedRect = Reanimated.createAnimatedComponent(Rect);

export function MusicLiquidRing({
  size,
  progress,
  active,
  rounded = false,
  radius,
  stroke = 4,
}: {
  size: number;
  progress: number;
  active: boolean;
  rounded?: boolean;
  radius?: number;
  stroke?: number;
}) {
  const id = `music-liquid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const phase = useSharedValue(0);
  const [reduced, setReduced] = useState(true);
  const center = size / 2;
  const r = radius ?? (size - stroke) / 2;
  const edge = size - stroke;
  const corner = Math.min(7, edge / 2);
  const length = rounded ? 4 * edge - 8 * corner + 2 * Math.PI * corner : 2 * Math.PI * r;
  const value = Math.max(0, Math.min(1, progress));
  const animating = active && !reduced && value > 0;
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((next) => {
        if (mounted) setReduced(next);
      })
      .catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (!animating) return;
    phase.value = 0;
    phase.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(phase);
  }, [animating, phase]);
  const shine = useAnimatedProps(() => ({ strokeDashoffset: -length * phase.value }));
  const wave = useAnimatedProps(() => ({ strokeDashoffset: length * phase.value * 0.5 }));
  const geometry = rounded
    ? { x: stroke / 2, y: stroke / 2, width: edge, height: edge, rx: corner }
    : { cx: center, cy: center, r, rotation: -90, origin: `${center}, ${center}` };
  const Shape = rounded ? Rect : Circle;
  const MovingShape = rounded ? AnimatedRect : AnimatedCircle;
  return (
    <Svg pointerEvents="none" accessible={false} width={size} height={size} style={styles.ring}>
      <Defs>
        <LinearGradient id={`${id}-color`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ff7180" />
          <Stop offset="0.5" stopColor="#ef4444" />
          <Stop offset="1" stopColor="#be123c" />
        </LinearGradient>
        <Mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
          <Shape
            {...geometry}
            fill="none"
            stroke="white"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - value)}
            opacity={value > 0 ? 1 : 0}
          />
        </Mask>
      </Defs>
      <Shape {...geometry} fill="none" stroke="#3d3d3d" strokeWidth={stroke} />
      <G mask={`url(#${id})`}>
        <Shape {...geometry} fill="none" stroke={`url(#${id}-color)`} strokeWidth={stroke} />
        {!reduced && (
          <>
            <MovingShape
              {...geometry}
              fill="none"
              stroke="#ffd1d4"
              strokeWidth={stroke * 0.5}
              strokeLinecap="round"
              strokeDasharray={[length * 0.12, length * 0.88]}
              opacity={0.7}
              animatedProps={shine}
            />
            <MovingShape
              {...geometry}
              fill="none"
              stroke="#fff1f2"
              strokeWidth={stroke * 0.3}
              strokeLinecap="round"
              strokeDasharray={[1, length * 0.09, 1.5, length * 0.14]}
              opacity={0.5}
              animatedProps={wave}
            />
          </>
        )}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({ ring: { position: "absolute", top: 0, left: 0 } });
