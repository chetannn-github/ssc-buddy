package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusAdminPolicyTest {
  @Test fun grantDuringSetupIsRetainedUntilItHasProtectedASession() {
    assertFalse(FocusAdminPolicy.release(false, ""))
    assertFalse(FocusAdminPolicy.release(true, "lock"))
    assertTrue(FocusAdminPolicy.release(false, "lock"))
  }
  @Test fun breakRetainsAdminAndSettingsBlockButReleasesOrdinaryApps() {
    val now = 100L
    val end = 200L
    val normalDeadline = FocusBreakPolicy.restrictionDeadline(now, end, true, 150, true)
    val settingsDeadline = FocusAdminPolicy.settingsDeadline("lock", true, end, now)
    assertFalse(FocusAdminPolicy.release(FocusAppPolicy.lockActive("lock", true, end, now), "lock"))
    assertFalse(FocusAppPolicy.blocks("social", now, normalDeadline, emptySet(), emptySet()))
    assertTrue(FocusAppPolicy.blocks("com.android.settings", now, settingsDeadline, emptySet(), emptySet()))
    assertTrue(FocusSettingsGuard().shouldReturn("com.android.settings", now, settingsDeadline, false, setOf("com.android.settings")))
  }
  @Test fun breakOutlastingOldFocusDeadlineStillBlocksSettingsUntilResumedEnd() {
    assertEquals(Long.MAX_VALUE, FocusAdminPolicy.settingsDeadline("lock", true, 100, 150))
    assertEquals(250L, FocusAdminPolicy.settingsDeadline("lock", false, 250, 150))
    assertEquals(0L, FocusAdminPolicy.settingsDeadline("lock", false, 250, 250))
    assertTrue(FocusAdminPolicy.release(false, "lock"))
  }
  @Test fun settingsAccessibleWithoutSessionAndAfterExpiryAndIncomingCallsRemainAllowed() {
    assertEquals(0L, FocusAdminPolicy.settingsDeadline("", true, 200, 100))
    assertEquals(0L, FocusAdminPolicy.settingsDeadline("lock", false, 100, 100))
    assertFalse(FocusAppPolicy.blocks("com.android.settings", 100, Long.MAX_VALUE, emptySet(), emptySet(), ringing = true))
    assertFalse(FocusSettingsGuard().shouldReturn("com.android.settings", 100, Long.MAX_VALUE, true, setOf("com.android.settings")))
  }
}
