package expo.modules.buddymusic

import org.junit.Assert.*
import org.junit.Test

class FocusPaymentPolicyTest {
  private val gpay = "com.google.android.apps.nbu.paisa.user"
  private val phonepe = "com.phonepe.app"
  private val paytm = "net.one97.paytm"

  @Test fun eachCatalogAppIncludingNaviAndKiwiCanBeSelectedAndLaunchedWithoutLiftingOtherRestrictions() {
    assertTrue("Navi must be recognized", "com.naviapp" in FocusPaymentPolicy.packages)
    assertTrue("Kiwi must be recognized", "in.gokiwi.kiwitpap" in FocusPaymentPolicy.packages)
    for (target in FocusPaymentPolicy.packages) {
      val selection = FocusPaymentPolicy.allow(target, 10, 20, emptySet())
      assertEquals(setOf(target), selection)
      assertFalse(FocusAppPolicy.blocks(target, 10, 20, emptySet(), selection))
      assertTrue(FocusAppPolicy.blocks("social.app", 10, 20, emptySet(), selection))
      assertEquals(selection, FocusPaymentPolicy.forSession("lock", "lock", emptySet(), selection).payments)
    }
  }

  @Test fun paymentSlotsAreIndependentOfZeroOneOrTwoRegularSlots() {
    val first = FocusPaymentPolicy.allow(gpay, 10, 20, emptySet())
    val payments = FocusPaymentPolicy.allow(phonepe, 10, 20, first)
    assertEquals(setOf(gpay), payments)
    for (limit in 0..2) {
      var apps = emptySet<String>()
      for (i in 1..limit) apps = FocusAppPolicy.allow("study.$i", 10, 20, apps, limit)
      assertEquals(limit, apps.size)
      assertFalse(FocusAppPolicy.blocks(gpay, 10, 20, emptySet(), apps + payments))
      assertTrue(FocusAppPolicy.blocks(phonepe, 10, 20, emptySet(), apps + payments))
      assertTrue(FocusAppPolicy.blocks(paytm, 10, 20, emptySet(), apps + payments))
      assertTrue(FocusAppPolicy.blocks("social.app", 10, 20, emptySet(), apps + payments))
    }
  }

  @Test fun fullSelectionCannotBeReplacedOrExpandedButDuplicateIsHarmless() {
    val selected = setOf(gpay)
    assertEquals(selected, FocusPaymentPolicy.allow(phonepe, 10, 20, selected))
    assertEquals(selected, FocusPaymentPolicy.allow(paytm, 10, 20, selected))
    assertEquals(selected, FocusPaymentPolicy.allow(gpay, 10, 20, selected))
    assertEquals(selected, FocusPaymentPolicy.allow("in.org.npci.upiapp", 10, 20, selected))
  }

  @Test fun onlyExplicitPackagesQualifyNotNamesOrSocialShoppingUpiHandlers() {
    for (target in listOf("", "Google Pay", "$gpay.fake", "com.whatsapp", "in.amazon.mShop.android.shopping", "com.android.settings")) {
      assertTrue(FocusPaymentPolicy.allow(target, 10, 20, emptySet()).isEmpty())
    }
    assertEquals(setOf(gpay), FocusPaymentPolicy.selected(setOf(gpay, "fake.payment")))
    assertEquals(1, FocusPaymentPolicy.selected(FocusPaymentPolicy.packages).size)
  }

  @Test fun expiryBreakAndSettingsPrecedenceStillApply() {
    assertTrue(FocusPaymentPolicy.allow(gpay, 20, 20, emptySet()).isEmpty())
    assertTrue(FocusPaymentPolicy.allow(gpay, 10, 0, emptySet()).isEmpty())
    assertTrue(FocusPaymentPolicy.allow(gpay, 10, 20, emptySet(), setOf(gpay)).isEmpty())
    val allowed = setOf(gpay)
    assertFalse(FocusAppPolicy.blocks("other.app", 10, 0, emptySet(), allowed)) // Timed break.
    assertFalse(FocusAppPolicy.blocks("other.app", 20, 20, emptySet(), allowed)) // Expired.
    assertTrue(FocusAppPolicy.blocks("com.android.settings", 10, 20, emptySet(), allowed))
    assertTrue(FocusAppPolicy.blocks("other.app", 10, 20, emptySet(), allowed)) // Resumed.
    assertFalse(FocusAppPolicy.blocks("other.app", 10, 20, emptySet(), allowed, ringing = true))
  }

  @Test fun offlineRestartAndPauseResumePreserveSelectionsNewSessionAndLogoutClearBoth() {
    val saved = FocusPaymentPolicy.Selection(setOf("study"), setOf(gpay))
    assertEquals(saved, FocusPaymentPolicy.forSession("lock", "lock", saved.apps, saved.payments))
    assertEquals(FocusPaymentPolicy.Selection(emptySet(), emptySet()), FocusPaymentPolicy.forSession("lock", "next", saved.apps, saved.payments))
    assertEquals(FocusPaymentPolicy.Selection(emptySet(), emptySet()), FocusPaymentPolicy.forSession("lock", "", saved.apps, saved.payments))
  }

  @Test fun upgradeMovesLegacyPaymentSelectionsWithoutConsumingRegularSlots() {
    val upgraded = FocusPaymentPolicy.forSession("lock", "lock", setOf("study", gpay), emptySet())
    assertEquals(setOf("study"), upgraded.apps)
    assertEquals(setOf(gpay), upgraded.payments)
    assertEquals(upgraded, FocusPaymentPolicy.forSession("lock", "lock", upgraded.apps, upgraded.payments))
  }

  @Test fun olderTwoPaymentSelectionsAreCappedDeterministicallyOnUpgrade() {
    val upgraded = FocusPaymentPolicy.forSession("lock", "lock", setOf("study"), setOf(gpay, phonepe))
    assertEquals(setOf("study"), upgraded.apps)
    assertEquals(1, upgraded.payments.size)
    assertEquals(upgraded, FocusPaymentPolicy.forSession("lock", "lock", upgraded.apps, upgraded.payments))
  }
}
