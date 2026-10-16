import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";

import { tabs, type TabKey } from "../navigation/tabs";
import { resetBottomNavigation, subscribeBottomNavigation } from "../navigation/bottomNavigationVisibility";
import { TRACK_TARGET_FRAME_DELAYS, trackTargetFrames } from "./trackTargetFrames";

const PASTEL_TONES = [
  { icon: "#fbcfe8", halo: "rgba(251,207,232,.28)" },
  { icon: "#bfdbfe", halo: "rgba(191,219,254,.28)" },
  { icon: "#bbf7d0", halo: "rgba(187,247,208,.28)" },
  { icon: "#fde68a", halo: "rgba(253,230,138,.28)" },
  { icon: "#ddd6fe", halo: "rgba(221,214,254,.28)" },
  { icon: "#fecdd3", halo: "rgba(254,205,211,.28)" },
] as const;

const ANIMATED_ICON_DURATION: Partial<Record<TabKey, number>> = {
  tasks: 2050,
  track: 2540,
  practice: 3150,
  progress: 2050,
};

function randomPastelTone() {
  return PASTEL_TONES[Math.floor(Math.random() * PASTEL_TONES.length)];
}

function animatedIconSource(tab: TabKey, isPlaying: boolean) {
  if (tab === "tasks") return isPlaying
    ? require("../../assets/clipboard-text-pinch.webp")
    : require("../../assets/clipboard-text-pinch-final.png");
  if (tab === "practice") return isPlaying
    ? require("../../assets/file-pencil-pinch.webp")
    : require("../../assets/file-pencil-pinch-final.png");
  return isPlaying
    ? require("../../assets/chart-bar-grow-pinch.webp")
    : require("../../assets/chart-bar-grow-pinch-final.png");
}

type Props = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  practiceSessionEnabled?: boolean;
  trackProgressEnabled?: boolean;
  profileAvatar?: ImageSourcePropType;
};

export function BottomNavigation({
  activeTab,
  onChange,
  practiceSessionEnabled = true,
  trackProgressEnabled = true,
  profileAvatar,
}: Props) {
  const [visible, setVisible] = useState(true);
  const height = useRef(new Animated.Value(84)).current;
  const visibleTabs = tabs.filter(
    (tab) =>
      (tab.key !== "practice" || practiceSessionEnabled) &&
      (!(["track", "progress"] as TabKey[]).includes(tab.key) || trackProgressEnabled),
  );

  useEffect(() => subscribeBottomNavigation(setVisible), []);
  useEffect(() => {
    Animated.timing(height, { toValue: visible ? 84 : 0, duration: 180, useNativeDriver: false }).start();
  }, [height, visible]);
  return (
    <Animated.View pointerEvents={visible ? "auto" : "none"} style={[styles.container, { height }]}>
      <View style={styles.wrap}>
        <BlurView
          intensity={36}
          tint="dark"
          style={styles.glass}
        >
          {visibleTabs.map((tab) => (
            <NavigationItem
              key={tab.key}
              tab={tab}
              active={tab.key === activeTab}
              profileAvatar={profileAvatar}
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

function NavigationItem({ tab, active, onPress, profileAvatar }: { tab: (typeof tabs)[number]; active: boolean; onPress: () => void; profileAvatar?: ImageSourcePropType }) {
  const scale = useRef(new Animated.Value(1)).current;
  const labelOpacity = useRef(new Animated.Value(active ? 1 : 0.6)).current;
  const animationDuration = ANIMATED_ICON_DURATION[tab.key];
  const hasAnimatedIcon = Boolean(animationDuration);
  const [playAnimatedIcon, setPlayAnimatedIcon] = useState(active && hasAnimatedIcon);
  const [pastelTone, setPastelTone] = useState(randomPastelTone);
  const [trackFrameIndex, setTrackFrameIndex] = useState(trackTargetFrames.length - 1);
  useEffect(() => {
    if (!active || !hasAnimatedIcon) {
      setPlayAnimatedIcon(false);
      return;
    }
    setPastelTone(randomPastelTone());
    setPlayAnimatedIcon(true);
    const timeout = setTimeout(() => setPlayAnimatedIcon(false), animationDuration);
    return () => clearTimeout(timeout);
  }, [active, animationDuration, hasAnimatedIcon]);
  useEffect(() => {
    if (!active || tab.key !== "track") {
      setTrackFrameIndex(trackTargetFrames.length - 1);
      return;
    }
    let frame = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setTrackFrameIndex(frame);
    const showNextFrame = () => {
      timeout = setTimeout(() => {
        frame += 1;
        if (frame >= trackTargetFrames.length) return;
        setTrackFrameIndex(frame);
        showNextFrame();
      }, TRACK_TARGET_FRAME_DELAYS[frame] ?? 30);
    };
    showNextFrame();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [active, tab.key]);
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
      <Animated.View style={[styles.iconWrap, active && { backgroundColor: pastelTone.halo }, { transform: [{ scale }] }]}>
        {tab.key === "profile" && profileAvatar ? (
          <Image source={profileAvatar} style={[styles.profileAvatarIcon, !active && styles.profileAvatarIconInactive]} />
        ) : hasAnimatedIcon ? (
          <Image
            source={tab.key === "track"
              ? trackTargetFrames[playAnimatedIcon ? trackFrameIndex : trackTargetFrames.length - 1]
              : animatedIconSource(tab.key, playAnimatedIcon)}
            style={[styles.animatedNavIcon, { tintColor: active ? "#f4f4f5" : "rgba(228,228,231,.72)" }, !active && styles.animatedNavIconInactive]}
            accessibilityLabel={tab.label}
          />
        ) : (
          <MaterialCommunityIcons name={(active ? tab.activeIcon : tab.icon) as never} size={20} color={active ? "#f4f4f5" : "rgba(228,228,231,.62)"} />
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
  item: { zIndex: 1, flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  iconWrap: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  animatedNavIcon: { width: 21, height: 21 },
  animatedNavIconInactive: { opacity: 0.46 },
  profileAvatarIcon: { width: 21, height: 21, borderRadius: 11 },
  profileAvatarIconInactive: { opacity: 0.62 },
  label: { color: "rgba(228,228,231,.62)", fontSize: 9, fontWeight: "600", letterSpacing: 0.1 },
  labelActive: { color: "#f4f4f5", fontWeight: "800" },
});
