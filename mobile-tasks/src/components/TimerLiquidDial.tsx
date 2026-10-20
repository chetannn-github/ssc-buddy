import { createThemedStyles } from "../theme";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { GravityWaterLayer } from "./GravityWaterLayer";
import { TaskRingFill } from "./TaskRingFill";
import type { timerDial } from "../domain/date-timers";

export function TimerLiquidDial({ dial, color, size = 160, children, title, onEdit, onLongPress, fillColor, showLiquid = true, liquidProgress, animateOnMount = false }: { dial: ReturnType<typeof timerDial>; color: string; size?: number; children?: ReactNode; title?: string; onEdit?: () => void; onLongPress?: (event: GestureResponderEvent) => void; fillColor?: string; showLiquid?: boolean; liquidProgress?: number; animateOnMount?: boolean }) {
  const gradientId = `task-water-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const liquidColor = fillColor ?? color + (size < 160 ? "b3" : "80");
  const scale = size / 160;
  const tankSize = 118 * scale;
  const fill = Math.max(0, Math.min(1, dial.progress));
  const liquidFill = Math.max(0, Math.min(1, liquidProgress ?? fill));
  const level = useRef(new Animated.Value(animateOnMount ? 0 : liquidFill)).current;
  const phase = useRef(new Animated.Value(0)).current;
  const splash = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const impulse = useRef({ target: 0, time: 0, revision: 0 });
  const [motionReady, setMotionReady] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) { setReduced(value); setMotionReady(true); } }).catch(() => { if (mounted) setMotionReady(true); });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    const state = AppState.addEventListener("change", value => setActive(value === "active"));
    return () => { mounted = false; motion.remove(); state.remove(); };
  }, []);
  useEffect(() => {
    if (!motionReady) return;
    level.stopAnimation();
    if (reduced || !active) { level.setValue(liquidFill); return; }
    const animation = Animated.timing(level, { toValue: liquidFill, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [level, liquidFill, reduced, active, motionReady]);
  const bubbling = showLiquid && !reduced && active && liquidFill > 0;
  useEffect(() => {
    if (!bubbling) return;
    const animation = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 3600, easing: Easing.linear, useNativeDriver: true }));
    phase.setValue(0);
    animation.start();
    return () => animation.stop();
  }, [phase, bubbling]);
  useEffect(() => {
    if (reduced || !active || liquidFill === 0) {
      impulse.current.revision += 1;
      impulse.current.target = 0;
      lift.stopAnimation();
      lift.setValue(0);
    }
    return () => { impulse.current.revision += 1; lift.stopAnimation(); };
  }, [lift, reduced, active, liquidFill === 0]);
  useEffect(() => () => splash.stopAnimation(), [splash]);
  const play = () => {
    if (!showLiquid || reduced || !active || liquidFill === 0) return;
    const now = Date.now();
    const previous = impulse.current;
    const revision = previous.revision + 1;
    const retained = previous.target * Math.exp(-(now - previous.time) / 1500);
    impulse.current = { ...previous, time: now, revision };
    // A burst of taps adds lift; a damped spring lets it settle back afterwards.
    lift.stopAnimation((current) => {
      if (impulse.current.revision !== revision) return;
      const target = Math.min(tankSize, Math.max(0, current, retained) + tankSize * 0.14);
      impulse.current.target = target;
      Animated.sequence([
        Animated.timing(lift, { toValue: target, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(lift, { toValue: 0, stiffness: 10, damping: 5, mass: 1.4, restDisplacementThreshold: 0.1, restSpeedThreshold: 0.1, useNativeDriver: true }),
      ]).start();
    });
    splash.stopAnimation();
    splash.setValue(0);
    Animated.timing(splash, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }).start();
  };
  const WaterPlane = active && !reduced ? GravityWaterLayer : StillWaterLayer;
  return <View style={[s.section, { width: size, height: size }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${dial.label} ${dial.status.toLowerCase()}${showLiquid ? ", play with water" : ""}`} onPress={play} onLongPress={onLongPress} style={[s.dial, { width: size, height: size }]}>
      {showLiquid && <View pointerEvents="none" style={[s.tank, { top: 21 * scale, left: 21 * scale, width: tankSize, height: tankSize, borderRadius: tankSize / 2, backgroundColor: color + "0d" }]}>
        <WaterPlane>
        <Animated.View style={[s.fill, { height: level.interpolate({ inputRange: [0, 1], outputRange: [0, tankSize], extrapolate: "clamp" }), opacity: level.interpolate({ inputRange: [0, 0.002, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }) }]}>
          <Animated.View style={[s.liquidBody, { bottom: -tankSize, backgroundColor: liquidColor, transform: [{ translateY: lift.interpolate({ inputRange: [-tankSize, 0, tankSize], outputRange: [3 * scale, 0, -tankSize], extrapolate: "clamp" }) }] }]}>
          {fillColor && <Svg pointerEvents="none" width="100%" height={tankSize * 2} style={{ position: "absolute", top: 0, left: 0 }}><Defs><LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#3b82f6" /><Stop offset="0.35" stopColor={fillColor} /><Stop offset="1" stopColor="#0c2460" /></LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${gradientId})`} /></Svg>}
          <Animated.View style={[s.wave, { transform: [{ translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [-116, 0] }) }] }]}>
            <Svg width={348} height={14} viewBox="0 0 348 14"><Path d="M0 7 Q14.5 0 29 7 T58 7 T87 7 T116 7 T145 7 T174 7 T203 7 T232 7 T261 7 T290 7 T319 7 T348 7 V14 H0Z" fill={fillColor ? "#3b82f6" : color} /></Svg>
          </Animated.View>
          <Animated.View style={[s.ripple, { left: (tankSize - 64) / 2, top: 6 * scale, opacity: splash.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.8, 0] }), transform: [{ scale: splash.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.4] }) }] }]} />
          {!reduced && [0, 1, 2].map(index => <Animated.View key={index} style={[s.bubble, { left: `${25 + index * 25}%`, bottom: tankSize, opacity: phase.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.65, 0.4, 0] }), transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [index * 20, -116 + index * 20] }) }] }]} />)}
          </Animated.View>
        </Animated.View>
        </WaterPlane>
        <View pointerEvents="none" style={[s.glass, { borderRadius: tankSize / 2 }]} />
      </View>}
      <View pointerEvents="none" style={{ position: "absolute", left: 12.5 * scale, top: 12.5 * scale, width: 135 * scale, height: 135 * scale }}><TaskRingFill percent={fill * 100} size={135 * scale} stroke={9 * scale} color={color} /></View>
      <View pointerEvents="none" style={[s.text, { paddingHorizontal: 26 * scale, paddingBottom: title ? 22 * scale : 0 }]}>{children ?? <><Text adjustsFontSizeToFit numberOfLines={1} style={[s.number, { fontSize: 32 * scale }]}>{dial.label}</Text>{dial.status ? <Text style={[s.unit, { fontSize: 10 * scale }]}>{dial.status}</Text> : null}</>}</View>
    </Pressable>
    {title && <Pressable pointerEvents={onEdit ? "auto" : "none"} accessible={Boolean(onEdit)} accessibilityRole="button" accessibilityLabel={`Edit ${title}`} onPress={onEdit} onLongPress={onLongPress} style={{ position: "absolute", left: size * 0.22, top: size * 0.59, width: size * 0.56, height: size * 0.24, alignItems: "center", justifyContent: "center" }}><Text numberOfLines={2} style={{ color: "#fff", fontSize: 11 * scale, fontWeight: "700", textAlign: "center", textShadowColor: "#000", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }}>{title}</Text></Pressable>}
  </View>;
}

