/** Calendar rows are Sunday–Saturday; month changes never reset the weekday row. */
export function layoutHeatmapMonths<T extends { date: Date }>(days: T[]) {
  const months: Array<{ key: string; label: string; columns: number; days: Array<T & { row: number; column: number }> }> = [];
  for (const day of days) {
    const key = `${day.date.getFullYear()}-${day.date.getMonth()}`;
    let month = months.at(-1);
    if (!month || month.key !== key) {
      month = { key, label: day.date.toLocaleDateString(undefined, { month: "short" }), columns: 0, days: [] };
      months.push(month);
    }
    const first = month.days[0]?.date ?? day.date;
    // Use calendar days rather than elapsed milliseconds across DST changes.
    const offset = day.date.getDate() - first.getDate() + first.getDay();
    const column = Math.floor(offset / 7);
    month.days.push({ ...day, row: day.date.getDay(), column });
    month.columns = Math.max(month.columns, column + 1);
  }
  return months;
}
