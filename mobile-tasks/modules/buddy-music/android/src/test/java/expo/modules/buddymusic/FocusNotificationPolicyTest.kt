package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusNotificationPolicyTest {
  @Test fun runningFocusIsSilent() { assertTrue(FocusNotificationPolicy.silence("id", 200, false, 0, 100)) }
  @Test fun emptyAndExpiredSessionsAreNotSilent() {
    assertFalse(FocusNotificationPolicy.silence("", 200, false, 0, 100))
    assertFalse(FocusNotificationPolicy.silence("id", 100, false, 0, 100))
  }
  @Test fun timedBreakReleasesThenResumedFocusSilences() {
    assertFalse(FocusNotificationPolicy.silence("id", 200, true, 150, 100))
    assertTrue(FocusNotificationPolicy.silence("id", 250, false, 0, 150))
  }
  @Test fun legacyRestrictedPauseStaysSilent() { assertTrue(FocusNotificationPolicy.silence("id", 200, true, 0, 100)) }
}
