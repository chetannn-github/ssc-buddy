import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../mobile-tasks/src/domain/question-navigation.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const {
  questionAfterSwipe: afterSwipe,
  shouldCaptureQuestionSwipe: capture,
  questionPaletteOffset: offset,
  questionPaletteEndPadding: endPadding,
  QUESTION_PALETTE_ITEM_WIDTH: width,
  QUESTION_PALETTE_GAP: gap,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("left swipe advances and right swipe returns exactly one question", () => {
  assert.equal(afterSwipe(2, 10, -70, 5), 3);
  assert.equal(afterSwipe(2, 10, 70, 5), 1);
  assert.equal(afterSwipe(2, 10, -600, 0), 3);
});

test("taps, short drags and vertical/diagonal scrolling do not change questions", () => {
  for (const [dx, dy] of [
    [0, 0],
    [12, 3],
    [35, 2],
    [10, 100],
    [-60, 90],
    [60, 45],
  ]) {
    assert.equal(afterSwipe(2, 10, dx, dy), 2);
  }
  assert.equal(capture(8, 1), false);
  assert.equal(capture(30, 5), true);
  assert.equal(capture(30, 50), false);
});

test("swipes stay within the test; reaching the last question does not submit or wrap", () => {
  assert.equal(afterSwipe(0, 10, 90, 0), 0);
  assert.equal(afterSwipe(9, 10, -90, 0), 9);
  assert.equal(afterSwipe(0, 1, -90, 0), 0);
  assert.equal(afterSwipe(0, 0, -90, 0), 0);
});

test("every selected palette item, including the last, can align at the left edge", () => {
  for (const count of [1, 3, 50, 500]) {
    for (const viewport of [200, 320, 700]) {
      const contentWidth = count * width + (count - 1) * gap + endPadding(viewport);
      assert.equal(contentWidth - viewport, offset(count - 1));
      assert.equal(offset(0), 0);
      if (count > 1) assert.equal(offset(1), 42);
    }
  }
});
