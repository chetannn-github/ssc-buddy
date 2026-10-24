package expo.modules.buddymusic

/** Window/dialog refreshes are not evidence that the user opened another app. */
internal object FocusWindowPolicy {
  fun foreground(current: String, target: String, ownPackage: String, overlayVisible: Boolean, appActivity: Boolean, fullScreenSettings: Boolean = false): String {
    if (target.isBlank() || target == current || target == "com.android.systemui") return current
    if (target == ownPackage && overlayVisible) return current
    return if (appActivity || fullScreenSettings) target else current
  }

  /** Passive refreshes may update/hide an existing overlay, never summon one. */
  fun mayShow(blocked: Boolean, appSwitch: Boolean, restrictionStarted: Boolean) = blocked && (appSwitch || restrictionStarted)
}
