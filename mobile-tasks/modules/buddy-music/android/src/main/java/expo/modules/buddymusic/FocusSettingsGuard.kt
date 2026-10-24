package expo.modules.buddymusic

/** A Settings-only fallback when Android hides application overlays. Never used
 * for notification shade/System UI, allowed apps, timer or image refreshes. */
internal class FocusSettingsGuard {
  private var lastTarget = ""
  private var lastAttempt: Long? = null

  fun shouldReturn(target: String, now: Long, deadline: Long, ringing: Boolean, settingsPackages: Set<String>): Boolean {
    if (!FocusAppPolicy.isSettings(target, settingsPackages) || now >= deadline || ringing) {
      lastTarget = ""; lastAttempt = null
      return false
    }
    val previous = lastAttempt
    if (lastTarget == target && previous != null && now >= previous && now - previous < RETRY_MS) return false
    lastTarget = target; lastAttempt = now
    return true
  }

  companion object {
    const val RETRY_MS = 2_000L
    fun packages(resolved: List<String>): Set<String> = setOf("com.android.settings") + resolved.filter {
      it.isNotBlank() && it !in setOf("android", "com.android.systemui", "com.android.permissioncontroller", "com.google.android.permissioncontroller")
    }
  }
}
