import { colors } from "../theme";
import { createThemedStyles } from "../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { NumberFlow } from "number-flow-react-native";

export function TaskOverview({ total, due, percent, dueOnly, onFilterChange, studyTime, meterLabel = "Task Meter" }: {
  total: number; due: number; percent: number; dueOnly: boolean;
  onFilterChange: (dueOnly: boolean) => void; studyTime?: ReactNode; meterLabel?: string;
}) {
  const slide = useRef(new Animated.Value(dueOnly ? 1 : 0)).current;
  const previousFilter = useRef(dueOnly);
  const indicatorWidth = 71;
  useEffect(() => {
    if (previousFilter.current === dueOnly) return;
    previousFilter.current = dueOnly;
    Animated.timing(slide, { toValue: dueOnly ? 1 : 0, duration: 260,
      easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
    return () => slide.stopAnimation();
  }, [dueOnly, slide]);
  return <View style={{ marginTop: 26 }}>
  <View style={s.row}>
    <View>
      <Text style={s.label} numberOfLines={1} adjustsFontSizeToFit>Filter</Text>
      <View style={s.filters}>
        <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0,
          width: indicatorWidth, borderRadius: 8, backgroundColor: colors.accent,
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, indicatorWidth] }) }] }} />
        {[false, true].map((value) => <Pressable key={String(value)} accessibilityRole="button"
          accessibilityState={{ selected: dueOnly === value }} onPress={() => onFilterChange(value)} style={s.filter}>
          <Text style={{ color: dueOnly === value ? colors.accentDeep : "white", fontSize: 12 }}>
            {value ? "Due (" + due + ")" : "All (" + total + ")"}
          </Text>
        </Pressable>)}
      </View>
    </View>
    <View style={s.metrics}>
      <View style={s.metric}>
        <Text style={s.label} numberOfLines={1} adjustsFontSizeToFit>{meterLabel}</Text>
        <View style={s.value}>
          <MaterialCommunityIcons name="speedometer" size={16} color="white" />
          <NumberFlow value={percent} suffix="%" style={{ color: "white", fontSize: 16, fontWeight: "800" }} />
        </View>
      </View>
    </View>
  </View>
  {studyTime && <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 14, marginTop: 10 }}>
    {studyTime && <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <MaterialCommunityIcons name="clock-outline" size={13} color="#888" />
      <Text style={{ color: "#888", fontSize: 12 }}>Study time</Text>{studyTime}
    </View>}

  </View>}
  </View>;
}
const s = createThemedStyles({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { color: "#777", fontSize: 11, lineHeight: 14, height: 14, marginBottom: 7 },
  filters: { width: 144, flexDirection: "row", borderWidth: 1, borderColor: "#292929", borderRadius: 10, overflow: "hidden" },
  filter: { flex: 1, alignItems: "center", height: 30, justifyContent: "center", paddingHorizontal: 5 },
  metrics: { flexDirection: "row" },
  metric: { alignItems: "flex-end" },
  value: { height: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1,
    borderColor: "#292929", borderRadius: 10, paddingHorizontal: 9 },
});
