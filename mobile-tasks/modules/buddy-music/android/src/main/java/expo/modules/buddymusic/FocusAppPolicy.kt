package expo.modules.buddymusic

internal object FocusAppPolicy {
  fun isSettings(target: String, settingsPackages: Set<String> = setOf("com.android.settings")) = target in settingsPackages
  fun lockActive(id: String, paused: Boolean, endsAt: Long, now: Long): Boolean =
    id.isNotBlank() && (paused || now < endsAt)
  fun blocks(target: String, now: Long, endsAt: Long, essentials: Set<String>, allowed: Set<String>, ringing: Boolean = false, settingsPackages: Set<String> = setOf("com.android.settings")): Boolean =
    !ringing && target.isNotBlank() && now < endsAt && (isSettings(target, settingsPackages) || (target !in essentials && target !in allowed))

  fun appLimit(value: Int) = value.coerceIn(0, 2)
  fun allow(target: String, now: Long, endsAt: Long, allowed: Set<String>, limit: Int = 2, settingsPackages: Set<String> = setOf("com.android.settings")): Set<String> =
    if (target.isBlank() || isSettings(target, settingsPackages) || now >= endsAt || (target !in allowed && allowed.size >= appLimit(limit))) allowed else allowed + target

  fun forSession(previousId: String, id: String, allowed: Set<String>): Set<String> = if (previousId == id) allowed else emptySet()
}
