import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ACTIVE_TEST_KEY,
  parseActiveTestSession,
  type ActiveTestSession,
} from "../domain/active-test-session";

// Serialize checkpoints and removal so a delayed write cannot resurrect a submitted test.
let pending: Promise<unknown> = Promise.resolve();
function enqueue(action: () => Promise<unknown>) {
  const next = pending.catch(() => undefined).then(action);
  pending = next;
  return next;
}

type MobileTestPayload = {
  ownerId: string | null;
  activeTest: {
    duration: number;
    marking: { positive: number; negative: number };
    [key: string]: unknown;
  };
  answerKey: Array<"A" | "B" | "C" | "D" | null>;
  reattemptOf: string | null;
};

export async function loadActiveTest(): Promise<ActiveTestSession<MobileTestPayload> | null> {
  await pending.catch(() => undefined);
  const session = parseActiveTestSession<MobileTestPayload>(
    await AsyncStorage.getItem(ACTIVE_TEST_KEY),
    "mobile",
  );
  const payload = session?.payload;
  const ownerId = await AsyncStorage.getItem("ssc-buddy:local-cache-owner:v1");
  const test = payload?.activeTest;
  if (
    !session ||
    !test ||
    payload?.ownerId !== ownerId ||
    !Number.isFinite(test.duration) ||
    test.duration <= 0 ||
    session.remaining > test.duration * 60 ||
    !test.marking ||
    !Array.isArray(payload.answerKey) ||
    payload.answerKey.length !== session.states.length
  )
    return null;
  return session;
}

export function saveActiveTest(session: ActiveTestSession<unknown>) {
  const raw = JSON.stringify(session);
  return enqueue(() => AsyncStorage.setItem(ACTIVE_TEST_KEY, raw));
}

export function clearActiveTest() {
  return enqueue(() => AsyncStorage.removeItem(ACTIVE_TEST_KEY));
}
