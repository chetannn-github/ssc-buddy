import { useEffect, useId, useRef } from "react";
import {
  animate,
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";

const center = 42;
const radius = 35;
const circumference = Math.PI * 2 * radius;
const randomBubble = (start = 0) => ({
  start,
  position: 0.04 + Math.random() * 0.92,
  size: 0.6 + Math.random() * 0.8,
  drift: (Math.random() - 0.5) * 0.1,
  offset: Math.random() * Math.PI * 2,
  duration: 1000 + Math.random() * 1300,
  delay: Math.random() * 700,
});

function RingBubbles({ progress }: { progress: MotionValue<number> }) {
  const nodes = useRef<Array<SVGCircleElement | null>>([]);
  const shine = useRef<SVGCircleElement>(null);
  const bubbles = useRef(Array.from({ length: 7 }, () => randomBubble()));
  useAnimationFrame((time) => {
    shine.current?.setAttribute(
      "stroke-dashoffset",
      String(-circumference * ((time % 2600) / 2600)),
    );
    const completion = progress.get() / 100;
    bubbles.current.forEach((bubble, index) => {
      const node = nodes.current[index];
      if (!node) return;
      const elapsed = time - bubble.start - bubble.delay;
      if (elapsed >= bubble.duration) {
        bubbles.current[index] = randomBubble(time);
        node.setAttribute("opacity", "0");
        return;
      }
      const phase = Math.max(0, elapsed / bubble.duration);
      const angle =
        -Math.PI / 2 +
        (bubble.position + Math.sin(phase * Math.PI) * bubble.drift) * Math.PI * 2 * completion;
      const distance = radius + Math.sin(phase * Math.PI * 2 + bubble.offset) * 1.5;
      node.setAttribute("cx", String(center + Math.cos(angle) * distance));
      node.setAttribute("cy", String(center + Math.sin(angle) * distance));
      node.setAttribute("r", String(bubble.size * (0.5 + phase * 0.5)));
      node.setAttribute("opacity", String(Math.sin(phase * Math.PI) * 0.85));
    });
  });
  return (
    <>
      <circle
        ref={shine}
        className="widget-ring-shine"
        cx={center}
        cy={center}
        r={radius}
        strokeDasharray={`${13} ${circumference - 13}`}
        transform="rotate(-90 42 42)"
      />
      {Array.from({ length: 7 }, (_, index) => (
        <circle
          key={index}
          ref={(node) => {
            nodes.current[index] = node;
          }}
          className="widget-ring-bubble"
          opacity={0}
        />
      ))}
    </>
  );
}

export function TaskRingFill({ percent }: { percent: number }) {
  const target = Math.max(0, Math.min(100, percent));
  const progress = useMotionValue(0);
  const offset = useTransform(progress, (value) => circumference * (1 - value / 100));
  const arcOpacity = useTransform(progress, (value) => value > 0 ? 1 : 0);
  const reducedMotion = useReducedMotion();
  const maskId = `widget-task-ring-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  useEffect(() => {
    if (reducedMotion) {
      progress.set(target);
      return;
    }
    const animation = animate(progress, target, { duration: 1, ease: [0.16, 1, 0.3, 1] });
    return () => animation.stop();
  }, [progress, target, reducedMotion]);
  return (
    <svg className="widget-ring-svg" viewBox="0 0 84 84" aria-hidden="true">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={84} height={84}>
          <motion.circle
            className="widget-ring-mask"
            cx={center}
            cy={center}
            r={radius}
            strokeDasharray={circumference}
            style={{ strokeDashoffset: offset, opacity: arcOpacity }}
            transform="rotate(-90 42 42)"
          />
        </mask>
      </defs>
      <circle className="ring-track" cx={center} cy={center} r={radius} />
      <g mask={`url(#${maskId})`}>
          <circle className="widget-ring-base" cx={center} cy={center} r={radius} />
          {target > 0 && !reducedMotion && <RingBubbles progress={progress} />}
      </g>
    </svg>
  );
}
