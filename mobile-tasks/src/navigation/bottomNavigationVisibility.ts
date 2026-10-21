type Listener = (visible: boolean) => void;

const listeners = new Set<Listener>();
export const BOTTOM_NAVIGATION_HEIGHT = 84;
const MIN_SCROLL_RANGE = 120;
let lastOffset = 0;
let visible = true;
let canHide = false;

export function subscribeBottomNavigation(next: Listener) {
  listeners.add(next);
  next(visible);
  return () => { listeners.delete(next); };
}

export function resetBottomNavigation() {
  lastOffset = 0;
  canHide = false;
  setVisible(true);
}

export function reportVerticalScroll(offset: number, metrics?: {
  contentSize: { height: number };
  layoutMeasurement: { height: number };
}) {
  const delta = offset - lastOffset;
  lastOffset = Math.max(0, offset);
  if (metrics) {
    // Hiding the bar grows the viewport. Restore that height when comparing
    // ranges so a near-threshold list doesn't repeatedly hide/show the bar.
    const range = metrics.contentSize.height - metrics.layoutMeasurement.height +
      (visible ? 0 : BOTTOM_NAVIGATION_HEIGHT);
    canHide = Number.isFinite(range) && range > MIN_SCROLL_RANGE;
  }
  if (!canHide) return setVisible(true);
  if (offset <= 8) return setVisible(true);
  if (delta > 7) setVisible(false);
  if (delta < -7) setVisible(true);
}

export function reportVerticalTouch(deltaY: number) {
  if (deltaY < -6 && canHide) setVisible(false);
  if (deltaY > 6) setVisible(true);
}

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  listeners.forEach((listener) => listener(next));
}
