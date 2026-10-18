import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../mobile-tasks/src/domain/xp-levels.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { xpForLevel, xpSegmentProgress, summarizeXp } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
test('each unequal gap advances by its own XP requirement, including higher levels', () => {
  for (let level = 0; level <= 30; level++) {
    const start = xpForLevel(level), end = xpForLevel(level + 1), gap = end - start;
    for (const fraction of [0, .1, .25, .5, .75, .99]) {
      const xp = start + gap * fraction;
      const summary = summarizeXp(xp);
      assert.equal(summary.level, level);
      assert.ok(Math.abs(summary.progress - fraction) < 1e-10);
      assert.ok(Math.abs(xpSegmentProgress(xp, level) - fraction) < 1e-10);
    }
    assert.equal(xpSegmentProgress(end, level), 1);
    assert.equal(summarizeXp(end).level, level + 1);
    assert.equal(summarizeXp(end).progress, 0);
  }
});
test('completed segments stay full and future segments stay empty', () => {
  for (const xp of [-2000, -500, -250, -1, 0, 250, 499, 500, 750, 1000, 1500, 2000, 6000, 128000]) {
    const summary = summarizeXp(xp);
    for (let level = 0; level < 15; level++) {
      if (level < summary.level) assert.equal(xpSegmentProgress(xp, level), 1);
      if (level > summary.level) assert.equal(xpSegmentProgress(xp, level), 0);
    }
    assert.ok(summary.progress >= 0 && summary.progress <= 1);
    assert.equal(summary.nextLevelXp - xp, xpForLevel(summary.level + 1) - xp);
  }
});
test('XP reductions move progress back across boundaries', () => {
  assert.equal(summarizeXp(1500).progress, .5);
  assert.equal(summarizeXp(750).progress, .5);
  assert.equal(summarizeXp(-250).progress, .5);
  assert.equal(summarizeXp(-1000).progress, 0);
});
