package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusSettingsGuardTest {
  @Test fun onlySettingsCanAutomaticallyOpenBuddyWhileOtherUnauthorizedAppsUseOverlay() {
    val guard = FocusSettingsGuard()
    val settings = FocusSettingsGuard.packages(listOf("vendor.settings"))
    for (target in listOf("social.app", "home", "study", "buddy", "phone", "com.android.systemui", "com.android.permissioncontroller", "")) {
      assertFalse(guard.shouldReturn(target, 10, 20, false, settings))
    }
    assertTrue(guard.shouldReturn("com.android.settings", 10, 20, false, settings))
    assertTrue(guard.shouldReturn("vendor.settings", 11, 20, false, settings))
  }
  @Test fun settingsReturnIsThrottledAndDisabledDuringBreakExpiryAndCalls() {
    val guard = FocusSettingsGuard()
    val settings = FocusSettingsGuard.packages(emptyList())
    assertTrue(guard.shouldReturn("com.android.settings", 100, 20_000, false, settings))
    assertFalse(guard.shouldReturn("com.android.settings", 500, 20_000, false, settings))
    assertTrue(guard.shouldReturn("com.android.settings", 2100, 20_000, false, settings))
    assertFalse(guard.shouldReturn("com.android.settings", 2200, 0, false, settings))
    assertFalse(guard.shouldReturn("com.android.settings", 2200, 2200, false, settings))
    assertFalse(guard.shouldReturn("com.android.settings", 2200, 20_000, true, settings))
    assertTrue(guard.shouldReturn("com.android.settings", 2300, 20_000, false, settings))
  }
  @Test fun settingsAndVendorSettingsUseTheSameOverlayBlockAsOtherUnauthorizedApps() {
    val settings = FocusSettingsGuard.packages(listOf("vendor.settings"))
    for (target in listOf("com.android.settings", "vendor.settings", "social.app", "home")) {
      assertTrue(FocusAppPolicy.blocks(target, 10, 20, setOf("buddy", "phone"), setOf("study"), settingsPackages = settings))
    }
    assertFalse(FocusAppPolicy.blocks("study", 10, 20, setOf("buddy"), setOf("study"), settingsPackages = settings))
  }
  @Test fun systemUiAndPermissionDialogsAreNotMisclassifiedAsSettings() {
    assertEquals(setOf("com.android.settings", "vendor.settings"), FocusSettingsGuard.packages(listOf("vendor.settings", "android", "com.android.systemui", "com.android.permissioncontroller", "com.google.android.permissioncontroller", "")))
  }
  @Test fun breakExpiryAndCallsReleaseSettingsOverlay() {
    val settings = FocusSettingsGuard.packages(emptyList())
    assertFalse(FocusAppPolicy.blocks("com.android.settings", 10, 0, emptySet(), emptySet(), settingsPackages = settings))
    assertFalse(FocusAppPolicy.blocks("com.android.settings", 20, 20, emptySet(), emptySet(), settingsPackages = settings))
    assertFalse(FocusAppPolicy.blocks("com.android.settings", 10, 20, emptySet(), emptySet(), ringing = true, settingsPackages = settings))
  }
}
