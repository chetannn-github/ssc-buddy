import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { tabs, type TabKey } from "../navigation/tabs";
import { resetBottomNavigation, subscribeBottomNavigation } from "../navigation/bottomNavigationVisibility";

type Props = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  practiceSessionEnabled?: boolean;
  trackProgressEnabled?: boolean;
};

export function BottomNavigation({
  activeTab,
  onChange,
  practiceSessionEnabled = true,
  trackProgressEnabled = true,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [navWidth, setNavWidth] = useState(0);
  const height = useRef(new Animated.Value(84)).current;
  const indicatorX = useRef(new Animated.Value(0)).current;
  const visibleTabs = tabs.filter(
    (tab) =>
      (tab.key !== "practice" || practiceSessionEnabled) &&
      (!(["track", "progress"] as TabKey[]).includes(tab.key) || trackProgressEnabled),
  );
  const activeIndex = Math.max(0, visibleTabs.findIndex((tab) => tab.key === activeTab));

  useEffect(() => subscribeBottomNavigation(setVisible), []);
  useEffect(() => {
    Animated.timing(height, { toValue: visible ? 84 : 0, duration: 180, useNativeDriver: false }).start();
  }, [height, visible]);
  useEffect(() => {
    if (!navWidth) return;
    Animated.spring(indicatorX, {
      toValue: activeIndex * (navWidth / visibleTabs.length),
      damping: 17,
      stiffness: 220,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicatorX, navWidth, visibleTabs.length]);

  return (
    <Animated.View pointerEvents={visible ? "auto" : "none"} style={[styles.container, { height }]}>
      <View style={styles.wrap}>
        <BlurView
          intensity={36}
          tint="dark"
          blurMethod="dimezisBlurView"
          style={styles.glass}
          onLayout={(event) => setNavWidth(event.nativeEvent.layout.width)}
        >
          {navWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activeGlass,
                {
                  width: navWidth / visibleTabs.length - 8,
                  transform: [{ translateX: Animated.add(indicatorX, 4) }],
                },
              ]}
            />
          )}
          {visibleTabs.map((tab) => (
            <NavigationItem
              key={tab.key}
              tab={tab}
              active={tab.key === activeTab}
              onPress={() => {
                resetBottomNavigation();
                onChange(tab.key);
              }}
            />
          ))}
        </BlurView>
      </View>
    </Animated.View>
  );
}

function NavigationItem({ tab, active, onPress }: { tab: (typeof tabs)[number]; active: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(active ? 1 : 0.9)).current;
  const lift = useRef(new Animated.Value(active ? -4 : 0)).current;
  const labelOpacity = useRef(new Animated.Value(active ? 1 : 0.6)).current;
  const iconTilt = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) {
      Animated.parallel([
        Animated.sequence([
          Animated.spring(scale, { toValue: 1.24, damping: 9, stiffness: 330, mass: 0.42, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, damping: 13, stiffness: 230, mass: 0.55, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.spring(lift, { toValue: -7, damping: 11, stiffness: 290, mass: 0.5, useNativeDriver: true }),
          Animated.spring(lift, { toValue: -4, damping: 13, stiffness: 240, mass: 0.56, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(iconTilt, { toValue: 1, duration: 95, useNativeDriver: true }),
          Animated.spring(iconTilt, { toValue: 0, damping: 10, stiffness: 240, mass: 0.48, useNativeDriver: true }),
        ]),
        Animated.timing(labelOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.9, damping: 14, stiffness: 240, mass: 0.55, useNativeDriver: true }),
      Animated.spring(lift, { toValue: 0, damping: 14, stiffness: 240, mass: 0.58, useNativeDriver: true }),
      Animated.timing(iconTilt, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(labelOpacity, { toValue: 0.6, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [active, iconTilt, labelOpacity, lift, scale]);
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab.label} onPress={onPress} style={styles.item}>
      <Animated.View style={{ transform: [{ translateY: lift }, { scale }, { rotate: iconTilt.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-10deg"] }) }] }}>
        <MaterialCommunityIcons name={tab.icon as never} size={20} color={active ? "#dbeafe" : "rgba(228,228,231,.62)"} />
      </Animated.View>
      <Animated.Text style={[styles.label, active && styles.labelActive, { opacity: labelOpacity, transform: [{ translateY: lift.interpolate({ inputRange: [-4, 0], outputRange: [-1, 0] }) }] }]}>{tab.label}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden", backgroundColor: "transparent" },
  wrap: { flex: 1, paddingHorizontal: 14, paddingVertical: 9 },
  glass: {
    position: "relative",
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.12)",
    borderRadius: 22,
    backgroundColor: "rgba(24,24,27,.72)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 9,
  },
  activeGlass: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(147,197,253,.28)",
    backgroundColor: "rgba(59,130,246,.28)",
  },
  item: { zIndex: 1, flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { color: "rgba(228,228,231,.62)", fontSize: 9, fontWeight: "600", letterSpacing: 0.1 },
  labelActive: { color: "#dbeafe", fontWeight: "800" },
});
