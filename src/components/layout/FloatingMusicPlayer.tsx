import { useLayoutEffect, useRef, type ReactNode, type PointerEvent } from "react";
import {
  clampPlayer,
  cornerPosition,
  nearestPlayerCorner,
  playerBounds,
  type PlayerCorner,
  type PlayerPoint,
} from "../../../mobile-tasks/src/domain/floating-player";

export function FloatingMusicPlayer({
  corner,
  onCornerChange,
  children,
}: {
  corner: PlayerCorner;
  onCornerChange: (corner: PlayerCorner) => void;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    origin: PlayerPoint;
    moved: boolean;
  } | null>(null);
  const current = useRef<PlayerPoint>({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const getBounds = () => {
    const node = element.current!;
    // Reserve space only for an actual visible bottom navigation bar.
    const bottomNav = [
      ...document.querySelectorAll("nav,[role='navigation'],[data-bottom-navigation]"),
    ]
      .map((nav) => ({ nav, rect: nav.getBoundingClientRect() }))
      .find(({ nav, rect }) => {
        if (
          rect.width < window.innerWidth / 2 ||
          rect.height === 0 ||
          rect.top < window.innerHeight / 2 ||
          rect.bottom > window.innerHeight + 1
        )
          return false;
        for (let parent: Element | null = nav; parent; parent = parent.parentElement) {
          if (["fixed", "sticky"].includes(getComputedStyle(parent).position)) return true;
        }
        return false;
      });
    const safeBottom =
      Number.parseFloat(getComputedStyle(node).getPropertyValue("--player-safe-bottom")) || 0;
    return playerBounds(
      window.innerWidth,
      window.innerHeight,
      node.offsetWidth,
      node.offsetHeight,
      bottomNav ? window.innerHeight - bottomNav.rect.top - 6 : safeBottom,
    );
  };
  const paint = (point: PlayerPoint, animate: boolean) => {
    const node = element.current;
    if (!node) return;
    node.style.transition = animate ? "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    node.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    node.style.visibility = "visible";
  };

  useLayoutEffect(() => {
    const layout = () => {
      if (!element.current || drag.current?.moved) return;
      const point = cornerPosition(corner, getBounds());
      current.current = point;
      paint(point, true);
    };
    layout();
    const observer = new ResizeObserver(layout);
    if (element.current) observer.observe(element.current);
    window.addEventListener("resize", layout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", layout);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [corner]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.startX,
      dy = event.clientY - active.startY;
    if (!active.moved && Math.hypot(dx, dy) <= 6) return;
    if (!active.moved) {
      active.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    current.current = clampPlayer(
      { x: active.origin.x + dx, y: active.origin.y + dy },
      getBounds(),
    );
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        paint(current.current, false);
      });
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    drag.current = null;
    if (!active.moved) return;
    suppressClick.current = true;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const bounds = getBounds();
    const next = nearestPlayerCorner(current.current, bounds);
    current.current = cornerPosition(next, bounds);
    paint(current.current, true);
    onCornerChange(next);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={element}
      className="fixed top-0 left-0 z-[75] flex max-w-[calc(100vw-2rem)] touch-none select-none items-center gap-2 rounded-xl border border-white/10 bg-[#121212] p-2 pl-3 text-zinc-100 shadow-2xl will-change-transform [--player-safe-bottom:env(safe-area-inset-bottom)]"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        const rect = event.currentTarget.getBoundingClientRect();
        const origin = { x: rect.left, y: rect.top };
        current.current = origin;
        paint(origin, false);
        drag.current = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          origin,
          moved: false,
        };
      }}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}
