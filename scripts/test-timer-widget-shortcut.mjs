import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../mobile-tasks/plugins/with-timer-widget-shortcut.js", import.meta.url), "utf8");
function pluginHarness() {
  const writes = new Map();
  let manifest, resources;
  const sandbox = { module: { exports: {} }, require(name) {
    if (name === "expo/config-plugins") return {
      withAndroidManifest(config, callback) { manifest = callback; return config; },
      withDangerousMod(config, [, callback]) { resources = callback; return config; },
    };
    if (name === "fs") return { mkdirSync() {}, writeFileSync(file, contents) { writes.set(file, contents); } };
    if (name === "path") return path;
    throw new Error(`Unexpected dependency: ${name}`);
  }};
  vm.runInNewContext(source, sandbox);
  sandbox.module.exports({});
  const config = { android: { package: "com.sscbuddy.tasks" }, modRequest: { platformProjectRoot: path.resolve("widget-plugin-fixture") }, modResults: { manifest: { application: [{ activity: [{ $: { "android:name": ".MainActivity" }, "intent-filter": [{ category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }] }] }] }] } } };
  return { config, writes, manifest, resources };
}
test("shortcut targets a separate setup activity and repeated prebuilds do not duplicate it", async () => {
  const harness = pluginHarness();
  harness.manifest(harness.config); harness.manifest(harness.config);
  const activities = harness.config.modResults.manifest.application[0].activity;
  const setup = activities.filter(item => item.$["android:name"] === "com.sscbuddy.tasks.TimerWidgetSetupActivity");
  assert.equal(setup.length, 1);
  assert.equal(setup[0].$["android:theme"], "@style/TimerWidgetSetupTheme");
  assert.equal(setup[0].$["android:excludeFromRecents"], "true");
  await harness.resources(harness.config);
  const shortcut = [...harness.writes].find(([file]) => file.endsWith(`${path.sep}xml${path.sep}timer_shortcuts.xml`))[1];
  assert.match(shortcut, /targetClass="com\.sscbuddy\.tasks\.TimerWidgetSetupActivity"/);
  assert.doesNotMatch(shortcut, /\.MainActivity/);
});
test("generated setup activity loads its own React screen with a dark transparent theme", async () => {
  const harness = pluginHarness(); await harness.resources(harness.config);
  const java = [...harness.writes].find(([file]) => file.endsWith("TimerWidgetSetupActivity.java"))[1];
  assert.match(java, /return "TimerWidgetSetup"/);
  assert.match(java, /DefaultReactActivityDelegate/);
  const theme = [...harness.writes].find(([file]) => file.endsWith("timer_widget_setup_styles.xml"))[1];
  assert.match(theme, /windowIsTranslucent">true/);
  assert.match(theme, /windowLightStatusBar">false/);
});
