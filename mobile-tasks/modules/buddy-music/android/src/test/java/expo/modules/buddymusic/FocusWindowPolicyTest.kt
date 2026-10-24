package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusWindowPolicyTest {
  @Test fun appToHomeTransitionKeepsExistingCoverUntilTheNextForegroundIsKnown() {
    assertTrue(FocusWindowPolicy.retainDuringTransition(true, "", true, true))
    assertTrue(FocusWindowPolicy.retainDuringTransition(true, "com.android.systemui", true, true))
    assertFalse(FocusWindowPolicy.retainDuringTransition(false, "", true, true)) // Never summon over an allowed app.
    assertFalse(FocusWindowPolicy.retainDuringTransition(true, "study", true, true)) // Confirmed allowed app can hide.
    assertFalse(FocusWindowPolicy.retainDuringTransition(true, "", false, true)) // Break/expiry/call.
    assertFalse(FocusWindowPolicy.retainDuringTransition(true, "", true, false)) // Screen off/keyguard.
    assertEquals(150L, FocusWindowPolicy.pollDelay("", false))
    assertEquals(150L, FocusWindowPolicy.pollDelay("home", true))
    assertEquals(250L, FocusWindowPolicy.pollDelay("study", false))
  }
  @Test fun shadeThenSettingsCannotRetainThePreviouslyAllowedApp() {
    val study = "study"
    val shade = FocusWindowPolicy.foreground(study, "com.android.systemui", "buddy", false, false)
    assertEquals(study, shade)
    val settings = FocusWindowPolicy.foreground(shade, "com.android.settings", "buddy", false, false, fullScreenSettings = true)
    assertEquals("com.android.settings", settings)
    assertTrue(FocusWindowPolicy.mayShow(FocusAppPolicy.blocks(settings, 10, 20, setOf("buddy"), setOf(study)), true, false))
    assertEquals(study, FocusWindowPolicy.foreground(settings, study, "buddy", true, true))
    assertEquals(study, FocusWindowPolicy.foreground(study, "background.app", "buddy", false, false))
  }
  @Test fun refreshAndBackgroundDialogCannotReplaceTheAllowedForegroundApp() {
    for (allowed in listOf("pdf.reader", "com.android.chrome", "com.openai.chatgpt", "com.google.android.youtube")) {
      var foreground = allowed
      for (minute in 1..120) {
        for (target in listOf("background.app", "com.google.android.gms", "com.android.systemui", "")) {
          foreground = FocusWindowPolicy.foreground(foreground, target, "buddy", false, false)
          assertEquals(allowed, foreground)
        }
        assertFalse(FocusWindowPolicy.mayShow(false, false, false))
        assertFalse(FocusWindowPolicy.mayShow(true, false, false))
      }
    }
  }
  @Test fun realBlockedAppStillShowsAndSwitchingBackToAllowedHides() {
    val allowed = setOf("study")
    val blocked = FocusWindowPolicy.foreground("study", "social", "buddy", false, true)
    assertEquals("social", blocked)
    assertTrue(FocusWindowPolicy.mayShow(FocusAppPolicy.blocks(blocked, 10, 20, setOf("buddy"), allowed), true, false))
    val returned = FocusWindowPolicy.foreground(blocked, "study", "buddy", true, true)
    assertEquals("study", returned)
    assertFalse(FocusAppPolicy.blocks(returned, 10, 20, setOf("buddy"), allowed))
  }
  @Test fun ownOverlayEventsCannotBecomeAnotherAppSwitch() {
    assertEquals("social", FocusWindowPolicy.foreground("social", "buddy", "buddy", true, true))
    assertEquals("social", FocusWindowPolicy.foreground("social", "social", "buddy", true, true))
    assertEquals("buddy", FocusWindowPolicy.foreground("study", "buddy", "buddy", false, true))
  }
  @Test fun newSessionAndBreakExpiryCanCoverAnAlreadyOpenBlockedApp() {
    assertTrue(FocusWindowPolicy.mayShow(true, false, true))
    assertFalse(FocusWindowPolicy.mayShow(false, false, true))
    assertFalse(FocusWindowPolicy.mayShow(true, false, false))
  }
}
