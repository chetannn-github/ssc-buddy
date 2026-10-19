import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../mobile-tasks/src/domain/heatmap-layout.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { layoutHeatmapMonths } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const dates = (year, month, first, count) => Array.from({ length: count }, (_, index) => ({ date: new Date(year, month - 1, first + index, 12), value: index + 1 }));

test("the next month starts in the next column on its weekday, rather than resetting to row zero", () => {
  const months = layoutHeatmapMonths(dates(2026, 3, 1, 61));
  assert.equal(months[0].days.at(-1).row, 2); // Tuesday March 31
  assert.equal(months[1].days[0].row, 3); // Wednesday April 1
  assert.equal(months[1].days[0].column, 0);
  assert.equal(months[1].days[3].row, 6);
  assert.equal(months[1].days[4].row, 0);
  assert.equal(months[1].days[4].column, 1);
});

test("six-column months keep every date within seven weekday rows", () => {
  const [august] = layoutHeatmapMonths(dates(2026, 8, 1, 31));
  assert.equal(august.columns, 6);
  assert.equal(august.days[0].row, 6);
  assert.equal(august.days.at(-1).row, 1);
  assert.equal(august.days.at(-1).column, 5);
  assert.equal(new Set(august.days.map(day => `${day.column}:${day.row}`)).size, 31);
  assert.ok(august.days.every(day => day.row >= 0 && day.row < 7 && day.column < august.columns));
});

test("a Sunday month boundary correctly starts at the top and February can use four columns", () => {
  const months = layoutHeatmapMonths(dates(2026, 1, 31, 29));
  assert.equal(months[0].days[0].row, 6);
  assert.equal(months[1].days[0].row, 0);
  assert.equal(months[1].columns, 4);
  assert.equal(months[1].days.length, 28);
});

test("partial-month ranges preserve weekdays without reserving hidden earlier weeks", () => {
  const input = dates(2026, 10, 20, 12);
  const [month] = layoutHeatmapMonths(input);
  assert.equal(month.days[0].row, 2);
  assert.equal(month.days[0].column, 0);
  assert.equal(month.columns, 2);
  assert.deepEqual(month.days.map(day => day.value), input.map(day => day.value));
  assert.ok(input.every(day => !("column" in day)));
});

test("leap days, year transitions and empty input retain all dates", () => {
  const leap = layoutHeatmapMonths(dates(2024, 2, 1, 30));
  assert.equal(leap[0].days.length, 29);
  assert.equal(leap[1].days[0].row, 5);
  const years = layoutHeatmapMonths(dates(2026, 12, 31, 2));
  assert.notEqual(years[0].key, years[1].key);
  assert.equal(years[0].days[0].row, 4);
  assert.equal(years[1].days[0].row, 5);
  assert.deepEqual(layoutHeatmapMonths([]), []);
});
