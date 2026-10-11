import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { tabs, type TabKey } from "../navigation/tabs";
import { colors } from "../theme";
import { resetBottomNavigation, subscribeBottomNavigation } from "../navigation/bottomNavigationVisibility";

type Props = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
};

export function BottomNavigation({ activeTab, onChange }: Props) {
  const [visible, setVisible] = useState(true);
  const [navWidth, setNavWidth] = useState(0);
  const height = useRef(new Animated.Value(66)).current;
  const indicatorX = useRef(new Animated.Value(0)).current;
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === activeTab));
  useEffect(() => subscribeBottomNavigation(setVisible), []);
  useEffect(() => {
    Animated.timing(height, { toValue: visible ? 66 : 0, duration: 180, useNativeDriver: false }).start();
  }, [height, visible]);
  useEffect(() => {
    if (!navWidth) return;
    Animated.spring(indicatorX, {
      toValue: activeIndex * (navWidth / tabs.length),
      damping: 18,
      stiffness: 210,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicatorX, navWidth]);
  return (
    <Animated.View pointerEvents={visible ? "auto" : "none"} style={[styles.container, { height }]}>
      <View style={styles.wrap} onLayout={(event) => setNavWidth(event.nativeEvent.layout.width)}>
      {navWidth > 0 && <Animated.View pointerEvents="none" style={[styles.indicator, { width: navWidth / tabs.length, transform: [{ translateX: indicatorX }] }]} />}
      {tabs.map((tab) => <NavigationItem key={tab.key} tab={tab} active={tab.key === activeTab} onPress={() => { resetBottomNavigation(); onChange(tab.key); }} />)}</View>
    </Animated.View>
  );
}

function NavigationItem({ tab, active, onPress }: { tab: (typeof tabs)[number]; active: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(active ? 1 : 0.84)).current;
  const lift = useRef(new Animated.Value(active ? -1 : 0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: active ? 1 : 0.84, damping: 11, stiffness: 270, mass: 0.55, useNativeDriver: true }),
      Animated.spring(lift, { toValue: active ? -1 : 0, damping: 13, stiffness: 240, mass: 0.6, useNativeDriver: true }),
    ]).start();
  }, [active, lift, scale]);
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab.label} onPress={onPress} style={styles.item}>
    <Animated.View style={{ transform: [{ translateY: lift }, { scale }] }}>
      <MaterialCommunityIcons name={tab.icon as never} size={20} color={active ? colors.accent : colors.subdued} />
    </Animated.View>
    <Text style={[styles.label, active && styles.active]}>{tab.label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  container: { overflow: "hidden" },
  wrap: {
    position: "relative",
    flexDirection: "row",
    minHeight: 66,
    paddingTop: 6,
    paddingBottom: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#111111",
  },
  indicator: {
    position: "absolute",
    top: 6,
    bottom: 7,
    borderRadius: 14,
    backgroundColor: "rgba(94,234,212,.14)",
    borderWidth: 1,
    borderColor: "rgba(94,234,212,.18)",
  },
  item: { zIndex: 1, flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { color: colors.subdued, fontSize: 10, fontWeight: "600", letterSpacing: 0.1 },
  active: { color: colors.accent, fontWeight: "800" },
});
