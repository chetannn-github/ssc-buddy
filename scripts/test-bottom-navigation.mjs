import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../mobile-tasks/src/navigation/bottomNavigationVisibility.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const nav = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const metrics = (range, viewport = 600) => ({ contentSize: { height: viewport + range }, layoutMeasurement: { height: viewport } });
let visible = true;
nav.subscribeBottomNavigation((value) => { visible = value; });

test("short lists and overscroll gestures keep the navigation visible", () => {
  for (const range of [-20, 0, 30, 100, 120]) {
    nav.resetBottomNavigation();
    nav.reportVerticalScroll(25, metrics(range));
    nav.reportVerticalTouch(-30);
    assert.equal(visible, true);
  }
});
test("long lists still hide on downward scrolling and reveal on upward scrolling", () => {
  nav.resetBottomNavigation();
  nav.reportVerticalScroll(30, metrics(500));
  assert.equal(visible, false);
  nav.reportVerticalScroll(15, metrics(416, 684));
  assert.equal(visible, true);
});
test("the viewport growing as the bar hides doesn't cause a near-threshold flicker", () => {
  nav.resetBottomNavigation();
  nav.reportVerticalScroll(30, metrics(150));
  assert.equal(visible, false);
  nav.reportVerticalScroll(32, metrics(66, 684));
  assert.equal(visible, false);
  nav.reportVerticalScroll(34, metrics(0, 684));
  assert.equal(visible, true);
});
