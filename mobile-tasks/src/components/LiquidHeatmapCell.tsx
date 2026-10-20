import { createThemedStyles } from "../theme";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HEATMAP_EMPTY_COLOR, heatmapPaletteColor, heatmapCellColors } from "../domain/heatmap-colors";
import type { useHeatmapLiquidMotion } from "../hooks/use-heatmap-liquid-motion";

export function LiquidHeatmapCell({
  level,
  dayKey,
  motion,
  mode,
}: {
  level: number;
  dayKey: string;
  motion: ReturnType<typeof useHeatmapLiquidMotion>;
  mode: "activity" | "tasks";
}) {
  if (level <= 0) return null;
  const { phase, reveal, cycle } = motion;
  const bubbleTiming = heatmapCellColors(dayKey, level, cycle);
  const color = heatmapPaletteColor(level, cycle, mode);
  return (
    <View pointerEvents="none" style={[styles.clip, { backgroundColor: HEATMAP_EMPTY_COLOR }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            height: "100%",
            backgroundColor: color,
            transform: [
              {
                translateY: reveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [13, 0],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.wave,
            {
              transform: [
                { translateX: phase.interpolate({ inputRange: [0, 1], outputRange: [-13, 0] }) },
              ],
            },
          ]}
        >
          <Svg width={39} height={5} viewBox="0 0 60 12">
            <Path d="M0 4 Q5 0 10 4 T20 4 T30 4 T40 4 T50 4 T60 4 V12 H0Z" fill={color} />
          </Svg>
        </Animated.View>
        {[0, 1].map((index) => {
          const start = 0.08 + (bubbleTiming.delay / 1600) * 0.14 + index * 0.4;
          const end = start + 0.32;
          return (
            <Animated.View
              key={index}
              style={[
                styles.bubble,
                {
                  left: index === 0 ? 3 : 9,
                  opacity: phase.interpolate({
                    inputRange: [0, start, start + 0.06, end - 0.06, end, 1],
                    outputRange: [0, 0, 0.7, 0.45, 0, 0],
                  }),
                  transform: [
                    {
                      translateY: phase.interpolate({
                        inputRange: [start, end],
                        outputRange: [14, -3],
                        extrapolate: "clamp",
                      }),
                    },
                    {
                      translateX: phase.interpolate({
                        inputRange: [start, end],
                        outputRange: [0, index === 0 ? 1 : -1],
                        extrapolate: "clamp",
                      }),
                    },
                    {
                      scale: phase.interpolate({
                        inputRange: [start, end],
                        outputRange: [0.5, 1],
                        extrapolate: "clamp",
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = createThemedStyles({
  clip: { ...StyleSheet.absoluteFill, borderRadius: 2, overflow: "hidden" },
  fill: { position: "absolute", left: 0, right: 0, bottom: 0 },
  wave: { position: "absolute", left: 0, top: -2, width: 39, height: 5 },

  bubble: {
    position: "absolute",
    top: 0,
    width: 1.8,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: "#f0fdfa",
  },
});
