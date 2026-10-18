export type PlayerCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PlayerPoint = { x: number; y: number };
export type PlayerBounds = { left: number; right: number; top: number; bottom: number };

export function playerBounds(
  width: number,
  height: number,
  playerWidth: number,
  playerHeight: number,
  bottomSpace: number,
): PlayerBounds {
  return {
    left: 11,
    right: Math.max(11, width - playerWidth - 11),
    top: 12,
    bottom: Math.max(12, height - playerHeight - bottomSpace - 12),
  };
}

export function clampPlayer(point: PlayerPoint, bounds: PlayerBounds): PlayerPoint {
  return {
    x: Math.max(bounds.left, Math.min(bounds.right, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom, point.y)),
  };
}

export function cornerPosition(corner: PlayerCorner, bounds: PlayerBounds): PlayerPoint {
  return {
    x: corner.endsWith("left") ? bounds.left : bounds.right,
    y: corner.startsWith("top") ? bounds.top : bounds.bottom,
  };
}

export function nearestPlayerCorner(point: PlayerPoint, bounds: PlayerBounds): PlayerCorner {
  const horizontal = point.x < (bounds.left + bounds.right) / 2 ? "left" : "right";
  const vertical = point.y < (bounds.top + bounds.bottom) / 2 ? "top" : "bottom";
  return `${vertical}-${horizontal}`;
}
