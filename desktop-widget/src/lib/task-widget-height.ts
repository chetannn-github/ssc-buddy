export const MIN_TASK_WIDGET_HEIGHT = 280;
export const MAX_TASK_WIDGET_HEIGHT = 600;

export function taskWidgetHeight(chromeHeight: number, listHeight: number) {
  return Math.ceil(Math.max(MIN_TASK_WIDGET_HEIGHT, Math.min(MAX_TASK_WIDGET_HEIGHT, chromeHeight + Math.max(48, listHeight))));
}
