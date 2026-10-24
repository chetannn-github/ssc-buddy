package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusForegroundTrackerTest {
  @Test fun delayedSettingsResumeIsNotLostBehindThePreviousAppsLaterPause() {
    val tracker = FocusForegroundTracker()
    tracker.event("allowed", 1, 100)
    tracker.event("com.android.systemui", 1, 200)
    tracker.event("com.android.systemui", 2, 400)
    assertEquals("", tracker.current)
    // A later overlapping query exposes the Settings resume from timestamp 300.
    assertTrue(tracker.event("com.android.settings", 1, 300))
    tracker.event("com.android.systemui", 2, 400)
    assertEquals("com.android.settings", tracker.current)
    assertTrue(FocusSettingsGuard().shouldReturn(tracker.current, 500, 2_000, false, setOf("com.android.settings")))
  }
  @Test fun replayCannotResurrectAnEndedSettingsActivityOrOneOlderThanTheActualAllowedApp() {
    val tracker = FocusForegroundTracker()
    tracker.event("com.android.settings", 1, 100)
    tracker.event("com.android.settings", 2, 300)
    assertFalse(tracker.event("com.android.settings", 1, 200))
    tracker.event("allowed", 1, 400)
    assertFalse(tracker.event("com.android.settings", 1, 350))
    tracker.event("com.android.settings", 23, 500)
    assertEquals("allowed", tracker.current)
  }
  @Test fun delayedScreenLockDoesNotClearANewerResumedAppButRejectsOlderReplay() {
    val tracker = FocusForegroundTracker()
    tracker.event("allowed", 1, 400)
    tracker.event("", 17, 300)
    assertEquals("allowed", tracker.current)
    tracker.event("", 16, 500)
    assertFalse(tracker.event("com.android.settings", 1, 450))
    assertEquals("", tracker.current)
    assertTrue(tracker.event("allowed", 1, 600))
  }
  @Test fun delayedResumeIsRecoveredByTheNextOverlappingScan() {
    val tracker = FocusForegroundTracker()
    val firstScan = 100_000L
    tracker.event("buddy", 1, firstScan - 100)
    // The first query completed before Android exposed this app switch.
    val delayedEventAt = firstScan - 20
    val secondScan = firstScan + 400
    assertTrue(delayedEventAt >= FocusForegroundTracker.queryStart(firstScan, secondScan))
    tracker.event("buddy", 2, delayedEventAt - 1)
    tracker.event("blocked", 1, delayedEventAt)
    assertEquals("blocked", tracker.current)
    // Replaying old foreground events cannot bounce an allowed app to a block.
    tracker.event("allowed", 1, secondScan)
    tracker.event("blocked", 1, delayedEventAt)
    assertEquals("allowed", tracker.current)
  }
  @Test fun nonActivityEventsCannotSwallowDelayedForegroundTransitions() {
    val tracker = FocusForegroundTracker()
    tracker.event("buddy", 1, 100)
    for (type in listOf(7, 11, 19, 20)) assertFalse(tracker.event("notifications", type, 200))
    assertTrue(tracker.event("blocked", 1, 150))
    assertEquals("blocked", tracker.current)
  }
  @Test fun queryWindowIsBoundedAndClockRollbackCanRecover() {
    val tracker = FocusForegroundTracker()
    assertEquals(40_000L, FocusForegroundTracker.queryStart(100_000, 100_400))
    assertEquals(0L, FocusForegroundTracker.queryStart(0, 100_400))
    tracker.event("old", 1, 200)
    tracker.reset()
    tracker.event("new", 1, 100)
    assertEquals("new", tracker.current)
  }
  @Test fun switchesBetweenBlockedAllowedAndOwnApp() {
    val tracker = FocusForegroundTracker()
    tracker.event("social", 1, 100)
    assertEquals("social", tracker.current)
    tracker.event("social", 2, 101)
    tracker.event("allowed", 1, 102)
    assertEquals("allowed", tracker.current)
    tracker.event("com.sscbuddy.tasks", 1, 103)
    assertEquals("com.sscbuddy.tasks", tracker.current)
  }
  @Test fun delayedPauseFromPreviousAppCannotClearNewApp() {
    val tracker = FocusForegroundTracker()
    tracker.event("old", 1, 100)
    tracker.event("new", 1, 101)
    tracker.event("old", 2, 102)
    assertEquals("new", tracker.current)
    tracker.event("old", 1, 99)
    assertEquals("new", tracker.current)
    tracker.event("new", 23, 103)
    assertEquals("", tracker.current)
  }
  @Test fun screenOffClearsForegroundAndUnlockResumesFresh() {
    val tracker = FocusForegroundTracker()
    tracker.event("social", 1, 100)
    tracker.event("", 16, 101)
    assertEquals("", tracker.current)
    tracker.event("allowed", 1, 102)
    assertEquals("allowed", tracker.current)
  }
  @Test fun repeatedQueryBoundaryEventsAreIdempotent() {
    val tracker = FocusForegroundTracker()
    repeat(4) { tracker.event("allowed", 1, 100) }
    assertEquals("allowed", tracker.current)
    repeat(4) { tracker.event("allowed", 2, 101) }
    assertEquals("", tracker.current)
  }
}
