import { habitDay } from "./habits";

export type HabitWidgetStyle = "heatmap" | "month" | "compact";
export type HabitWidgetSize = { width: number; height: number };
export function habitWidgetCalendar(today: string, wide: boolean) {
  const date = new Date(today + "T12:00:00");
  if (wide) {
    date.setDate(date.getDate() - date.getDay() - 19 * 7);
    return Array.from({ length: 140 }, (_, index) => {
      const key = habitDay(date);
      date.setDate(date.getDate() + 1);
      return { key, column: Math.floor(index / 7), row: index % 7, future: key > today };
    });
  }
  date.setDate(1);
  const firstWeekday = date.getDay(), month = date.getMonth();
  const cells = [];
  while (date.getMonth() === month) {
    const index = firstWeekday + date.getDate() - 1, key = habitDay(date);
    cells.push({ key, column: index % 7, row: Math.floor(index / 7), future: key > today });
    date.setDate(date.getDate() + 1);
  }
  return cells;
}

export function habitWidgetLayout(size: HabitWidgetSize, today: string, footerHeight: number, style?: HabitWidgetStyle) {
  const width = Math.max(140, size.width), height = Math.max(120, size.height);
  const wide = style === "month" ? false : width >= 300;
  const cells = habitWidgetCalendar(today, wide);
  const columns = wide ? 20 : 7, rows = Math.max(...cells.map((cell) => cell.row)) + 1;
  const labelWidth = wide ? 13 : 0, labelHeight = wide ? 0 : 15;
  const step = Math.max(5, Math.min((width - 24 - labelWidth) / columns,
    (height - 24 - 38 - 8 - footerHeight - (footerHeight ? 6 : 0) - labelHeight) / rows));
  // Use one pitch in both directions: never stretch columns to fill spare width.
  const columnStep = step;
  const gridWidth = labelWidth + columns * step;
  return { wide, cells, columns, rows, step, columnStep, labelWidth, labelHeight,
    gridWidth, gridHeight: labelHeight + rows * step };
}

export const HABIT_WIDGET_NAMES = ["HabitWidget", "HabitMonthWidget", "HabitCompactWidget"] as const;
export function habitWidgetStyleForName(name?: string): HabitWidgetStyle | undefined {
  return name === "HabitCompactWidget" ? "compact" : name === "HabitMonthWidget" ? "month" : undefined;
}
export function habitWidgetNameForStyle(style: HabitWidgetStyle) {
  return style === "compact" ? "HabitCompactWidget" : style === "month" ? "HabitMonthWidget" : "HabitWidget";
}
