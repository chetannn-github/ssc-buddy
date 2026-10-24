package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusAppPolicyTest {
  @Test fun settingsFromNotificationShadeBlocksDuringFocusEvenWithLegacyExemptions() {
    val settings = "com.android.settings"
    val essentials = setOf("buddy", "com.android.systemui", settings)
    val allowed = setOf("study", settings)
    assertTrue(FocusAppPolicy.blocks(settings, 10, 20, essentials, allowed))
    assertFalse(FocusAppPolicy.blocks("study", 10, 20, essentials, allowed))
    assertFalse(FocusAppPolicy.blocks(settings, 20, 20, essentials, allowed))
    assertFalse(FocusAppPolicy.blocks(settings, 10, 0, essentials, allowed)) // Timed break.
    assertFalse(FocusAppPolicy.blocks(settings, 10, 20, essentials, allowed, ringing = true))
  }
  @Test fun settingsCannotBeSelectedAndOemSettingsUseTheResolvedPackage() {
    val allowed = setOf("study")
    assertEquals(allowed, FocusAppPolicy.allow("com.android.settings", 10, 20, allowed))
    val packages = setOf("com.android.settings", "vendor.settings")
    assertEquals(allowed, FocusAppPolicy.allow("vendor.settings", 10, 20, allowed, settingsPackages = packages))
    assertTrue(FocusAppPolicy.blocks("vendor.settings", 10, 20, setOf("vendor.settings"), emptySet(), settingsPackages = packages))
    assertFalse(FocusAppPolicy.isSettings("com.android.permissioncontroller", packages))
    assertFalse(FocusAppPolicy.blocks("com.android.permissioncontroller", 10, 20, setOf("com.android.permissioncontroller"), allowed))
    assertFalse(FocusAppPolicy.blocks("phone", 10, 20, setOf("phone"), allowed))
  }
  @Test fun selectedAppLimitSupportsZeroOneAndTwo() {
    assertTrue(FocusAppPolicy.allow("study", 10, 20, emptySet(), 0).isEmpty())
    val first = FocusAppPolicy.allow("study", 10, 20, emptySet(), 1)
    assertEquals(setOf("study"), first)
    assertEquals(first, FocusAppPolicy.allow("calculator", 10, 20, first, 1))
    assertEquals(setOf("study", "calculator"), FocusAppPolicy.allow("calculator", 10, 20, first, 2))
    assertEquals(0, FocusAppPolicy.appLimit(-1))
    assertEquals(2, FocusAppPolicy.appLimit(10))
    assertFalse(FocusAppPolicy.blocks("phone", 10, 20, setOf("phone", "buddy"), emptySet()))
    assertTrue(FocusAppPolicy.blocks("study", 10, 20, setOf("phone", "buddy"), emptySet()))
  }
  @Test fun incomingCallCanBeAnsweredAndOtherAppsBlockAgainWhenRingingStops() {
    val essentials = setOf("phone", "incallui")
    assertFalse(FocusAppPolicy.blocks("social.app", 10, 20, essentials, emptySet(), ringing = true))
    assertFalse(FocusAppPolicy.blocks("incallui", 10, 20, essentials, emptySet()))
    assertTrue(FocusAppPolicy.blocks("social.app", 10, 20, essentials, emptySet()))
  }
  @Test fun savedDeadlineRestoresOfflineAndAfterRestartWithoutRestartingTimer() {
    val savedDeadline = 60_000L
    assertTrue(FocusAppPolicy.lockActive("saved", false, savedDeadline, 20_000))
    assertTrue(FocusAppPolicy.lockActive("saved", false, savedDeadline, 59_999))
    assertFalse(FocusAppPolicy.lockActive("saved", false, savedDeadline, 60_000))
    assertFalse(FocusAppPolicy.lockActive("saved", false, savedDeadline, 90_000))
    assertTrue(FocusAppPolicy.lockActive("saved", true, savedDeadline, 90_000))
    assertFalse(FocusAppPolicy.lockActive("", true, savedDeadline, 90_000))
  }
  @Test fun blocksOtherAppsOnlyDuringSession() {
    assertTrue(FocusAppPolicy.blocks("video", 10, 20, setOf("phone", "contacts"), emptySet()))
    assertFalse(FocusAppPolicy.blocks("video", 20, 20, emptySet(), emptySet()))
    assertFalse(FocusAppPolicy.blocks("", 10, 20, emptySet(), emptySet()))
  }
  @Test fun phoneAndContactsNeverConsumeAllowSlots() {
    val allowed = setOf("study", "calculator")
    for (app in setOf("phone", "contacts")) assertFalse(FocusAppPolicy.blocks(app, 10, 20, setOf("phone", "contacts"), allowed))
    assertFalse(FocusAppPolicy.blocks("study", 10, 20, emptySet(), allowed))
  }
  @Test fun thirdAppCannotBeAdded() {
    val first = FocusAppPolicy.allow("study", 10, 20, emptySet())
    val second = FocusAppPolicy.allow("calculator", 10, 20, first)
    assertEquals(2, second.size)
    assertEquals(second, FocusAppPolicy.allow("video", 10, 20, second))
    assertEquals(second, FocusAppPolicy.allow("study", 10, 20, second))
    assertTrue(FocusAppPolicy.allow("video", 20, 20, emptySet()).isEmpty())
  }
  @Test fun homeAndUnselectedAppsAreCoveredWhileSystemEssentialsRemainAvailable() {
    val essentials = setOf("com.android.systemui", "phone", "contacts")
    val allowed = setOf("study", "calculator")
    assertFalse(FocusAppPolicy.blocks("com.android.systemui", 10, 20, essentials, allowed))
    assertTrue(FocusAppPolicy.blocks("home.launcher", 10, 20, essentials, allowed))
    assertTrue(FocusAppPolicy.blocks("social.app", 10, 20, essentials, allowed))
    assertEquals(2, allowed.size)
  }
  @Test fun appRestartKeepsSlotsButNewSessionResetsThem() {
    assertEquals(setOf("study"), FocusAppPolicy.forSession("session", "session", setOf("study")))
    assertTrue(FocusAppPolicy.forSession("session", "next", setOf("study")).isEmpty())
  }
}
