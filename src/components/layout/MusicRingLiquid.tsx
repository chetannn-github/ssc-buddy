import "./music-ring-liquid.css";

export function MusicRingLiquid({ progress, playing }: { progress: number; playing: boolean }) {
  const value = Math.max(0, Math.min(100, progress));
  return (
    <span
      aria-hidden="true"
      className={`music-ring-liquid${playing ? "" : " music-ring-liquid-paused"}`}
      style={{
        maskImage: `conic-gradient(#000 ${value}%, transparent 0)`,
        WebkitMaskImage: `conic-gradient(#000 ${value}%, transparent 0)`,
      }}
    />
  );
}
