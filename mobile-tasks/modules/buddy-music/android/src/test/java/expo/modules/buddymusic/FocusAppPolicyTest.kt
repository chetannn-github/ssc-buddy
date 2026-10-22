package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusAppPolicyTest {
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
