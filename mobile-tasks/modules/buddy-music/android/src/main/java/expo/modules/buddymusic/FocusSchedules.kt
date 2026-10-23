package expo.modules.buddymusic

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/** Local deadlines, not JavaScript/background connectivity, start Android locks. */
internal object FocusSchedules {
  const val ACTION = "expo.modules.buddymusic.FOCUS_SCHEDULE"
  fun exactAccess(context: Context) = Build.VERSION.SDK_INT < 31 || (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
  private fun schedules(context: Context): List<FocusSchedulePolicy.Schedule> = runCatching {
    val array = JSONArray(BuddyFocusService.prefs(context).getString("focusSchedules", "[]"))
    (0 until array.length()).mapNotNull { index -> runCatching {
      val item = array.getJSONObject(index)
      val weekdays = item.getJSONArray("weekdays")
      FocusSchedulePolicy.Schedule(item.getString("id"), item.getString("name"), (0 until weekdays.length()).map { weekdays.getInt(it) }.toSet(), item.getInt("startMinute"), item.getInt("endMinute"), item.getString("timeZone"), item.optInt("appLimit", 0).coerceIn(0, 2), item.getLong("createdAt"), item.optBoolean("enabled", true))
    }.getOrNull() }
  }.getOrDefault(emptyList())
  fun configure(context: Context, uid: String, json: String) {
    val prefs = BuddyFocusService.prefs(context)
    JSONArray(json) // Reject an invalid cache before replacing the working one.
    if (prefs.getString("scheduleOwner", "") != uid || prefs.getString("focusSchedules", "[]") != json) prefs.edit().putString("scheduleOwner", uid).putString("focusSchedules", json).commit()
    tick(context); arm(context)
  }
  fun tick(context: Context, now: Long = System.currentTimeMillis()) {
    val prefs = BuddyFocusService.prefs(context)
    if (prefs.getString("scheduleOwner", "").isNullOrEmpty() || FocusAppPolicy.lockActive(prefs.getString("session", "").orEmpty(), prefs.getBoolean("paused", false), prefs.getLong("endsAt", 0), now)) return
    val occurrence = schedules(context).flatMap { FocusSchedulePolicy.occurrences(it, now) }.firstOrNull { it.startedAt <= now && now < it.endsAt } ?: return
    if (prefs.getString("lastScheduledOccurrence", "") == occurrence.id) return
    val start = maxOf(occurrence.startedAt, prefs.getLong("endsAt", 0))
    if (start >= occurrence.endsAt) return
    val owner = prefs.getString("scheduleOwner", "").orEmpty()
    val session = JSONObject().put("id", occurrence.id).put("startedAt", start).put("endsAt", occurrence.endsAt).put("timeZone", occurrence.schedule.timeZone)
      .put("domains", JSONArray()).put("appLimit", occurrence.schedule.appLimit).put("breakLimit", 0).put("breaksTaken", 0).put("scheduleId", occurrence.schedule.id)
    val pending = JSONArray(prefs.getString("scheduledFocusJournal", "[]"))
    // Keep completed sessions until JS has durably uploaded them. No future
    // time is credited by the native journal itself.
    pending.put(JSONObject().put("uid", owner).put("session", session))
    check(prefs.edit().putString("lastScheduledOccurrence", occurrence.id).putString("scheduledFocusJournal", pending.toString())
      .putString("session", occurrence.id).putLong("endsAt", occurrence.endsAt).putLong("phaseStartedAt", start).putInt("appLimit", occurrence.schedule.appLimit)
      .putBoolean("paused", false).putLong("remainingMs", 0).putInt("breakLimit", 0).putInt("breaksTaken", 0).remove("breakUntil").putStringSet("allowed", emptySet()).commit())
  }
  fun arm(context: Context, now: Long = System.currentTimeMillis()) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pending = PendingIntent.getBroadcast(context, 7323, Intent(context, FocusRestoreReceiver::class.java).setAction(ACTION), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val windows = schedules(context).flatMap { FocusSchedulePolicy.occurrences(it, now) }
    val next = windows.flatMap { listOf(it.startedAt, it.endsAt) }.filter { it > now }.minOrNull()
    if (next == null) { manager.cancel(pending); return }
    try {
      if (exactAccess(context)) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
      else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
    } catch (_: SecurityException) {
      // Permission can be revoked between checking it and arming the alarm.
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
    }
  }
}
