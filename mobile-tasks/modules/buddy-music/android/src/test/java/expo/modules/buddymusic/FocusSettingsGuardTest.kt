package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusSettingsGuardTest {
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
