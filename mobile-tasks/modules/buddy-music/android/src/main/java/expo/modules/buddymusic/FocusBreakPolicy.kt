package expo.modules.buddymusic

internal object FocusBreakPolicy {
  const val MIN_FOCUS_MS = 30 * 60000L
  const val DURATION_MS = 10 * 60000L
  fun canBreak(now: Long, phaseStartedAt: Long, endsAt: Long, limit: Int, taken: Int): Boolean =
    limit > taken && now < endsAt && now - phaseStartedAt >= MIN_FOCUS_MS
  fun restrictionDeadline(now: Long, endsAt: Long, paused: Boolean, breakUntil: Long, hasSession: Boolean): Long =
    if (paused && breakUntil > now) 0 else if (paused && hasSession) Long.MAX_VALUE else endsAt
}
