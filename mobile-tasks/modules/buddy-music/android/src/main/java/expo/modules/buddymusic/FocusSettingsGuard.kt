package expo.modules.buddymusic

/** Resolve Settings targets for overlay policy, never for activity redirection. */
internal object FocusSettingsGuard {
  fun packages(resolved: List<String>): Set<String> = setOf("com.android.settings") + resolved.filter {
    it.isNotBlank() && it !in setOf("android", "com.android.systemui", "com.android.permissioncontroller", "com.google.android.permissioncontroller")
  }
}
