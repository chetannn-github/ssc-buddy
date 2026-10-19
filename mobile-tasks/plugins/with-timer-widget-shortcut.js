const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");
module.exports = function withTimerWidgetShortcut(config) {
  config = withAndroidManifest(config, next => {
    const app = next.modResults.manifest.application?.[0];
    const activity = app?.activity?.find(item => item["intent-filter"]?.some(filter => filter.category?.some(category => category.$?.["android:name"] === "android.intent.category.LAUNCHER")));
    if (activity) {
      const metadata = activity["meta-data"] ?? (activity["meta-data"] = []);
      const entry = { $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/timer_shortcuts" } };
      const existing = metadata.findIndex(item => item.$?.["android:name"] === "android.app.shortcuts");
      if (existing >= 0) metadata[existing] = entry; else metadata.push(entry);
    }
    return next;
  });
  return withDangerousMod(config, ["android", async next => {
    const root = path.join(next.modRequest.platformProjectRoot, "app/src/main/res");
    for (const directory of ["xml", "values", "drawable"]) fs.mkdirSync(path.join(root, directory), { recursive: true });
    const pkg = next.android.package;
    fs.writeFileSync(path.join(root, "xml/timer_shortcuts.xml"), `<shortcuts xmlns:android="http://schemas.android.com/apk/res/android"><shortcut android:shortcutId="add_timer_widget" android:enabled="true" android:icon="@drawable/ic_timer_shortcut" android:shortcutShortLabel="@string/timer_shortcut_label" android:shortcutLongLabel="@string/timer_shortcut_label"><intent android:action="android.intent.action.VIEW" android:targetPackage="${pkg}" android:targetClass="${pkg}.MainActivity" android:data="sscbuddy://timers/widget" /></shortcut></shortcuts>`);
    fs.writeFileSync(path.join(root, "values/timer_shortcuts.xml"), '<resources><string name="timer_shortcut_label">Add timer widget</string></resources>');
    fs.writeFileSync(path.join(root, "drawable/ic_timer_shortcut.xml"), '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#60A5FA" android:pathData="M9,1h6v2H9zM12,4a9,9 0,1 0,0 18a9,9 0,0 0,0 -18M11,7h2v6h-2zM11,15h2v2h-2z" /></vector>');
    return next;
  }]);
};
