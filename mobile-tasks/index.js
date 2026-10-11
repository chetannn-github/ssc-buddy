import { registerRootComponent } from "expo";
import { Platform } from "react-native";

import App from "./App";

if (Platform.OS === "android") {
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  const { registerWidgetTaskHandler } = require("react-native-android-widget");
  const { renderDailyTasksWidget } = require("./src/widgets/DailyTasksWidget");
  const { renderQuickRecallWidget } = require("./src/widgets/QuickRecallWidget");
  const { answerUnlockQuiz, advanceUnlockQuiz, getUnlockQuiz, startUnlockQuiz } = require("./src/domain/unlock-quiz");

  registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) => {
    if (!["DailyTasksWidget", "QuickRecallWidget"].includes(widgetInfo.widgetName)) return;
    const raw = await AsyncStorage.getItem("ssc-buddy:tasks:v2");
    let tasks = [];
    try {
      tasks = raw ? JSON.parse(raw) : [];
    } catch {
      tasks = [];
    }
    if (widgetInfo.widgetName === "DailyTasksWidget") {
      renderWidget(renderDailyTasksWidget(tasks));
      return;
    }
    let quiz;
    if (widgetAction === "WIDGET_CLICK" && clickAction === "QUIZ_ANSWER") {
      const choice = clickActionData?.choice;
      if (["A", "B", "C", "D"].includes(choice)) quiz = await answerUnlockQuiz(choice);
    } else if (widgetAction === "WIDGET_CLICK" && clickAction === "QUIZ_NEXT") {
      quiz = await advanceUnlockQuiz();
    } else if (widgetAction === "WIDGET_CLICK" && clickAction === "QUIZ_NEW_SESSION") {
      quiz = await startUnlockQuiz();
    } else {
      quiz = await getUnlockQuiz();
    }
    renderWidget(renderQuickRecallWidget(quiz));
    // Keep an incorrect answer on screen long enough to teach the correction,
    // then move to the next question without requiring another widget tap.
    if (quiz?.status === "correction" && (quiz.lockedUntil ?? 0) > Date.now()) {
      // Android widgets do not have a ticking clock; refresh once per second so
      // the learner can actually see the fifteen-second correction countdown.
      while ((quiz.lockedUntil ?? 0) > Date.now()) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        quiz = await getUnlockQuiz();
        renderWidget(renderQuickRecallWidget(quiz));
      }
      const nextQuiz = await advanceUnlockQuiz();
      renderWidget(renderQuickRecallWidget(nextQuiz));
    }
  });
}

// Explicit entry point avoids Expo AppEntry resolving App from pnpm's nested store.
registerRootComponent(App);
