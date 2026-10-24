package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusSettingsGuardTest {
  private val settings = setOf("com.android.settings", "vendor.settings")

  @Test fun notificationShadeToSettingsFromAnAllowedAppTriggersReturn() {
    val guard = FocusSettingsGuard()
    val tracker = FocusForegroundTracker()
    tracker.event("allowed", 1, 100)
    assertFalse(guard.shouldReturn(tracker.current, 100, 20_000, false, settings))
    tracker.event("com.android.systemui", 1, 200)
    assertFalse(guard.shouldReturn(tracker.current, 200, 20_000, false, settings))
    tracker.event("com.android.settings", 1, 300)
    assertTrue(guard.shouldReturn(tracker.current, 300, 20_000, false, settings))
    tracker.event("buddy", 1, 400)
    assertFalse(guard.shouldReturn(tracker.current, 400, 20_000, false, settings))
    tracker.event("allowed", 1, 500)
    assertFalse(guard.shouldReturn(tracker.current, 500, 20_000, false, settings))
  }

  @Test fun noPeriodicReturnForAnyNonSettingsAppAcrossManyMinutes() {
    val guard = FocusSettingsGuard()
    for (target in listOf("allowed", "com.google.android.apps.nbu.paisa.user", "buddy", "phone", "com.android.systemui", "com.android.permissioncontroller", "")) {
      for (now in 1L..600_000L step 400L) assertFalse(guard.shouldReturn(target, now, 900_000, false, settings))
    }
  }

  @Test fun retriesAreThrottledWithoutInventingAnOwnAppForegroundEvent() {
    val guard = FocusSettingsGuard()
    assertTrue(guard.shouldReturn("com.android.settings", 100, 20_000, false, settings))
    assertFalse(guard.shouldReturn("com.android.settings", 500, 20_000, false, settings))
    assertFalse(guard.shouldReturn("com.android.settings", 2_099, 20_000, false, settings))
    assertTrue(guard.shouldReturn("com.android.settings", 2_100, 20_000, false, settings))
    assertFalse(guard.shouldReturn("allowed", 2_200, 20_000, false, settings))
    assertTrue(guard.shouldReturn("com.android.settings", 2_300, 20_000, false, settings))
  }

  @Test fun breakExpiryAndCallsStayAvailableAndRestrictionsResumeAfterThem() {
    val guard = FocusSettingsGuard()
    assertFalse(guard.shouldReturn("com.android.settings", 10, 0, false, settings)) // Timed break.
    assertFalse(guard.shouldReturn("com.android.settings", 20, 20, false, settings)) // Expiry.
    assertFalse(guard.shouldReturn("com.android.settings", 10, 20, true, settings)) // Ringing.
    assertTrue(guard.shouldReturn("com.android.settings", 10, 20, false, settings))
  }

  @Test fun resolvesVendorSettingsWithoutBlockingSystemUiOrPermissionDialogs() {
    val resolved = FocusSettingsGuard.packages(listOf("vendor.settings", "android", "com.android.systemui", "com.android.permissioncontroller", "com.google.android.permissioncontroller", ""))
    assertEquals(settings, resolved)
    assertTrue(FocusSettingsGuard().shouldReturn("vendor.settings", 10, 20, false, resolved))
  }

  @Test fun clockRollbackDoesNotSuppressASettingsReturn() {
    val guard = FocusSettingsGuard()
    assertTrue(guard.shouldReturn("com.android.settings", 100, 20_000, false, settings))
    assertTrue(guard.shouldReturn("com.android.settings", 50, 20_000, false, settings))
  }
}
