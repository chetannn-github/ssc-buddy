import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const palette = await read("../mobile-tasks/src/domain/habit-colors.ts");
const domain = (await read("../mobile-tasks/src/domain/app-accent.ts")).replace(/^import .*;$/gm, "");
const theme = (await read("../mobile-tasks/src/theme.ts")).replace(/^import .*;$/gm, "");
const profile = (await read("../mobile-tasks/src/lib/profile-store.ts")).replace(/^import .*;$/gm, "");
const compiled = ts.transpileModule(`
const useSyncExternalStore = (_subscribe, snapshot) => snapshot();
const StyleSheet = { create: (styles) => { for (const style of Object.values(styles)) Object.freeze(style); return Object.freeze(styles); } };
const saved = new Map();
const AsyncStorage = { getItem: async (key) => saved.get(key), setItem: async (key, value) => { saved.set(key, value); }, removeItem: async (key) => saved.delete(key) };
${palette}
${domain}
${theme}
${profile}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
test("old and invalid profiles receive a safe supported accent", () => {
  assert.equal(api.normalizeProfile({ name: "Student", questionGoal: 70 }).accentColor, "#ffe000");
  assert.equal(api.normalizeAppAccent("hotpink"), "#ffe000");
  assert.equal(api.normalizeAppAccent(null), "#ffe000");
});
test("every accent survives normalization and local save/reload", async () => {
  for (const option of api.APP_ACCENTS) {
    await api.saveProfile({ name: "Student", questionGoal: 70, accentColor: option.color, habitsEnabled: false });
    const loaded = await api.loadProfile();
    assert.equal(loaded.accentColor, option.color);
    assert.equal(loaded.habitsEnabled, false);
    assert.equal(loaded.questionGoal, 70);
  }
});
test("existing styles and inline tokens update without recreating screens", () => {
  const styles = api.createThemedStyles({ button: { backgroundColor: "#60a5fa", color: "#082f49" },
    selected: { backgroundColor: "rgba(96, 165, 250, .14)" }, error: { color: "#fca5a5" } });
  for (const option of api.APP_ACCENTS) {
    api.setAppAccent(option.color);
    assert.equal(styles.button.backgroundColor, option.color);
    assert.equal(api.colors.accent, option.color);
    assert.equal(api.dailyTaskColors.accent, option.color);
    assert.equal(styles.button.color, api.accentInk(option.color));
    assert.equal(styles.selected.backgroundColor, option.color + "24");
    assert.equal(styles.error.color, "#fca5a5");
    assert.strictEqual(styles.button, styles.button);
  }
});
test("styles created after a color change also follow subsequent choices", () => {
  api.setAppAccent("#ff8fbd");
  const styles = api.createThemedStyles({ button: { backgroundColor: api.colors.accent } });
  api.setAppAccent("#70b4ff");
  assert.equal(styles.button.backgroundColor, "#70b4ff");
});
test("theme mapping preserves animated objects, status colors and black background", () => {
  class AnimatedValue {}
  const animation = new AnimatedValue();
  const source = { transform: [{ scale: animation }], backgroundColor: "#000000", borderColor: "#f87171" };
  const result = api.accentStyleValue(source, "#b18aff");
  assert.strictEqual(result.transform[0].scale, animation);
  assert.equal(result.backgroundColor, "#000000");
  assert.equal(result.borderColor, "#f87171");
});
test("profile yellow ends at the exact Habits yellow", async () => {
  const source = await read("../mobile-tasks/src/domain/heatmap-colors.ts");
  assert.match(source, /\["#fff27a", "#ffe94d", "#ffe51f", "#ffe000"\]/);
  assert.doesNotMatch(source, /#bccb20|#606f08/);
});

test("Syllabus layout overrides added with Object.assign remain intact", () => {
  api.setAppAccent("#ffe000");
  const styles = api.createThemedStyles({ page: { flex: 1 }, chapter: { minHeight: 66 } });
  assert.equal(styles.chapter.minHeight, 66);
  Object.assign(styles, { chapter: { minHeight: 54, flexDirection: "row", gap: 8 },
    targetCountFlow: { width: 30, justifyContent: "flex-end" } });
  assert.equal(styles.chapter.minHeight, 54);
  assert.equal(styles.chapter.flexDirection, "row");
  assert.equal(styles.targetCountFlow.width, 30);
  api.setAppAccent("#b18aff");
  assert.equal(styles.chapter.gap, 8);
  assert.equal(styles.targetCountFlow.justifyContent, "flex-end");
});

test("Subject, Analysis and Log test outlines follow the chosen accent", () => {
  for (const option of api.APP_ACCENTS) {
    assert.equal(api.accentStyleValue("#285d91", option.color), option.color + "66");
    assert.equal(api.accentStyleValue("#ffe00066", option.color), option.color + "66");
  }
});

test("pending rings and Copy prompt tints keep updating after multiple accent changes", () => {
  api.setAppAccent("#ff8fbd");
  const styles = api.createThemedStyles({ pending: { borderColor: api.colors.accent + "99" },
    copy: { borderColor: api.colors.accent + "66", backgroundColor: api.colors.accent + "14" } });
  for (const option of api.APP_ACCENTS) {
    api.setAppAccent(option.color);
    assert.equal(styles.pending.borderColor, option.color + "99");
    assert.equal(styles.copy.borderColor, option.color + "66");
    assert.equal(styles.copy.backgroundColor, option.color + "14");
  }
});

test("every Habits color is available as an accent with readable filled controls", () => {
  for (const color of Object.values(api.HABIT_COLORS)) {
    assert.ok(api.APP_ACCENTS.some((option) => option.color === color));
    assert.equal(api.normalizeAppAccent(color), color);
  }
  assert.equal(new Set(api.APP_ACCENTS.map((option) => option.color)).size, api.APP_ACCENTS.length);
  assert.equal(api.accentInk("#234dc0"), "#fafafa");
  assert.equal(api.accentInk("#ffe000"), "#171400");
});
