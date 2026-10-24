package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusCompletionPolicyTest {
  private fun session(start: Long = 100, end: Long = 1100, paused: Boolean = false, pausedAt: Long = start, id: String = "lock") = FocusCompletionPolicy.Session(id, start, end, paused, pausedAt)
  @Test fun firstSeenExpiredSessionDoesNotCelebrateButObservedRunExpiresExactlyOnce() {
    val expired = session()
    val cold = FocusCompletionPolicy.advance(null, expired, 1500)
    assertNull(cold.completed)
    assertNull(FocusCompletionPolicy.advance(cold.state, expired, 1600).completed)
    val active = FocusCompletionPolicy.advance(null, expired, 200)
    assertNull(active.completed)
    val complete = FocusCompletionPolicy.advance(active.state, expired, 1100)
    assertEquals("lock" to 1000L, complete.completed)
    assertNull(complete.state)
    assertNull(FocusCompletionPolicy.advance(complete.state, expired, 1200).completed)
  }
  @Test fun stableTicksAndImageSyncDoNotChangeTheLifecycleJournal() {
    val state = FocusCompletionPolicy.advance(null, session(), 200).state
    for (now in 201L..1099L) assertEquals(state, FocusCompletionPolicy.advance(state, session(), now).state)
  }
  @Test fun breaksExcludedRepeatedPausePacketsAndAutoResumeDoNotDoubleCount() {
    val initial = session(end = 4100)
    var state = FocusCompletionPolicy.advance(null, initial, 100).state
    val pause = session(end = 4100, paused = true, pausedAt = 1100)
    state = FocusCompletionPolicy.advance(state, pause, 1100).state
    assertNull(FocusCompletionPolicy.advance(state, pause, 10_000).completed)
    assertEquals(state, FocusCompletionPolicy.advance(state, pause, 10_000).state)
    val resumed = session(start = 11_100, end = 14_100)
    state = FocusCompletionPolicy.advance(state, resumed, 11_100).state
    val end = FocusCompletionPolicy.advance(state, resumed, 20_000)
    assertEquals("lock" to 4000L, end.completed)
  }
  @Test fun clearingExpiredControlStillCelebratesButAccountClearMidRunDoesNot() {
    val state = FocusCompletionPolicy.advance(null, session(), 200).state
    assertEquals("lock" to 1000L, FocusCompletionPolicy.advance(state, null, 1200).completed)
    assertNull(FocusCompletionPolicy.advance(state, null, 500).completed)
  }
  @Test fun aNewSessionDoesNotInheritPreviousTimeAndOldCompletionDoesNotExtendRestrictions() {
    val state = FocusCompletionPolicy.advance(null, session(), 200).state
    val result = FocusCompletionPolicy.advance(state, session(start = 1200, end = 2200, id = "new"), 1200)
    assertEquals("lock" to 1000L, result.completed)
    assertTrue(result.state!!.parts.isEmpty())
    assertFalse(FocusAppPolicy.blocks("home", 1200, 1100, emptySet(), emptySet()))
    assertEquals("new" to 1000L, FocusCompletionPolicy.advance(result.state, result.state.session, 2200).completed)
  }
  @Test fun nativeRecreationAndSeveralBreaksRetainOnlyActualFocusSegments() {
    var state = FocusCompletionPolicy.advance(null, session(end = 4100), 100).state
    state = FocusCompletionPolicy.advance(state, session(end = 4100, paused = true, pausedAt = 1100), 1100).state
    state = FocusCompletionPolicy.advance(state, session(start = 2100, end = 5100), 2100).state
    state = FocusCompletionPolicy.advance(state, session(start = 2100, end = 5100, paused = true, pausedAt = 3100), 3100).state
    state = FocusCompletionPolicy.advance(state, session(start = 4100, end = 6100), 4100).state
    assertEquals("lock" to 4000L, FocusCompletionPolicy.advance(state, session(start = 4100, end = 6100), 6100).completed)
  }
  @Test fun durationUsesHoursWholeMinutesAndSecondsWithoutDecimalMinutes() {
    assertEquals("4h", FocusCompletionPolicy.duration(4 * 60 * 60 * 1000L))
    assertEquals("1h 5m", FocusCompletionPolicy.duration(65 * 60000L))
    assertEquals("59m", FocusCompletionPolicy.duration(59 * 60000L + 59000))
    assertEquals("25s", FocusCompletionPolicy.duration(25000))
  }
}
