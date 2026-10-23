package expo.modules.buddymusic

/** Usage-event reducer. No screen contents, URLs, or historical usage are persisted. */
internal class FocusForegroundTracker {
  var current = ""
    private set
  private var latest = Long.MIN_VALUE
  fun reset() { current = ""; latest = Long.MIN_VALUE }
  fun event(packageName: String, type: Int, at: Long): Boolean {
    // Notification/foreground-service/interaction events do not establish which
    // activity is visible. They must not discard a delayed activity transition.
    if (type !in setOf(1, 2, 23, 16, 17) || at < latest) return false
    latest = at
    when (type) {
      1 -> current = packageName // ACTIVITY_RESUMED / MOVE_TO_FOREGROUND
      2, 23 -> if (current == packageName) current = "" // PAUSED / STOPPED
      16, 17 -> current = "" // SCREEN_NON_INTERACTIVE / KEYGUARD_SHOWN
    }
    return true
  }
  companion object {
    fun queryStart(previousScan: Long, now: Long): Long =
      if (previousScan <= 0 || previousScan > now) (now - 24 * 60 * 60 * 1000).coerceAtLeast(0)
      // Usage events may become visible after a query for their timestamp has
      // already completed. Re-read a bounded overlap; event() rejects stale replay.
      else (previousScan - 60_000).coerceAtLeast(0)
  }
}
