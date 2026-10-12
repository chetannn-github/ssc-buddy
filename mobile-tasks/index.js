import { registerRootComponent } from "expo";
import { Platform } from "react-native";

import App from "./App";

if (Platform.OS === "android") {
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  const { registerWidgetTaskHandler } = require("react-native-android-widget");
  const { renderDailyTasksWidget } = require("./src/widgets/DailyTasksWidget");
  const { renderQuickRecallWidget } = require("./src/widgets/QuickRecallWidget");
  const { answerUnlockQuiz, advanceUnlockQuiz, getUnlockQuiz, startUnlockQuiz } = require("./src/domain/unlock-quiz");
  const { getFirebaseAuth, toggleTaskFromWidget } = require("./src/lib/firebase");
  const { onAuthStateChanged } = require("firebase/auth");

  const getWidgetUser = async () => {
    const auth = getFirebaseAuth();
    if (auth.currentUser) return auth.currentUser;
    return new Promise((resolve) => {
      let settled = false;
      let timeout;
      let unsubscribe = () => undefined;
      const finish = (user) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsubscribe();
        resolve(user);
      };
      timeout = setTimeout(() => finish(null), 4000);
      unsubscribe = onAuthStateChanged(auth, finish);
    });
  };

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
      if (widgetAction === "WIDGET_CLICK" && clickAction === "TOGGLE_TASK") {
        const taskId = typeof clickActionData?.taskId === "string" ? clickActionData.taskId : "";
        if (taskId) {
          try {
            const user = await getWidgetUser();
            const updated = user ? await toggleTaskFromWidget(user, taskId) : null;
            if (updated) {
              tasks = tasks.map((task) => task.id === taskId ? updated : task);
              await AsyncStorage.setItem("ssc-buddy:tasks:v2", JSON.stringify(tasks));
            }
          } catch {}
        }
      }
      renderWidget(renderDailyTasksWidget(tasks));
      return;
    }
    let quiz;
    if (widgetAction === "WIDGET_CLICK" && (clickAction === "QUIZ_ANSWER" || clickAction?.startsWith("QUIZ_ANSWER_"))) {
      // Answer choice is deliberately encoded in the action name as well as
      // accepting the legacy data payload. Several Android launchers omit
      // clickActionData for home-screen widgets.
      const choice = clickAction?.replace("QUIZ_ANSWER_", "") || clickActionData?.choice;
      if (["A", "B", "C", "D"].includes(choice)) quiz = await answerUnlockQuiz(choice);
    } else if (widgetAction === "WIDGET_CLICK" && clickAction === "QUIZ_NEXT") {
      quiz = await advanceUnlockQuiz();
    } else if (widgetAction === "WIDGET_CLICK" && clickAction === "QUIZ_NEW_SESSION") {
      quiz = await startUnlockQuiz();
    } else {
      quiz = await getUnlockQuiz();
    }
    renderWidget(renderQuickRecallWidget(quiz));
    // Keep answer feedback on screen while the countdown runs. The learner
    // explicitly taps Next once it becomes available.
    if (quiz?.status === "correction" && (quiz.lockedUntil ?? 0) > Date.now()) {
      // Android widgets do not have a ticking clock; refresh once per second so
      // the learner can actually see the fifteen-second correction countdown.
      while ((quiz.lockedUntil ?? 0) > Date.now()) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        quiz = await getUnlockQuiz();
        renderWidget(renderQuickRecallWidget(quiz));
      }
      renderWidget(renderQuickRecallWidget(await getUnlockQuiz()));
    }
  });
}

// Explicit entry point avoids Expo AppEntry resolving App from pnpm's nested store.
registerRootComponent(App);
