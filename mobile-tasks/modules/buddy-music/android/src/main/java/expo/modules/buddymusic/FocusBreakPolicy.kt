package expo.modules.buddymusic

internal object FocusBreakPolicy {
  const val MIN_FOCUS_MS = 30 * 60000L
  const val DURATION_MS = 10 * 60000L
  fun canBreak(now: Long, phaseStartedAt: Long, endsAt: Long, limit: Int, taken: Int): Boolean =
    limit > taken && now < endsAt && now - phaseStartedAt >= MIN_FOCUS_MS
}