function StillWaterLayer({ children }: { children: ReactNode }) {
  return <View pointerEvents="none" style={s.waterPlane}>{children}</View>;
}

const s = createThemedStyles({
  waterPlane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  section: { alignSelf: "center", alignItems: "center", marginTop: 4, gap: 12 }, dial: { width: 160, height: 160 },
  tank: { position: "absolute", top: 21, left: 21, width: 118, height: 118, borderRadius: 59, overflow: "hidden" },
  glass: { position: "absolute", inset: 0, borderRadius: 59, borderWidth: 1, borderColor: "#ffffff16" },
  liquidBody: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  fill: { position: "absolute", bottom: 0, left: 0, right: 0 }, wave: { position: "absolute", top: -7, left: 0, width: 348, height: 14 },
  ripple: { position: "absolute", left: 27, top: "40%", width: 64, height: 24, borderRadius: 32, borderWidth: 2, borderColor: "#ffffffa0" },
  bubble: { position: "absolute", bottom: 0, width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: "#ffffff90" },
  text: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 26 },
  number: { color: "#fff", fontSize: 32, fontWeight: "600", fontVariant: ["tabular-nums"], textShadowColor: "#000", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  unit: { color: "#fff", fontSize: 10, letterSpacing: 1.5, marginTop: 4, textShadowColor: "#000", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
});
