export const ACTIVE_TEST_KEY = "ssc-buddy:active-test:v1";

export type SavedQuestionState = {
  answer: "A" | "B" | "C" | "D" | null;
  visited: boolean;
  marked: boolean;
};

export type ActiveTestSession<T> = {
  version: 1;
  platform: "web" | "mobile";
  id: string;
  payload: T;
  states: SavedQuestionState[];
  current: number;
  remaining: number;
};

// Saved time is a checkpoint, never a deadline: time away is always paused.
export function parseActiveTestSession<T>(
  raw: string | null,
  platform: "web" | "mobile",
): ActiveTestSession<T> | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      !value ||
      value.version !== 1 ||
      value.platform !== platform ||
      typeof value.id !== "string" ||
      !value.id ||
      !value.payload ||
      typeof value.payload !== "object" ||
      !Number.isInteger(value.remaining) ||
      value.remaining < 0 ||
      !Array.isArray(value.states) ||
      !value.states.length ||
      !Number.isInteger(value.current) ||
      value.current < 0 ||
      value.current >= value.states.length ||
      !value.states.every(
        (state: SavedQuestionState) =>
          state &&
          (state.answer === null || ["A", "B", "C", "D"].includes(state.answer)) &&
          typeof state.visited === "boolean" &&
          typeof state.marked === "boolean",
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
