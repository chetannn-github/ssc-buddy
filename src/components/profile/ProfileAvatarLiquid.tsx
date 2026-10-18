import { useRandomHeatmapFill } from "./use-random-heatmap-fill";
import type { CSSProperties } from "react";
import { heatmapCellColors } from "../../../mobile-tasks/src/domain/heatmap-colors";
import type { HeatmapColorCycle } from "../../../mobile-tasks/src/domain/heatmap-colors";
import "./liquid-heatmap.css";

export function ProfileAvatarLiquid({ theme }: { theme: HeatmapColorCycle }) {
  const { cycle, enabled } = useRandomHeatmapFill(theme);
  const colors = heatmapCellColors("profile-avatar", 2, cycle);
  return (
    <span
      aria-hidden="true"
      className={`heatmap-liquid${enabled ? "" : " heatmap-liquid-paused"}`}
      style={
        {
          backgroundColor: colors.previous,
          "--heatmap-liquid-color": colors.color,
        } as CSSProperties
      }
    >
      <span
        key={cycle.seed}
        className="heatmap-liquid-fill heatmap-color-refill"
        style={{ height: "100%", backgroundColor: colors.color, animationDuration: "1600ms" }}
      />
    </span>
  );
}
