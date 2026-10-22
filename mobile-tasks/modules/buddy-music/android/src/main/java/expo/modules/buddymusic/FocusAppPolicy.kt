package expo.modules.buddymusic

internal object FocusAppPolicy {
  fun lockActive(id: String, paused: Boolean, endsAt: Long, now: Long): Boolean =
    id.isNotBlank() && (paused || now < endsAt)
  fun blocks(target: String, now: Long, endsAt: Long, essentials: Set<String>, allowed: Set<String>, ringing: Boolean = false): Boolean =
    !ringing && target.isNotBlank() && now < endsAt && target !in essentials && target !in allowed

  fun appLimit(value: Int) = value.coerceIn(0, 2)
  fun allow(target: String, now: Long, endsAt: Long, allowed: Set<String>, limit: Int = 2): Set<String> =
    if (target.isBlank() || now >= endsAt || (target !in allowed && allowed.size >= appLimit(limit))) allowed else allowed + target

  fun forSession(previousId: String, id: String, allowed: Set<String>): Set<String> = if (previousId == id) allowed else emptySet()
}
