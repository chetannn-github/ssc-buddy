const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const RECEIVER = "com.sscbuddy.tasks.UnlockQuizReceiver";

module.exports = function withUnlockQuizReceiver(config) {
  config = withAndroidManifest(config, (next) => {
    const application = next.modResults.manifest.application?.[0];
    if (!application) return next;
    const receivers = application.receiver ?? (application.receiver = []);
    if (!receivers.some((receiver) => receiver.$?.["android:name"] === RECEIVER)) {
      receivers.push({
        $: { "android:name": RECEIVER, "android:exported": "false" },
        "intent-filter": [{ action: [{ $: { "android:name": "android.intent.action.USER_PRESENT" } }] }],
      });
    }
    return next;
  });
  return withDangerousMod(config, ["android", async (next) => {
    const packagePath = "com/sscbuddy/tasks";
    const output = path.join(next.modRequest.platformProjectRoot, "app/src/main/java", packagePath, "UnlockQuizReceiver.java");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `package com.sscbuddy.tasks;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

/** Refreshes the React Native widget when the user unlocks their device. */
public final class UnlockQuizReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context, Intent intent) {
    if (!Intent.ACTION_USER_PRESENT.equals(intent.getAction())) return;
    String[] widgets = {"DailyTasksWidget", "QuickRecallWidget"};
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    for (String widget : widgets) {
      ComponentName provider = new ComponentName(context, "com.sscbuddy.tasks.widget." + widget);
      int[] ids = manager.getAppWidgetIds(provider);
      if (ids.length == 0) continue;
      Intent update = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
      update.setComponent(provider);
      update.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
      context.sendBroadcast(update);
    }
  }
}
`);
    return next;
  }]);
};
