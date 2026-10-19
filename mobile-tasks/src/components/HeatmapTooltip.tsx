import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export type HeatmapTooltipData = { text: string; x: number; y: number; containerWidth: number };

/** Draw outside the horizontal scroller so edge cells don't clip the tooltip. */
export function HeatmapTooltip({ tooltip }: { tooltip: HeatmapTooltipData }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  return <View
    pointerEvents="none"
    onLayout={({ nativeEvent: { layout } }) => setSize((previous) => previous.width === layout.width && previous.height === layout.height ? previous : { width: layout.width, height: layout.height })}
    style={[styles.tooltip, {
      maxWidth: Math.max(1, tooltip.containerWidth - 8),
      left: size.width === 0 ? 4 : Math.max(4, Math.min(tooltip.containerWidth - size.width - 4, tooltip.x - size.width / 2)),
      top: tooltip.y - size.height - 8,
      opacity: size.width > 0 ? 1 : 0,
    }]}
  ><Text accessibilityLiveRegion="polite" style={styles.text}>{tooltip.text}</Text></View>;
}

const styles = StyleSheet.create({
  tooltip: { position: "absolute", zIndex: 100, elevation: 20, borderWidth: 1, borderColor: "#3f3f46", backgroundColor: "#1d1d1d", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  text: { color: "#e4e4e7", fontSize: 10, fontWeight: "500", textAlign: "center" },
});
