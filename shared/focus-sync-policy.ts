import { effectiveStudySession } from "./study-breaks.ts";
import type { FocusSession } from "./study-focus.ts";

/** Running time is derived locally from the saved deadline, not written per tick. */
export function focusSettlementDue(session: FocusSession | null | undefined, now = Date.now()) {
  if (!session) return false;
  const current = effectiveStudySession(session, now);
  return current.paused === true || now >= current.endsAt;
}

