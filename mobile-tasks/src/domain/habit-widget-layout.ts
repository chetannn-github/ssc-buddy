import { habitDay } from "./habits";

export type HabitWidgetStyle = "heatmap" | "compact";
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

export function habitWidgetLayout(size: HabitWidgetSize, today: string, footerHeight: number) {
  const width = Math.max(140, size.width), height = Math.max(120, size.height);
  const wide = width >= 300;
  const cells = habitWidgetCalendar(today, wide);
  const columns = wide ? 20 : 7, rows = Math.max(...cells.map((cell) => cell.row)) + 1;
  const labelWidth = wide ? 13 : 0, labelHeight = wide ? 0 : 15;
  const step = Math.max(5, Math.min((width - 24 - labelWidth) / columns,
    (height - 24 - 38 - 8 - footerHeight - labelHeight) / rows));
  return { wide, cells, columns, rows, step, labelWidth, labelHeight,
    gridWidth: labelWidth + columns * step, gridHeight: labelHeight + rows * step };
}
