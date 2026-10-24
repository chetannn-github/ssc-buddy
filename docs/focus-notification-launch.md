# Focus: notification launches of protected apps

Main's native service now applies its existing Settings activity-return fallback
to blocked payment-catalog apps and blocked installed apps declaring
`android.permission.HIDE_OVERLAY_WINDOWS`. Android 12+ permits sensitive apps to
hide application overlays. A successfully attached Focus overlay alone isn't
evidence that it is visible over a banking window.

PhonePe and other catalog payment apps require the session's explicit payment
selection even if they appear among dynamically resolved dial/contact handlers.
Selected payment apps, selected study apps, calls, timed breaks and session
expiry retain their normal access. Ordinary blocked apps keep the overlay UI.
The fallback is throttled using the existing Settings guard; package permission
lookups are cached in memory. There are no new cloud reads/writes or notification
listener/Accessibility permissions.

The foreground tracker still requires a resumed activity: notification arrival
or interaction events alone aren't proof of foreground and can't summon an
overlay over an allowed app. Both notification taps and launcher/deep links use
the same foreground authorization check.

This covers an identified code gap; the reported PhonePe incident's exact cause
wasn't established with device logs. Package metadata doesn't prove an app is
currently hiding overlays. The fallback deliberately covers all blocked catalog
payments and all blocked apps declaring that permission. OEMs may also suppress
overlays in other ways. Usage events may be delayed; Android/OEM background
activity-launch restrictions can deny the activity return. This isn't Lock Task
or a guarantee against bypass. Test on the affected Vivo before release.

Device validation: notification tap into unselected PhonePe returns to SSC Buddy;
selected PhonePe stays open; another blocked app still shows the overlay; ordinary
notification arrival doesn't interrupt a selected app; timed break and incoming
calls remain accessible. Also test existing notification, heads-up and lock-screen
entry paths and allowlist changes/new sessions.

Reference: [Android sensitive activity protection](https://developer.android.com/security/fraud-prevention/activities).
