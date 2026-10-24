package expo.modules.buddymusic

/** Usage-event reducer. No screen contents, URLs, or historical usage are persisted. */
internal class FocusForegroundTracker {
  var current = ""
    private set
  private var latestResume = Long.MIN_VALUE
  private var screenBlockedAt = Long.MIN_VALUE
  private val ended = mutableMapOf<String, Long>()
  fun reset() { current = ""; latestResume = Long.MIN_VALUE; screenBlockedAt = Long.MIN_VALUE; ended.clear() }
  fun event(packageName: String, type: Int, at: Long): Boolean {
    // Notification/foreground-service/interaction events do not establish which
    // activity is visible. They must not discard a delayed activity transition.
    if (type !in setOf(1, 2, 23, 16, 17)) return false
    when (type) {
      1 -> {
        // A late resume can precede the previous app's already-delivered pause.
        // Only a newer RESUME, this package's own end, or screen lock invalidates
        // it. A global timestamp watermark loses this transition permanently.
        if (packageName.isBlank() || at < latestResume || at <= screenBlockedAt || at <= (ended[packageName] ?: Long.MIN_VALUE)) return false
        latestResume = at; current = packageName
      }
      2, 23 -> {
        if (at <= (ended[packageName] ?: Long.MIN_VALUE)) return false
        ended[packageName] = at
        if (current == packageName && at >= latestResume) current = ""
      }
      16, 17 -> {
        if (at <= screenBlockedAt) return false
        screenBlockedAt = at
        if (at >= latestResume) current = ""
      }
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
