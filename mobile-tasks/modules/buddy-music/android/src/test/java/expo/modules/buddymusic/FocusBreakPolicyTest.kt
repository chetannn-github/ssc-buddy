package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusBreakPolicyTest {
  @Test fun breaksRequireThirtyMinutesAndAvailableSlots() {
    val start = 1_000L
    val end = start + 120 * 60000L
    assertFalse(FocusBreakPolicy.canBreak(start + 30 * 60000 - 1, start, end, 3, 0))
    assertTrue(FocusBreakPolicy.canBreak(start + 30 * 60000, start, end, 3, 0))
    assertTrue(FocusBreakPolicy.canBreak(start + 60 * 60000, start, end, 3, 0))
    assertFalse(FocusBreakPolicy.canBreak(start + 60 * 60000, start, end, 3, 3))
    assertFalse(FocusBreakPolicy.canBreak(end, start, end, 3, 0))
    assertEquals(600000L, FocusBreakPolicy.DURATION_MS)
  }
  @Test fun nextBreakWaitsFromActualResumeDeadline() {
    val resumed = 40 * 60000L
    val end = 130 * 60000L
    assertFalse(FocusBreakPolicy.canBreak(60 * 60000, resumed, end, 3, 1))
    assertTrue(FocusBreakPolicy.canBreak(70 * 60000, resumed, end, 3, 1))
  }
  @Test fun everyAppUnlocksDuringTimedBreakButRestrictionsReturnAtDeadline() {
    val until = 40 * 60000L
    val deadline = FocusBreakPolicy.restrictionDeadline(until - 1, 120 * 60000L, true, until, true)
    assertFalse(FocusAppPolicy.blocks("social.app", until - 1, deadline, emptySet(), emptySet()))
    val expired = FocusBreakPolicy.restrictionDeadline(until, 120 * 60000L, true, until, true)
    assertTrue(FocusAppPolicy.blocks("social.app", until, expired, emptySet(), emptySet()))
    assertEquals(130 * 60000L, FocusBreakPolicy.restrictionDeadline(until, 130 * 60000L, false, 0, true))
  }
}
