import { useMemo } from "react";
import { PanResponder } from "react-native";
import { questionAfterSwipe, shouldCaptureQuestionSwipe } from "../domain/question-navigation";

/** Capture horizontal drags on the question card without taking vertical scrolls or taps. */
export function useQuestionSwipe(
  current: number,
  count: number,
  onCurrent: (index: number) => void,
) {
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          shouldCaptureQuestionSwipe(gesture.dx, gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          const next = questionAfterSwipe(current, count, gesture.dx, gesture.dy);
          if (next !== current) onCurrent(next);
        },
      }).panHandlers,
    [current, count, onCurrent],
  );
}
