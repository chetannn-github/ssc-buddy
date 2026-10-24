package expo.modules.buddymusic

internal object FocusCompletionPolicy {
  data class Session(val id: String, val start: Long, val end: Long, val paused: Boolean, val pausedAt: Long)
  data class State(val session: Session, val parts: Map<Long, Long>, val armed: Boolean)
  data class Result(val state: State?, val completed: Pair<String, Long>? = null)
  fun advance(previous: State?, current: Session?, now: Long): Result {
    val old = previous?.session
    var parts = previous?.parts.orEmpty()
    if (old != null && !old.paused && (current != old || now >= old.end)) {
      val stop = if (current?.id == old.id && current.paused) current.pausedAt else now
      parts = parts + (old.start to maxOf(parts[old.start] ?: 0, (minOf(old.end, stop) - old.start).coerceAtLeast(0)))
    }
    if (old != null && previous.armed && !old.paused && now >= old.end && (current == null || current.id != old.id || current.end <= now)) {
      return Result(if (current != null && current.id != old.id && now < current.end) State(current, emptyMap(), true) else null, old.id to parts.values.sum())
    }
    if (current == null || current.id.isBlank()) return Result(null)
    if (old?.id != current.id) return Result(State(current, emptyMap(), current.paused || now < current.end))
    return Result(State(current, parts, previous.armed))
  }
  fun duration(milliseconds: Long): String {
    val seconds = milliseconds.coerceAtLeast(0) / 1000
    val minutes = seconds / 60
    return if (minutes >= 60) "${minutes / 60}h${if (minutes % 60 > 0) " ${minutes % 60}m" else ""}" else if (minutes > 0) "${minutes}m" else "${seconds}s"
  }
}
