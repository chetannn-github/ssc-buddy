package expo.modules.buddymusic

/** Usage-event reducer. No screen contents, URLs, or historical usage are persisted. */
internal class FocusForegroundTracker {
  var current = ""
    private set
  private var latest = Long.MIN_VALUE
  fun event(packageName: String, type: Int, at: Long) {
    if (at < latest) return
    latest = at
    when (type) {
      1 -> current = packageName // ACTIVITY_RESUMED / MOVE_TO_FOREGROUND
      2, 23 -> if (current == packageName) current = "" // PAUSED / STOPPED
      16, 17 -> current = "" // SCREEN_NON_INTERACTIVE / KEYGUARD_SHOWN
    }
  }
}
