import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = (await readFile(new URL("../mobile-tasks/src/hooks/use-android-back.ts", import.meta.url), "utf8")).replace(/^import .*;$/gm, "");
const compiled = ts.transpileModule(`
let current, cursor, pending;
const hooks = new Map();
const handlers = new Set();
const useRef = (value) => current[cursor++] ??= { current: value };
const useEffect = (effect, deps) => {
  const index = cursor++;
  const previous = current[index];
  if (!deps || !previous || deps.some((value, i) => value !== previous.deps?.[i])) {
    const owner = current;
    pending.push(() => { previous?.cleanup?.(); owner[index] = { deps, cleanup: effect() }; });
  }
};
const BackHandler = { addEventListener: (event, handler) => {
  if (event !== "hardwareBackPress") throw new Error("Unexpected event");
  handlers.add(handler); return { remove: () => handlers.delete(handler) };
} };
${source}
export function render(id, handler, enabled = true) {
  if (!hooks.has(id)) hooks.set(id, []);
  current = hooks.get(id); cursor = 0; pending = [];
  useAndroidBack(handler, enabled); pending.forEach((effect) => effect());
}
export function back() { return [...handlers].reverse().some((handler) => handler()); }
export function clear() { for (const slots of hooks.values()) slots.forEach((slot) => slot?.cleanup?.()); hooks.clear(); }
export function listenerCount() { return handlers.size; }
`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
test("Back uses the current callback and removes listeners on unmount", () => {
  let result = "";
  api.render("screen", () => { result = "old"; });
  api.render("screen", () => { result = "current"; });
  assert.equal(api.listenerCount(), 1);
  assert.equal(api.back(), true);
  assert.equal(result, "current");
  api.clear();
  assert.equal(api.listenerCount(), 0);
});
test("only the visible leaf handles Back, so nested review does not skip History", () => {
  let result = "";
  api.render("history", () => { result = "setup"; }, false);
  api.render("detail", () => { result = "history"; }, false);
  api.render("solution", () => { result = "detail"; });
  assert.equal(api.back(), true);
  assert.equal(result, "detail");
  api.render("solution", () => {}, false);
  api.render("detail", () => { result = "history"; });
  assert.equal(api.back(), true);
  assert.equal(result, "history");
  api.clear();
});
test("the Practice setup root allows normal Android Back behavior", () => {
  api.render("practice", () => {}, false);
  assert.equal(api.back(), false);
  api.render("practice", () => false);
  assert.equal(api.back(), false);
  api.clear();
});
