import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../mobile-tasks/src/", import.meta.url);
const compile = async (name) => ts.transpileModule(await readFile(new URL(name, root), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const permissionCode = await compile("lib/habit-notification-permissions.ts");
const hookCode = await compile("hooks/use-habit-reminders.ts");
function evaluate(code, imports = {}) {
  const exports = {};
  vm.runInNewContext(code, { exports, console, require: (name) => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  } });
  return exports;
}
const permissionApi = evaluate(permissionCode);
function notificationMock(granted = false, canAskAgain = true, allowRequest = true) {
  const calls = [];
  return {
    calls,
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: "date" },
    async setNotificationChannelAsync(id, settings) { calls.push(["channel", id, settings.importance]); },
    async getPermissionsAsync() { calls.push(["permission"]); return { granted, canAskAgain }; },
    async requestPermissionsAsync() { calls.push(["request"]); granted = allowRequest; return { granted, canAskAgain }; },
    async getAllScheduledNotificationsAsync() { calls.push(["scheduled"]); return []; },
    async cancelScheduledNotificationAsync() { calls.push(["cancel"]); },
    async scheduleNotificationAsync() { calls.push(["schedule"]); },
  };
}
test("Android creates the channel before asking notification permission", async () => {
  const api = notificationMock();
  assert.equal(await permissionApi.ensureHabitNotificationPermission(api, true, true), true);
  assert.deepEqual(api.calls, [["channel", "habits", 4], ["permission"], ["request"]]);
});
test("granted permission is reused; iOS does not invoke Android channel APIs", async () => {
  const api = notificationMock(true);
  assert.equal(await permissionApi.ensureHabitNotificationPermission(api, false, true), true);
  assert.deepEqual(api.calls, [["permission"]]);
});
test("background sync and permanently denied permission never prompt", async () => {
  for (const [ask, canAsk] of [[false, true], [true, false]]) {
    const api = notificationMock(false, canAsk);
    assert.equal(await permissionApi.ensureHabitNotificationPermission(api, true, ask), false);
    assert.ok(!api.calls.some(([name]) => name === "request"));
  }
});

async function runHook({ reminders = true, appState = "active", granted = false, native = true, allowRequest = true } = {}) {
  const effects = [], listeners = [], cleanups = [];
  const api = notificationMock(granted, true, allowRequest);
  const state = {
    currentState: appState,
    addEventListener: (_, listener) => { listeners.push(listener); return { remove() {} }; },
  };
  const hooks = evaluate(hookCode, {
    react: { useRef: (current) => ({ current }), useEffect: (effect) => effects.push(effect) },
    "react-native": { Platform: { OS: "android" }, AppState: state },
    "../widgets/habit-widget-store": { cacheWidgetHabits: async () => {} },
    "../lib/native-notifications": { getNativeNotifications: () => native ? api : null, IS_EXPO_GO: false },
    "../lib/habit-notification-permissions": permissionApi,
    "./use-habits": { useHabits: () => ({ loading: false, error: "", habits: reminders ? [
      { id: "habit", name: "Read", settings: { reminder: "09:00", tracking: "tick" } },
    ] : [] }) },
    "../domain/habits": {
      normalizeHabitSettings: (settings) => settings,
      habitDay: () => "2026-10-21", habitDue: () => true,
      habitEntry: () => ({ checks: [] }),
    },
  });
  hooks.useHabitReminders("owner", true);
  for (const effect of effects) cleanups.push(effect());
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
  await flush();
  return { api, async resume() { state.currentState = "active"; for (const listener of listeners) listener("active"); await flush(); },
    dispose() { for (const cleanup of cleanups) cleanup?.(); } };
}
test("APK with saved reminders asks permission and schedules without resaving the habit", async () => {
  const hook = await runHook();
  try {
    assert.equal(hook.api.calls.filter(([name]) => name === "request").length, 1);
    assert.ok(hook.api.calls.some(([name]) => name === "schedule"));
    await hook.resume();
    assert.equal(hook.api.calls.filter(([name]) => name === "request").length, 1);
  } finally { hook.dispose(); }
});
test("accounts without reminders are not asked for notification permission", async () => {
  const hook = await runHook({ reminders: false });
  try { assert.ok(!hook.api.calls.some(([name]) => name === "request")); }
  finally { hook.dispose(); }
});
test("declining the automatic permission prompt is respected across foreground syncs", async () => {
  const hook = await runHook({ allowRequest: false });
  try {
    await hook.resume();
    assert.equal(hook.api.calls.filter(([name]) => name === "request").length, 1);
    assert.ok(!hook.api.calls.some(([name]) => name === "schedule"));
  } finally { hook.dispose(); }
});
test("a reminder loaded in the background asks permission on the next foreground entry", async () => {
  const hook = await runHook({ appState: "background" });
  try {
    assert.ok(!hook.api.calls.some(([name]) => name === "request"));
    await hook.resume();
    assert.equal(hook.api.calls.filter(([name]) => name === "request").length, 1);
    assert.ok(hook.api.calls.some(([name]) => name === "schedule"));
  } finally { hook.dispose(); }
});
test("background hooks do not prompt, and old APKs without native APIs remain safe", async () => {
  for (const options of [{ appState: "background" }, { native: false }]) {
    const hook = await runHook(options);
    try { assert.ok(!hook.api.calls.some(([name]) => name === "request")); }
    finally { hook.dispose(); }
  }
});
