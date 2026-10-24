# Android Focus Lock payment apps

Catalog checked against developer Play listings and payment-provider documentation on 2026-10-24. Package identity is used for matching, not display names. This is a maintained catalog, not automatic classification of every payment app or a certificate-verification system.

## Behavior

- The existing overlay's Add payment app picker lists installed, launchable catalog apps, using their device labels and icons. Nothing is allowed automatically.
- Payment selection uses a plus shortcut in the existing app icon row. The chosen app replaces that shortcut; there is no separate payment heading, count or row.
- Maximum one payment selection, independent of the existing 0–2 regular app slots. One shared native constant controls the payment cap.
- The same animated picker, Settings exclusions, expiry, incoming-call handling and break restrictions are reused. No new Firestore documents, reads or writes.
- Selections are stored in local SharedPreferences for the lock ID. Restart, offline use, image updates and break/resume preserve them. They cannot be removed/replaced in an active session. A new manual lock or scheduled occurrence clears both selections.
- Existing regular-slot payment selections move to payment slots on native service startup/sync after an APK upgrade, enforcing the current one-app cap. Nonpayment selections stay intact.
- A selected package's entire app is allowed, including any other features it contains. External browsers, Settings and other unselected apps are still subject to Focus Lock.
- Payment apps may independently reject enabled Accessibility services. This feature does not disable Accessibility or bypass those apps' security checks.
- Requires a new Android native build. No physical-device payment flow verification has been performed.

## Catalog and extension

Only installed catalog packages appear. Keep the centralized set in `mobile-tasks/modules/buddy-music/android/src/main/java/expo/modules/buddymusic/FocusPaymentPolicy.kt` current and verify the developer's listing before adding a package. Arbitrary UPI handlers, social/shopping apps, app-name matches and wildcard package matches are deliberately excluded. Do not add a similar-looking package based on community lists: several Navi, Kiwi, slice, super.money and FamApp IDs there differ from the actual Play listings.

| App | Package | Source |
| --- | --- | --- |
| Google Pay (India) | `com.google.android.apps.nbu.paisa.user` | [Play listing](https://play.google.com/store/apps/details?id=com.google.android.apps.nbu.paisa.user) |
| PhonePe | `com.phonepe.app` | [Play listing](https://play.google.com/store/apps/details?id=com.phonepe.app) |
| Paytm | `net.one97.paytm` | [Play listing](https://play.google.com/store/apps/details?id=net.one97.paytm) |
| BHIM | `in.org.npci.upiapp` | [Play listing](https://play.google.com/store/apps/details?id=in.org.npci.upiapp) |
| Navi | `com.naviapp` | [Play listing](https://play.google.com/store/apps/details?id=com.naviapp) |
| Kiwi | `in.gokiwi.kiwitpap` | [Play listing](https://play.google.com/store/apps/details?id=in.gokiwi.kiwitpap) |
| super.money | `money.super.payments` | [Play listing](https://play.google.com/store/apps/details?id=money.super.payments) |
| slice | `indwin.c3.shareapp` | [Play listing](https://play.google.com/store/apps/details?id=indwin.c3.shareapp) |
| CRED | `com.dreamplug.androidapp` | [Play listing](https://play.google.com/store/apps/details?id=com.dreamplug.androidapp) |
| MobiKwik | `com.mobikwik_new` | [Play listing](https://play.google.com/store/apps/details?id=com.mobikwik_new) |
| Freecharge | `com.freecharge.android` | [Play listing](https://play.google.com/store/apps/details?id=com.freecharge.android) |
| FamApp | `com.fampay.in` | [Play listing](https://play.google.com/store/apps/details?id=com.fampay.in) |
| Jupiter | `money.jupiter` | [Play listing](https://play.google.com/store/apps/details?id=money.jupiter) |
| Fi Money | `com.epifi.paisa` | [Play listing](https://play.google.com/store/apps/details?id=com.epifi.paisa) |
| PayZapp | `com.hdfcbank.payzapp` | [Play listing](https://play.google.com/store/apps/details?id=com.hdfcbank.payzapp) |
| JioFinance | `in.jfs.jiofinance` | [Play listing](https://play.google.com/store/apps/details?id=in.jfs.jiofinance) |
| Bajaj Finance | `org.altruist.BajajExperia` | [Play listing](https://play.google.com/store/apps/details?id=org.altruist.BajajExperia) |
| ABCD | `com.adityabirlacapitaldigital.OneApp` | [Play listing](https://play.google.com/store/apps/details?id=com.adityabirlacapitaldigital.OneApp) |
| Samsung Wallet | `com.samsung.android.spay` | [Play listing](https://play.google.com/store/apps/details?id=com.samsung.android.spay) |
| YONO SBI | `com.sbi.lotusintouch` | [Play listing](https://play.google.com/store/apps/details?id=com.sbi.lotusintouch) |
| BHIM SBI Pay | `com.sbi.upi` | [Play listing](https://play.google.com/store/apps/details?id=com.sbi.upi) |
| ICICI iMobile | `com.csam.icici.bank.imobile` | [Play listing](https://play.google.com/store/apps/details?id=com.csam.icici.bank.imobile) |
| HDFC Bank | `com.hdfcbank.android.now` | [Play listing](https://play.google.com/store/apps/details?id=com.hdfcbank.android.now) |
| Axis Mobile | `com.axis.mobile` | [Play listing](https://play.google.com/store/apps/details?id=com.axis.mobile) |
| BHIM Axis Pay | `com.upi.axispay` | [Play listing](https://play.google.com/store/apps/details?id=com.upi.axispay) |
| Kotak Bank | `com.kotak.bank.mobile` | [Play listing](https://play.google.com/store/apps/details?id=com.kotak.bank.mobile) |
| Kotak Bank (old) | `com.msf.kbank.mobile` | [Play listing](https://play.google.com/store/apps/details?id=com.msf.kbank.mobile) |
| bob World | `com.bankofbaroda.mconnect` | [Play listing](https://play.google.com/store/apps/details?id=com.bankofbaroda.mconnect) |
| bob e Pay | `com.bankofbaroda.upi` | [Play listing](https://play.google.com/store/apps/details?id=com.bankofbaroda.upi) |
| Canara ai1 | `com.canarabank.mobility` | [Play listing](https://play.google.com/store/apps/details?id=com.canarabank.mobility) |
| PNB ONE | `com.Version1` | [Play listing](https://play.google.com/store/apps/details?id=com.Version1) |
| Union ease | `com.infrasoft.uboi` | [Play listing](https://play.google.com/store/apps/details?id=com.infrasoft.uboi) |
| IDFC FIRST Bank | `com.idfcfirstbank.optimus` | [Play listing](https://play.google.com/store/apps/details?id=com.idfcfirstbank.optimus) |

The original Google Pay, PhonePe, Paytm and BHIM IDs are also documented by [Paytm UPI Smart Intent](https://business.paytm.com/docs/upi-smart-intent/). Fi Money's developer [Data safety listing](https://play.google.com/store/apps/datasafety?id=com.epifi.paisa) confirms its package. Legacy banking app entries remain for already-installed versions; availability varies by device and country.
