import { createThemedStyles } from "../theme";
import { Animated, StyleSheet, View } from "react-native";
import { heatmapCellColors } from "../domain/heatmap-colors";
import type { HeatmapColorCycle } from "../domain/heatmap-colors";
import { useHeatmapLiquidMotion } from "../hooks/use-heatmap-liquid-motion";

export function ProfileAvatarLiquid({ size, theme }: { size: number; theme: HeatmapColorCycle }) {
  const { phase, reveal, cycle } = useHeatmapLiquidMotion(theme);
  const colors = heatmapCellColors("profile-avatar", 2, cycle);
  return (
    <View pointerEvents="none" style={[styles.clip, { backgroundColor: colors.previous }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.color,
            transform: [
              {
                translateY: reveal.interpolate({
                  inputRange: [0, 0.4],
                  outputRange: [size, 0],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.shine,
            {
              transform: [
                {
                  translateX: phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, size + 20],
                  }),
                },
                { rotate: "20deg" },
              ],
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}
const styles = createThemedStyles({
  clip: { ...StyleSheet.absoluteFill, borderRadius: 999, overflow: "hidden" },
  shine: {
    position: "absolute",
    top: -20,
    bottom: -20,
    width: 10,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});
