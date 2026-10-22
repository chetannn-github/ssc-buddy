package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusAppPolicyTest {
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
  @Test fun appRestartKeepsSlotsButNewSessionResetsThem() {
    assertEquals(setOf("study"), FocusAppPolicy.forSession("session", "session", setOf("study")))
    assertTrue(FocusAppPolicy.forSession("session", "next", setOf("study")).isEmpty())
  }
}
