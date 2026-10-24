package expo.modules.buddymusic

import java.util.Calendar
import java.util.TimeZone

internal object FocusSchedulePolicy {
  data class Schedule(val id: String, val name: String, val weekdays: Set<Int>, val startMinute: Int, val endMinute: Int, val timeZone: String, val appLimit: Int, val createdAt: Long, val enabled: Boolean = true)
  data class Occurrence(val schedule: Schedule, val startedAt: Long, val endsAt: Long) {
    val id get() = "schedule-${schedule.id}-$startedAt"
  }
  fun occurrences(schedule: Schedule, now: Long): List<Occurrence> {
    if (!schedule.enabled || schedule.startMinute !in 0..1439 || schedule.endMinute !in 0..1439 || (schedule.endMinute - schedule.startMinute + 1440) % 1440 !in 1..720) return emptyList()
    val zone = TimeZone.getTimeZone(schedule.timeZone)
    val base = Calendar.getInstance(zone).apply { timeInMillis = now; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
    return (-1..8).mapNotNull { offset ->
      val day = (base.clone() as Calendar).apply { add(Calendar.DATE, offset) }
      if ((day.get(Calendar.DAY_OF_WEEK) - 1) !in schedule.weekdays) return@mapNotNull null
      val start = (day.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, schedule.startMinute / 60); set(Calendar.MINUTE, schedule.startMinute % 60) }.timeInMillis
      val end = (day.clone() as Calendar).apply { if (schedule.endMinute <= schedule.startMinute) add(Calendar.DATE, 1); set(Calendar.HOUR_OF_DAY, schedule.endMinute / 60); set(Calendar.MINUTE, schedule.endMinute % 60) }.timeInMillis
      if (start < schedule.createdAt || end <= start || end - start > 720 * 60000L) null else Occurrence(schedule, start, end)
    }.sortedBy { it.startedAt }
  }
  fun frozen(schedule: Schedule, now: Long): Boolean = occurrences(schedule, now).firstOrNull { it.endsAt > now }?.let { now >= it.startedAt - 3600000 && now < it.endsAt } ?: false
}
