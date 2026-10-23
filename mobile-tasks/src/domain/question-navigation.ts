export function shouldCaptureQuestionSwipe(dx: number, dy: number) {
  return Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

export function questionAfterSwipe(current: number, count: number, dx: number, dy: number) {
  if (count <= 0) return 0;
  const index = Math.max(0, Math.min(count - 1, current));
  if (Math.abs(dx) < 48 || !shouldCaptureQuestionSwipe(dx, dy)) return index;
  return Math.max(0, Math.min(count - 1, index + (dx < 0 ? 1 : -1)));
}

export const QUESTION_PALETTE_ITEM_WIDTH = 35;
export const QUESTION_PALETTE_GAP = 7;
export const questionPaletteOffset = (index: number, viewportWidth: number) =>
  Math.max(0, Math.max(0, index) * (QUESTION_PALETTE_ITEM_WIDTH + QUESTION_PALETTE_GAP)
    - questionPaletteEndPadding(viewportWidth));
export const questionPaletteEndPadding = (viewportWidth: number) =>
  Math.max(0, (viewportWidth - QUESTION_PALETTE_ITEM_WIDTH) / 2);
