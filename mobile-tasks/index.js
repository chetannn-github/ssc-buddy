import { registerRootComponent } from "expo";
import Constants from "expo-constants";
import { AppRegistry, Platform } from "react-native";

import App from "./App";

// Home-screen widgets contain Android native code and are deliberately not
// available inside Expo Go. Keeping their registration out of that runtime
// lets the normal app continue to work there while preview/release builds
// retain full widget support.
const supportsAndroidWidgets = Platform.OS === "android" && Constants.appOwnership !== "expo";

if (supportsAndroidWidgets) {
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  const { registerWidgetConfigurationScreen } = require("react-native-android-widget");
  const { TimerWidgetConfiguration, TimerWidgetShortcut } = require("./src/widgets/TimerWidgetConfiguration");
  AppRegistry.registerComponent("TimerWidgetSetup", () => TimerWidgetShortcut);
  const { timerWidgetView, removeTimerWidget, bindPendingTimerWidget } = require("./src/widgets/timer-widget-store");
  const { HabitWidgetConfiguration } = require("./src/widgets/HabitWidgetConfiguration");
  const React = require("react");
  registerWidgetConfigurationScreen((props) => React.createElement(["HabitWidget", "HabitMonthWidget", "HabitCompactWidget"].includes(props.widgetInfo.widgetName) ? HabitWidgetConfiguration : TimerWidgetConfiguration, props));
  const { habitWidgetView, removeHabitWidget, bindPendingHabitWidget, actOnHabitWidget } = require("./src/widgets/habit-widget-store");
  const { registerWidgetTaskHandler } = require("react-native-android-widget");
  const { renderDailyTasksWidget } = require("./src/widgets/DailyTasksWidget");
  const { loadDailyTaskWidgetOptions, saveDailyTaskWidgetOptions, removeDailyTaskWidgetOptions } = require("./src/widgets/daily-task-widget-store");
  const { loadProfile } = require("./src/lib/profile-store");
  const { dateKey } = require("./src/domain/tasks");
  const { renderQuickRecallWidget } = require("./src/widgets/QuickRecallWidget");
  const { answerUnlockQuiz, advanceUnlockQuiz, getUnlockQuiz, loadUnlockQuiz, releaseUnlockQuizReview, startUnlockQuiz } = require("./src/domain/unlock-quiz");
  const { getFirebaseAuth, publishLeaderboardAfterWidgetTask, recordQuickRecallPractice, toggleTaskFromWidget, writeQuestionLearning } = require("./src/lib/firebase");
  const { onAuthStateChanged } = require("firebase/auth");
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  // Widget layouts are static snapshots. Refresh the correction UI while its
  // lock is active so the countdown reaches a usable Next button without the
  // user needing to reopen the app or tap a dead-looking control.
  const refreshRecallCountdown = async (quiz, renderWidget) => {
    const deadline = Number(quiz?.lockedUntil) || 0;
    while (deadline > Date.now()) {
      await wait(Math.min(1000, deadline - Date.now()));
      // The countdown only needs local state. Cloud deletion checks still run
      // at the next widget interaction, before answering/advancing.
      let latest = await loadUnlockQuiz();
      if (!latest || latest.runId !== quiz.runId || latest.index !== quiz.index) return;
      if (latest.status !== "correction" || latest.lockedUntil !== deadline) {
        if (latest.status === "review") renderWidget(renderQuickRecallWidget(latest));
        return;
      }
      if (Date.now() >= deadline) latest = await releaseUnlockQuizReview();
      if (!latest || latest.runId !== quiz.runId || latest.index !== quiz.index) return;
      renderWidget(renderQuickRecallWidget(latest));
    }
  };

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
    if (widgetInfo.widgetName === "FocusTimerWidget") {
      if (widgetAction === "WIDGET_DELETED") return;
      const user = await getWidgetUser();
      const { focusTimerWidgetView } = require("./src/widgets/focus-timer-widget-store");
      const { renderFocusTimerWidget } = require("./src/widgets/FocusTimerWidget");
      renderWidget(renderFocusTimerWidget(await focusTimerWidgetView(user?.uid)));
      return;
    }
    if (["HabitWidget", "HabitMonthWidget", "HabitCompactWidget"].includes(widgetInfo.widgetName)) {
      if (widgetAction === "WIDGET_DELETED") { await removeHabitWidget(widgetInfo.widgetId); return; }
      const user = await getWidgetUser(); let error = "";
      if (widgetAction === "WIDGET_ADDED") await bindPendingHabitWidget(widgetInfo.widgetId, user?.uid, widgetInfo.widgetName);
      if (widgetAction === "WIDGET_CLICK" && user && clickAction?.startsWith("HABIT_")) {
        try { await actOnHabitWidget(widgetInfo.widgetId, user.uid, clickAction); } catch { error = "Could not save. Tap to retry."; }
      }
      renderWidget(await habitWidgetView(widgetInfo.widgetId, user?.uid, error, true, widgetInfo)); return;
    }
    if (widgetInfo.widgetName === "TimerWidget") {
      if (widgetAction === "WIDGET_DELETED") { await removeTimerWidget(widgetInfo.widgetId); return; }
      const widgetUser = await getWidgetUser();
      if (widgetAction === "WIDGET_ADDED") await bindPendingTimerWidget(widgetInfo.widgetId, widgetUser?.uid);
      renderWidget(await timerWidgetView(widgetInfo.widgetId, widgetUser?.uid));
      return;
    }
    if (!["DailyTasksWidget", "QuickRecallWidget"].includes(widgetInfo.widgetName)) return;
    const raw = await AsyncStorage.getItem("ssc-buddy:tasks:v2");
    let tasks = [];
    try {
      tasks = raw ? JSON.parse(raw) : [];
    } catch {
      tasks = [];
    }
    if (widgetInfo.widgetName === "DailyTasksWidget") {
      if (widgetAction === "WIDGET_DELETED") { await removeDailyTaskWidgetOptions(widgetInfo.widgetId); return; }
      const owner = await getWidgetUser();
      let view = await loadDailyTaskWidgetOptions(widgetInfo.widgetId, owner?.uid);
      if (widgetAction === "WIDGET_CLICK" && clickAction?.startsWith("DAILY_")) {
        if (clickAction === "DAILY_FILTER_DUE") view = { ...view, dueOnly: true };
        else if (clickAction === "DAILY_FILTER_ALL") view = { ...view, dueOnly: false };
        else if (/^DAILY_DATE_\d{4}-\d{2}-\d{2}$/.test(clickAction)) { const date = clickAction.slice("DAILY_DATE_".length); view = { ...view, date: date === dateKey() ? undefined : date }; }
        await saveDailyTaskWidgetOptions(widgetInfo.widgetId, owner?.uid, view);
      }
      if (widgetAction === "WIDGET_CLICK" && clickAction === "TOGGLE_TASK") {
        const taskId = typeof clickActionData?.taskId === "string" ? clickActionData.taskId : "";
        if (taskId) {
          try {
            const user = await getWidgetUser();
            const updated = user ? await toggleTaskFromWidget(user, taskId) : null;
            if (updated) {
              tasks = tasks.map((task) => task.id === taskId ? updated : task);
              await AsyncStorage.setItem("ssc-buddy:tasks:v2", JSON.stringify(tasks));
              await publishLeaderboardAfterWidgetTask(user).catch(() => undefined);
            }
          } catch {}
        }
      }
      let widgetRank = null;
      try {
        const rawMeta = await AsyncStorage.getItem("ssc-buddy:widget-meta:v1");
        const meta = rawMeta ? JSON.parse(rawMeta) : null;
        widgetRank = Number.isFinite(Number(meta?.rank)) && Number(meta.rank) > 0 ? Number(meta.rank) : null;
      } catch {}
      const profile = await loadProfile();
      renderWidget(renderDailyTasksWidget(owner ? tasks : [], widgetRank, profile.accentColor, { ...view, height: widgetInfo.height }));
      // Android may deliver the scheduled widget refresh after midnight while
      // the app UI is closed. Rebuild the cloud score from the same task data
      // so overdue-task penalties are not delayed until a manual task action.
      void getWidgetUser()
        .then((user) => user ? publishLeaderboardAfterWidgetTask(user) : undefined)
        .catch(() => undefined);
      return;
    }
    if (widgetAction === "WIDGET_DELETED") return;
    const newRecall = widgetAction === "WIDGET_CLICK" && clickAction === "QUIZ_NEW_SESSION";
    let quiz = newRecall ? await startUnlockQuiz() : await getUnlockQuiz();
    let answered = false;
    let answeredQuestion = null;
    let answeredChoice = null;
    if (widgetAction === "WIDGET_CLICK" && (clickAction === "QUIZ_ANSWER" || clickAction?.startsWith("QUIZ_ANSWER_"))) {
      // Answer choice is deliberately encoded in the action name as well as
      // accepting the legacy data payload. Several Android launchers omit
      // clickActionData for home-screen widgets.
      const choice = clickActionData?.choice || clickAction?.replace("QUIZ_ANSWER_", "");
      if (["A", "B", "C", "D"].includes(choice)) {
        answeredQuestion = quiz?.questions?.[quiz.index] ?? null;
        answeredChoice = choice;
        quiz = await answerUnlockQuiz(choice);
        answered = Boolean(quiz);
      }
    } else if (widgetAction === "WIDGET_CLICK" && clickAction === "QUIZ_NEXT") {
      quiz = await advanceUnlockQuiz();
    }
    // Render the answer/result first. Cloud work must never block feedback on
    // the home-screen widget, especially while Firebase restores auth.
    renderWidget(renderQuickRecallWidget(quiz));

    // Begin the visible 10-second tick immediately. Firebase auth/write work
    // can take a few seconds in the widget process; waiting for it previously
    // made the timer look frozen even though the correction lock was active.
    const countdown = answered && quiz?.status === "correction"
      ? refreshRecallCountdown(quiz, renderWidget)
      : null;

    let widgetUser = null;
    if (answered && quiz?.stats) {
      try {
        widgetUser = await getWidgetUser();
        if (widgetUser) {
          await writeQuestionLearning(widgetUser, { stats: quiz.stats, lastSubject: quiz.subject });
          const question = answeredQuestion;
          const answer = answeredChoice;
          if (question && ["A", "B", "C", "D"].includes(answer)) {
            const now = new Date();
            const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            await recordQuickRecallPractice(widgetUser, {
              // The question index is stable inside this sprint. A launcher
              // retry can therefore safely repeat this same transaction.
              runId: `${quiz.runId}:${quiz.index}`, date, startedAt: quiz.startedAt || new Date().toISOString(), subject: quiz.subject,
              questions: [question], answers: [answer],
            });
          }
        }
      } catch {}
    }
    if (countdown) await countdown;
  });
}

// Explicit entry point avoids Expo AppEntry resolving App from pnpm's nested store.
registerRootComponent(App);
