type Listener = (visible: boolean) => void;

const listeners = new Set<Listener>();
let lastOffset = 0;
let visible = true;

export function subscribeBottomNavigation(next: Listener) {
  listeners.add(next);
  next(visible);
  return () => { listeners.delete(next); };
}

export function resetBottomNavigation() {
  lastOffset = 0;
  setVisible(true);
}

export function reportVerticalScroll(offset: number) {
  const delta = offset - lastOffset;
  lastOffset = Math.max(0, offset);
  if (offset <= 8) return setVisible(true);
  if (delta > 7) setVisible(false);
  if (delta < -7) setVisible(true);
}

export function reportVerticalTouch(deltaY: number) {
  if (deltaY < -6) setVisible(false);
  if (deltaY > 6) setVisible(true);
}

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  listeners.forEach((listener) => listener(next));
}
