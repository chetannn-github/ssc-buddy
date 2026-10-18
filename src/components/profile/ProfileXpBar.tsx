import { useEffect, useRef, useState, type CSSProperties } from "react";

import "./liquid-progress.css";

const randomBubble = () => ({
  left: 3 + Math.random() * 94,
  size: 2 + Math.random() * 2,
  drift: -9 + Math.random() * 18,
  duration: 0.9 + Math.random() * 1.4,
  delay: -Math.random() * 2,
});

export function LiquidProgressBar({
  progress,
  vertical = false,
  color = "#9b75f5",
  height = 6,
  label = "Study progress",
  className = "",
}: {
  progress: number;
  vertical?: boolean;
  color?: string;
  height?: number;
  label?: string;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [entered, setEntered] = useState(false);
  const [bubbles, setBubbles] = useState<ReturnType<typeof randomBubble>[]>([]);
  const target = Math.max(0, Math.min(1, progress));
  useEffect(() => {
    setBubbles(Array.from({ length: 6 }, randomBubble));
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  useEffect(() => {
    if (!track.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry?.isIntersecting ?? false),
    );
    observer.observe(track.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={track}
      className={`profile-xp-track ${vertical ? "profile-xp-vertical" : ""} ${!visible ? "profile-xp-paused" : ""} ${className}`}
      style={{ height: vertical ? "100%" : height, width: vertical ? height : undefined, marginTop: 0 }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(target * 100)}
    >
      <div
        className="profile-xp-fill"
        style={{ [vertical ? "height" : "width"]: `${entered ? target * 100 : 0}%`, backgroundColor: color }}
      >
        <span aria-hidden="true" className="profile-xp-shimmer" />
        {target > 0 &&
          bubbles.map((bubble, index) => (
            <span
              aria-hidden="true"
              key={index}
              className="profile-xp-bubble"
              onAnimationIteration={() =>
                setBubbles((current) =>
                  current.map((item, position) =>
                    position === index
                      ? {
                          ...item,
                          left: 3 + Math.random() * 94,
                          size: 2 + Math.random() * 2,
                          drift: -9 + Math.random() * 18,
                        }
                      : item,
                  ),
                )
              }
              style={
                {
                  left: vertical ? "2px" : `${bubble.left}%`,
                  top: vertical ? `${bubble.left}%` : undefined,
                  width: bubble.size,
                  height: bubble.size,
                  animationDuration: `${bubble.duration}s`,
                  animationDelay: `${bubble.delay}s`,
                  "--xp-drift": `${bubble.drift}px`,
                } as CSSProperties
              }
            />
          ))}
      </div>
    </div>
  );
}

export function ProfileXpBar({ progress }: { progress: number }) {
  return (
    <div className="mt-1">
      <LiquidProgressBar progress={progress} height={9} label="XP progress to next level" />
    </div>
  );
}
