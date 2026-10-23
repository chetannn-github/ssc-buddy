package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class FocusSchedulePolicyTest {
  private fun at(value: String) = Instant.parse(value).toEpochMilli()
  private fun sleep() = FocusSchedulePolicy.Schedule("sleep", "Sleep", setOf(1,3,5), 1320, 360, "Asia/Kolkata", 0, 0)
  @Test fun overnightStartDayAndFreezeBoundaries() {
    val start = at("2026-10-19T16:30:00Z")
    val end = at("2026-10-20T00:30:00Z")
    val window = FocusSchedulePolicy.occurrences(sleep(), start).first { it.startedAt == start }
    assertEquals(end, window.endsAt); assertEquals("schedule-sleep-$start", window.id)
    assertFalse(FocusSchedulePolicy.frozen(sleep(), start - 3600001))
    assertTrue(FocusSchedulePolicy.frozen(sleep(), start - 3600000))
    assertTrue(FocusSchedulePolicy.frozen(sleep(), end - 1))
    assertFalse(FocusSchedulePolicy.frozen(sleep(), end))
  }
  @Test fun selectedWeekdaysAndDisable() {
    val tuesday = at("2026-10-20T12:00:00Z")
    assertFalse(FocusSchedulePolicy.occurrences(sleep(), tuesday).any { it.startedAt <= tuesday && it.endsAt > tuesday })
    assertTrue(FocusSchedulePolicy.occurrences(sleep().copy(enabled = false), tuesday).isEmpty())
  }
  @Test fun createdPastStartsAreNotReplayed() {
    val late = at("2026-10-19T18:30:00Z")
    assertTrue(FocusSchedulePolicy.occurrences(sleep().copy(createdAt = late), late).all { it.startedAt > late })
  }
  @Test fun daylightSavingMatchesSharedJavascriptPolicy() {
    val schedule = sleep().copy(weekdays = setOf(0), timeZone = "America/New_York", startMinute = 150, endMinute = 240)
    val spring = FocusSchedulePolicy.occurrences(schedule, at("2026-03-08T05:00:00Z")).first { it.endsAt > at("2026-03-08T05:00:00Z") }
    assertEquals(at("2026-03-08T07:30:00Z"), spring.startedAt)
    val fall = FocusSchedulePolicy.occurrences(schedule.copy(startMinute = 90, endMinute = 150), at("2026-11-01T04:00:00Z")).first { it.endsAt > at("2026-11-01T04:00:00Z") }
    assertEquals(at("2026-11-01T06:30:00Z"), fall.startedAt)
  }
}
