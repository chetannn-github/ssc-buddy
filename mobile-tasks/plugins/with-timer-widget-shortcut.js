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
    if (app) {
      const activities = app.activity ?? (app.activity = []);
      const name = `${next.android.package}.TimerWidgetSetupActivity`;
      const entry = { $: { "android:name": name, "android:exported": "true", "android:theme": "@style/TimerWidgetSetupTheme", "android:excludeFromRecents": "true", "android:taskAffinity": `${next.android.package}.widgetsetup`, "android:windowSoftInputMode": "adjustResize" } };
      const index = activities.findIndex(item => item.$?.["android:name"] === name);
      if (index >= 0) activities[index] = entry; else activities.push(entry);
    }
    return next;
  });
  return withDangerousMod(config, ["android", async next => {
    const root = path.join(next.modRequest.platformProjectRoot, "app/src/main/res");
    for (const directory of ["xml", "values", "drawable"]) fs.mkdirSync(path.join(root, directory), { recursive: true });
    const pkg = next.android.package;
    const javaRoot = path.join(next.modRequest.platformProjectRoot, "app/src/main/java", ...pkg.split("."));
    fs.mkdirSync(javaRoot, { recursive: true });
    fs.writeFileSync(path.join(javaRoot, "TimerWidgetSetupActivity.java"), `package ${pkg};
import android.os.Bundle;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

public class TimerWidgetSetupActivity extends ReactActivity {
  @Override protected void onCreate(Bundle savedInstanceState) { super.onCreate(null); }
  @Override protected String getMainComponentName() { return "TimerWidgetSetup"; }
  @Override protected ReactActivityDelegate createReactActivityDelegate() {
    return new DefaultReactActivityDelegate(this, getMainComponentName(), DefaultNewArchitectureEntryPoint.getFabricEnabled());
  }
}
`);
    fs.writeFileSync(path.join(root, "values/timer_widget_setup_styles.xml"), `<resources><style name="TimerWidgetSetupTheme" parent="Theme.AppCompat.DayNight.NoActionBar"><item name="android:windowIsTranslucent">true</item><item name="android:windowBackground">@android:color/transparent</item><item name="android:windowNoTitle">true</item><item name="android:backgroundDimEnabled">true</item><item name="android:backgroundDimAmount">0.6</item><item name="android:colorAccent">#60A5FA</item><item name="android:windowLightStatusBar">false</item><item name="android:windowLightNavigationBar">false</item></style></resources>`);
    fs.writeFileSync(path.join(root, "xml/timer_shortcuts.xml"), `<shortcuts xmlns:android="http://schemas.android.com/apk/res/android"><shortcut android:shortcutId="add_timer_widget" android:enabled="true" android:icon="@drawable/ic_timer_shortcut" android:shortcutShortLabel="@string/timer_shortcut_label" android:shortcutLongLabel="@string/timer_shortcut_label"><intent android:action="android.intent.action.VIEW" android:targetPackage="${pkg}" android:targetClass="${pkg}.TimerWidgetSetupActivity" android:data="sscbuddy://timers/widget" /></shortcut></shortcuts>`);
    fs.writeFileSync(path.join(root, "values/timer_shortcuts.xml"), '<resources><string name="timer_shortcut_label">Add timer widget</string></resources>');
    fs.writeFileSync(path.join(root, "drawable/ic_timer_shortcut.xml"), '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#60A5FA" android:pathData="M9,1h6v2H9zM12,4a9,9 0,1 0,0 18a9,9 0,0 0,0 -18M11,7h2v6h-2zM11,15h2v2h-2z" /></vector>');
    return next;
  }]);
};
