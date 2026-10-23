package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusForegroundTrackerTest {
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
