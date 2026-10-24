package expo.modules.buddymusic

import android.content.Context
import org.json.JSONObject

/** Local-only lifecycle journal; stable running ticks do not write preferences. */
internal object FocusCompletionStore {
  fun observe(c: Context, now: Long = System.currentTimeMillis()) {
    val p = BuddyFocusService.prefs(c)
    val raw = p.getString("completionState", "").orEmpty()
    val previous = runCatching {
      if (raw.isEmpty()) null else JSONObject(raw).let { value ->
        val parts = value.getJSONObject("parts")
        FocusCompletionPolicy.State(FocusCompletionPolicy.Session(value.getString("id"), value.getLong("start"), value.getLong("end"), value.getBoolean("paused"), value.getLong("pausedAt")),
          parts.keys().asSequence().associate { it.toLong() to parts.getLong(it) }, value.getBoolean("armed"))
      }
    }.getOrNull()
    val id = p.getString("session", "").orEmpty()
    val start = p.getLong("phaseStartedAt", previous?.session?.start ?: now)
    val session = if (id.isBlank()) null else FocusCompletionPolicy.Session(id, start, p.getLong("endsAt", 0), p.getBoolean("paused", false), p.getLong("pausedAt", start))
    val next = FocusCompletionPolicy.advance(previous, session, now)
    val serialized = next.state?.let { state -> JSONObject().put("id", state.session.id).put("start", state.session.start).put("end", state.session.end).put("paused", state.session.paused).put("pausedAt", state.session.pausedAt)
      .put("armed", state.armed).put("parts", JSONObject(state.parts.mapKeys { it.key.toString() })).toString() }.orEmpty()
    val completion = next.completed?.takeUnless { it.first == p.getString("completionDismissed", "") || it.first == p.getString("completionPendingId", "") }
    if (serialized != raw || completion != null) {
      val edit = p.edit().putString("completionState", serialized)
      completion?.let { edit.putString("completionPendingId", it.first).putLong("completionDuration", it.second) }
      edit.commit()
    }
  }
  fun pending(c: Context) = BuddyFocusService.prefs(c).getString("completionPendingId", "").orEmpty().isNotEmpty()
  fun dismiss(c: Context) {
    val p = BuddyFocusService.prefs(c)
    p.edit().putString("completionDismissed", p.getString("completionPendingId", "")).remove("completionPendingId").remove("completionDuration").commit()
  }
}
