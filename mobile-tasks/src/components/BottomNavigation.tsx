import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";

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
  const scale = useRef(new Animated.Value(1)).current;
  const labelOpacity = useRef(new Animated.Value(active ? 1 : 0.6)).current;
  const hasAnimatedIcon = tab.key === "tasks" || tab.key === "progress";
  const [playAnimatedIcon, setPlayAnimatedIcon] = useState(active && hasAnimatedIcon);
  useEffect(() => {
    if (!active || !hasAnimatedIcon) {
      setPlayAnimatedIcon(false);
      return;
    }
    setPlayAnimatedIcon(true);
    const timeout = setTimeout(() => setPlayAnimatedIcon(false), 2050);
    return () => clearTimeout(timeout);
  }, [active, hasAnimatedIcon]);
  useEffect(() => {
    if (active) {
      if (hasAnimatedIcon) {
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 1, useNativeDriver: true }),
          Animated.timing(labelOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]).start();
        return;
      }
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.12, duration: 120, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, damping: 15, stiffness: 260, mass: 0.5, useNativeDriver: true }),
        ]),
        Animated.timing(labelOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(labelOpacity, { toValue: 0.6, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [active, hasAnimatedIcon, labelOpacity, scale]);
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab.label} onPress={onPress} style={styles.item}>
      <Animated.View style={{ transform: [{ scale }] }}>
        {hasAnimatedIcon ? (
          <Image
            source={playAnimatedIcon
              ? tab.key === "tasks"
                ? require("../../assets/clipboard-text-pinch.webp")
                : require("../../assets/chart-bar-grow-pinch.webp")
              : tab.key === "tasks"
                ? require("../../assets/clipboard-text-pinch-final.png")
                : require("../../assets/chart-bar-grow-pinch-final.png")}
            style={styles.animatedNavIcon}
            accessibilityLabel={tab.label}
          />
        ) : (
          <MaterialCommunityIcons name={(active ? tab.activeIcon : tab.icon) as never} size={20} color={active ? "#dbeafe" : "rgba(228,228,231,.62)"} />
        )}
      </Animated.View>
      <Animated.Text style={[styles.label, active && styles.labelActive, { opacity: labelOpacity }]}>{tab.label}</Animated.Text>
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
  animatedNavIcon: { width: 21, height: 21, tintColor: "#dbeafe" },
  label: { color: "rgba(228,228,231,.62)", fontSize: 9, fontWeight: "600", letterSpacing: 0.1 },
  labelActive: { color: "#dbeafe", fontWeight: "800" },
});
