import type { TestConfig } from "@/components/exam/SetupScreen";
import type { Option, TestRecord } from "@/lib/exam";
import {
  ACTIVE_TEST_KEY,
  parseActiveTestSession,
  type ActiveTestSession,
} from "../../mobile-tasks/src/domain/active-test-session";

export type WebTestPayload = {
  config: TestConfig;
  answerKey: (Option | null)[] | null;
  replay: TestRecord | null;
};
export type WebTestSession = ActiveTestSession<WebTestPayload>;

export function loadActiveTest(): WebTestSession | null {
  try {
    const session = parseActiveTestSession<WebTestPayload>(
      localStorage.getItem(ACTIVE_TEST_KEY),
      "web",
    );
    const config = session?.payload.config;
    if (
      !session ||
      !config ||
      !Number.isFinite(config.minutes) ||
      config.minutes <= 0 ||
      session.remaining > config.minutes * 60 ||
      !config.marking ||
      typeof config.subject !== "string" ||
      typeof config.chapter !== "string" ||
      (config.questionCount !== null && config.questionCount !== session.states.length)
    )
      return null;
    return session;
  } catch {
    return null;
  }
}

export function saveActiveTest(session: WebTestSession) {
  localStorage.setItem(ACTIVE_TEST_KEY, JSON.stringify(session));
}

export function clearActiveTest() {
  localStorage.removeItem(ACTIVE_TEST_KEY);
}
