import { createThemedStyles } from "../theme";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import Reanimated, { SensorType, useAnimatedReaction, useAnimatedSensor, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { waterTiltTarget } from "../domain/water-motion";

export function GravityWaterLayer({ children }: { children: ReactNode }) {
  const { sensor } = useAnimatedSensor(SensorType.GRAVITY, { interval: 32, adjustToInterfaceOrientation: true });
  const filteredX = useSharedValue(0);
  const filteredY = useSharedValue(-9.81);
  const flat = useSharedValue(true);
  const initialized = useSharedValue(false);
  const target = useSharedValue(0);
  const angle = useSharedValue(0);
  useAnimatedReaction(() => ({ x: sensor.value.x, y: sensor.value.y }), ({ x, y }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    flat.value = Math.hypot(x, y) < (flat.value ? 2.2 : 1.5);
    let next: number;
    if (flat.value) {
      initialized.value = false;
      filteredX.value = 0;
      filteredY.value = -9.81;
      next = waterTiltTarget(0, 0, target.value);
    } else {
      const blend = initialized.value ? 0.22 : 1;
      initialized.value = true;
      filteredX.value += (x - filteredX.value) * blend;
      filteredY.value += (y - filteredY.value) * blend;
      next = waterTiltTarget(filteredX.value, filteredY.value, target.value);
    }
    if (Math.abs(next - target.value) < 0.003) return;
    target.value = next;
    angle.value = withSpring(next, { stiffness: 65, damping: 16, mass: 1, energyThreshold: 0.000001 });
  });
  const tiltStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}rad` }] }));
  return <Reanimated.View pointerEvents="none" style={[s.plane, tiltStyle]}>{children}</Reanimated.View>;
}
const s = createThemedStyles({ plane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } });
