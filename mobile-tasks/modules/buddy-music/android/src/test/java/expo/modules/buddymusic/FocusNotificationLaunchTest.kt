package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusNotificationLaunchTest {
  private val phonepe = "com.phonepe.app"
  private val settings = setOf("com.android.settings")

  @Test fun notificationShadeToUnselectedPhonePeUsesActivityFallback() {
    val tracker = FocusForegroundTracker()
    tracker.event("study", 1, 100)
    tracker.event("com.android.systemui", 1, 200)
    tracker.event(phonepe, 1, 300)
    tracker.event("com.android.systemui", 2, 301)
    assertEquals(phonepe, tracker.current)
    val blocked = FocusAppPolicy.blocks(tracker.current, 400, 10_000, setOf("buddy"), setOf("study"))
    assertTrue(blocked)
    val fallback = FocusSettingsGuard.needsActivityReturn(tracker.current, blocked, false)
    assertTrue(FocusSettingsGuard().shouldReturn(tracker.current, 400, 10_000, false, settings, fallback))
  }

  @Test fun selectedPhonePeIsAllowedEvenWhenItHidesOverlays() {
    val blocked = FocusAppPolicy.blocks(phonepe, 400, 10_000, emptySet(), setOf(phonepe))
    assertFalse(blocked)
    assertFalse(FocusSettingsGuard.needsActivityReturn(phonepe, blocked, true))
    assertFalse(FocusSettingsGuard().shouldReturn(phonepe, 400, 10_000, false, settings, false))
  }

  @Test fun paymentCatalogAndIncidentalDialHandlersNeverGrantImplicitAccess() {
    for (payment in FocusPaymentPolicy.packages) {
      assertTrue(FocusAppPolicy.blocks(payment, 10, 20, setOf(payment, "phone"), emptySet()))
      assertTrue(FocusSettingsGuard.needsActivityReturn(payment, true, false))
      assertFalse(FocusAppPolicy.blocks(payment, 10, 20, setOf(payment), setOf(payment)))
    }
    assertFalse(FocusAppPolicy.blocks("phone", 10, 20, setOf("phone"), emptySet()))
  }

  @Test fun ordinaryBlockedAppsKeepOverlayAndSensitiveOnesUseFallback() {
    assertFalse(FocusSettingsGuard.needsActivityReturn("social", true, false))
    assertTrue(FocusSettingsGuard.needsActivityReturn("bank", true, true))
    assertFalse(FocusSettingsGuard.needsActivityReturn("study", false, true))
  }

  @Test fun fallbackIsThrottledAndBreakEndAndCallsRemainAllowed() {
    val guard = FocusSettingsGuard()
    assertTrue(guard.shouldReturn(phonepe, 100, 10_000, false, settings, true))
    assertFalse(guard.shouldReturn(phonepe, 101, 10_000, false, settings, true))
    assertTrue(guard.shouldReturn(phonepe, 2100, 10_000, false, settings, true))
    for ((now, end, ringing) in listOf(Triple(10L, 0L, false), Triple(20L, 20L, false), Triple(10L, 20L, true))) {
      val blocked = FocusAppPolicy.blocks(phonepe, now, end, emptySet(), emptySet(), ringing)
      assertFalse(blocked)
      assertFalse(guard.shouldReturn(phonepe, now, end, ringing, settings,
        FocusSettingsGuard.needsActivityReturn(phonepe, blocked, true)))
    }
  }

  @Test fun notificationArrivalAloneDoesNotOpenOrBlockAnAllowedApp() {
    val tracker = FocusForegroundTracker()
    tracker.event("study", 1, 100)
    tracker.event(phonepe, 7, 200)
    assertEquals("study", tracker.current)
    assertFalse(FocusAppPolicy.blocks(tracker.current, 300, 1000, emptySet(), setOf("study")))
  }
}
