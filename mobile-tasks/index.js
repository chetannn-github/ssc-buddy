import { registerRootComponent } from "expo";
import { Platform } from "react-native";

import App from "./App";

if (Platform.OS === "android") {
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  const { registerWidgetTaskHandler } = require("react-native-android-widget");
  const { renderDailyTasksWidget } = require("./src/widgets/DailyTasksWidget");

  registerWidgetTaskHandler(async ({ widgetInfo, renderWidget }) => {
    if (widgetInfo.widgetName !== "DailyTasksWidget") return;
    const raw = await AsyncStorage.getItem("ssc-buddy:tasks:v2");
    let tasks = [];
    try {
      tasks = raw ? JSON.parse(raw) : [];
    } catch {
      tasks = [];
    }
    renderWidget(renderDailyTasksWidget(tasks));
  });
}

// Explicit entry point avoids Expo AppEntry resolving App from pnpm's nested store.
registerRootComponent(App);
