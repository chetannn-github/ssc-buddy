import { useEffect, useState } from "react";
import type { HeatmapColorCycle } from "../../../mobile-tasks/src/domain/heatmap-colors";

export function useRandomHeatmapFill(cycle: HeatmapColorCycle) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!media.matches && !document.hidden);
    update();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return { cycle, enabled };
}
