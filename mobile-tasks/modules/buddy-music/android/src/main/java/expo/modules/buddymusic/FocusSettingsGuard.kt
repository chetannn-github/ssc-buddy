package expo.modules.buddymusic

/** Activity fallback for Settings and blocked apps that can suppress overlays. */
internal class FocusSettingsGuard {
  private var lastTarget = ""
  private var lastAttempt: Long? = null

  fun shouldReturn(target: String, now: Long, deadline: Long, ringing: Boolean, settingsPackages: Set<String>, blockedOverlayProtected: Boolean = false): Boolean {
    if (target.isBlank() || (!FocusAppPolicy.isSettings(target, settingsPackages) && !blockedOverlayProtected) || now >= deadline || ringing) {
      lastTarget = ""; lastAttempt = null
      return false
    }
    val previous = lastAttempt
    if (lastTarget == target && previous != null && now >= previous && now - previous < 2_000L) return false
    lastTarget = target; lastAttempt = now
    return true
  }

  companion object {
    fun needsActivityReturn(target: String, blocked: Boolean, declaresOverlayProtection: Boolean): Boolean =
      blocked && (target in FocusPaymentPolicy.packages || declaresOverlayProtection)

    fun packages(resolved: List<String>): Set<String> = setOf("com.android.settings") + resolved.filter {
      it.isNotBlank() && it !in setOf("android", "com.android.systemui", "com.android.permissioncontroller", "com.google.android.permissioncontroller")
    }
  }
}
