import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { UnlockQuizState } from "../domain/unlock-quiz";

const options = ["A", "B", "C", "D"] as const;

export function renderQuickRecallWidget(quiz?: UnlockQuizState | null) {
  if (!quiz?.questions.length) return <FlexWidget clickAction="OPEN_APP" style={{ width: "match_parent", height: "match_parent", flexDirection: "column", justifyContent: "center", backgroundColor: "#171717", borderRadius: 22, padding: 17 }}><TextWidget text="SSC BUDDY · QUICK RECALL" style={{ color: "#8ee7d3", fontSize: 10, fontWeight: "bold", letterSpacing: 1.4 }} /><TextWidget text="Add question-based exercises to begin" style={{ color: "#f5f5f5", fontSize: 15, fontWeight: "bold", marginTop: 8 }} /><TextWidget text="Your next unlock will bring 3 questions from one subject." style={{ color: "#9b9ba2", fontSize: 11, marginTop: 6 }} /></FlexWidget>;
  if (quiz.status === "complete") return <FlexWidget clickAction="QUIZ_NEW_SESSION" style={{ width: "match_parent", height: "match_parent", flexDirection: "column", justifyContent: "center", backgroundColor: "#171717", borderRadius: 22, padding: 17 }}><TextWidget text="QUICK RECALL COMPLETE" style={{ color: "#8ee7d3", fontSize: 10, fontWeight: "bold", letterSpacing: 1.4 }} /><TextWidget text={`${quiz.correct}/${quiz.questions.length} correct · ${quiz.subject}`} style={{ color: "#f5f5f5", fontSize: 19, fontWeight: "bold", marginTop: 8 }} /><TextWidget text="Tap anywhere for another 3-question round" style={{ color: "#b4b4b8", fontSize: 11, marginTop: 7 }} /></FlexWidget>;
  const question = quiz.questions[quiz.index];
  const waiting = quiz.status === "correction";
  const reviewReady = quiz.status === "review";
  const seconds = Math.max(0, Math.ceil(((quiz.lockedUntil ?? Date.now()) - Date.now()) / 1000));
  return <FlexWidget style={{ width: "match_parent", height: "match_parent", flexDirection: "column", backgroundColor: "#171717", borderRadius: 22, padding: 9 }}>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><FlexWidget style={{ backgroundColor: "#123b34", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginRight: 10, flex: 1 }}><TextWidget text={`QUICK RECALL · ${quiz.subject.toUpperCase()}`} maxLines={1} truncate="END" style={{ color: "#83efd4", fontSize: 9, fontWeight: "bold", letterSpacing: 1 }} /></FlexWidget>{reviewReady ? <FlexWidget clickAction="QUIZ_NEXT" style={{ borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#60a5fa" }}><TextWidget text="Next" style={{ color: "#082f49", fontSize: 11, fontWeight: "bold" }} /></FlexWidget> : <TextWidget text={waiting ? `${seconds}s` : `Q${quiz.index + 1}/${quiz.questions.length}`} style={{ color: waiting ? "#93c5fd" : "#d4d4d8", fontSize: waiting ? 15 : 11, fontWeight: "bold", marginLeft: 10 }} />}</FlexWidget>
    <TextWidget text={question.question} maxLines={2} truncate="END" style={{ color: "#f5f5f5", fontSize: 14, fontWeight: "bold", marginTop: 8 }} />
    <FlexWidget style={{ width: "match_parent", flexDirection: "column", marginTop: 5 }}>{options.map((choice) => {
      const correct = choice === question.correctAnswer;
      const selected = choice === quiz.selected;
      const revealed = (waiting || reviewReady) && (correct || selected);
      const backgroundColor = (waiting || reviewReady) && correct ? "#123b34" : (waiting || reviewReady) && selected ? "#3a2023" : "#292929";
      const borderColor = (waiting || reviewReady) && correct ? "#4fd1b5" : (waiting || reviewReady) && selected ? "#f87171" : "#292929";
      // Keep the answer in the action name too. Some Android launchers drop
      // clickActionData for nested widget views, which used to make taps look
      // like they did nothing.
      return <FlexWidget key={choice} {...(quiz.status === "active" ? { clickAction: `QUIZ_ANSWER_${choice}`, clickActionData: { choice } } : {})} style={{ width: "match_parent", flexDirection: "row", alignItems: "center", borderRadius: 11, borderWidth: revealed ? 1 : 0, borderColor, paddingHorizontal: 11, paddingVertical: 7, marginTop: 4, backgroundColor }}><TextWidget text={choice} style={{ color: (waiting || reviewReady) && correct ? "#83efd4" : selected ? "#fca5a5" : "#7dd3c7", fontSize: 11, fontWeight: "bold", width: 22, marginRight: 3 }} /><TextWidget text={question.options[options.indexOf(choice)]} style={{ color: "#ededed", fontSize: 11, lineHeight: 14, width: "match_parent" }} /></FlexWidget>;
    })}</FlexWidget>
    {(waiting || reviewReady) && <FlexWidget style={{ width: "match_parent", flexDirection: "column", borderRadius: 10, padding: 8, marginTop: 6, backgroundColor: "#202425", borderWidth: 1, borderColor: "#333b3d" }}><TextWidget text={question.explanation || `The correct option is ${question.correctAnswer}.`} maxLines={2} style={{ color: "#d4d4d8", fontSize: 10 }} /></FlexWidget>}
  </FlexWidget>;
}
