package expo.modules.buddymusic

/** Explicit package IDs, never app labels or arbitrary UPI-intent handlers.
 * Verified Play listing sources and scope: docs/focus-payment-apps.md.
 * Extend this set when another dedicated payment app has been verified.
 */
internal object FocusPaymentPolicy {
  data class Selection(val apps: Set<String>, val payments: Set<String>)
  const val LIMIT = 1
  val packages = setOf(
    "com.google.android.apps.nbu.paisa.user", // Google Pay (India)
    "com.phonepe.app", // PhonePe
    "net.one97.paytm", // Paytm
    "in.org.npci.upiapp", // BHIM
    "com.naviapp", // Navi
    "in.gokiwi.kiwitpap", // Kiwi
    "money.super.payments", // super.money
    "indwin.c3.shareapp", // slice
    "com.dreamplug.androidapp", // CRED
    "com.mobikwik_new", // MobiKwik
    "com.freecharge.android", // Freecharge
    "com.fampay.in", // FamApp
    "money.jupiter", // Jupiter
    "com.epifi.paisa", // Fi Money
    "com.hdfcbank.payzapp", // PayZapp
    "in.jfs.jiofinance", // JioFinance
    "org.altruist.BajajExperia", // Bajaj Finance
    "com.adityabirlacapitaldigital.OneApp", // ABCD
    "com.samsung.android.spay", // Samsung Wallet
    "com.sbi.lotusintouch", // YONO SBI
    "com.sbi.upi", // BHIM SBI Pay
    "com.csam.icici.bank.imobile", // ICICI iMobile
    "com.hdfcbank.android.now", // HDFC Bank
    "com.axis.mobile", // Axis Mobile
    "com.upi.axispay", // BHIM Axis Pay
    "com.kotak.bank.mobile", // Kotak Bank
    "com.msf.kbank.mobile", // Kotak Bank (old)
    "com.bankofbaroda.mconnect", // bob World
    "com.bankofbaroda.upi", // bob e Pay
    "com.canarabank.mobility", // Canara ai1
    "com.Version1", // PNB ONE
    "com.infrasoft.uboi", // Union ease
    "com.idfcfirstbank.optimus", // IDFC FIRST Bank
  )

  fun selected(values: Set<String>, settingsPackages: Set<String> = setOf("com.android.settings")): Set<String> =
    values.filter { it in packages && !FocusAppPolicy.isSettings(it, settingsPackages) }.sorted().take(LIMIT).toSet()

  fun allow(target: String, now: Long, endsAt: Long, values: Set<String>, settingsPackages: Set<String> = setOf("com.android.settings")): Set<String> {
    val current = selected(values, settingsPackages)
    return if (target in packages) FocusAppPolicy.allow(target, now, endsAt, current, LIMIT, settingsPackages) else current
  }

  /** Move legacy payment selections out of regular slots, enforcing the current
   * cap. A new lock (including a new schedule occurrence) starts empty. */
  fun forSession(previousId: String, id: String, apps: Set<String>, payments: Set<String>): Selection =
    if (previousId != id) Selection(emptySet(), emptySet())
    else Selection(apps - packages, selected(payments + apps.filter { it in packages }))
}
