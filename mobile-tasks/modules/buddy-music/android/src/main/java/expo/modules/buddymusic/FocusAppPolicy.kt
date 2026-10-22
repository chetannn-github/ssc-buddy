package expo.modules.buddymusic

internal object FocusAppPolicy {
  fun lockActive(id: String, paused: Boolean, endsAt: Long, now: Long): Boolean =
    id.isNotBlank() && (paused || now < endsAt)
  fun blocks(target: String, now: Long, endsAt: Long, essentials: Set<String>, allowed: Set<String>): Boolean =
    target.isNotBlank() && now < endsAt && target !in essentials && target !in allowed

  fun allow(target: String, now: Long, endsAt: Long, allowed: Set<String>): Set<String> =
    if (target.isBlank() || now >= endsAt || (target !in allowed && allowed.size >= 2)) allowed else allowed + target

  fun forSession(previousId: String, id: String, allowed: Set<String>): Set<String> = if (previousId == id) allowed else emptySet()
}
