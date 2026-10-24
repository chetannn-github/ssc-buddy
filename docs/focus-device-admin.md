# Device Admin and Settings protection

Normal Android users activate **Uninstall protection** in Focus setup. It opens
Android's standard Device Administrator activation UI; this is not Device Owner
or kiosk provisioning and needs neither Accessibility nor a device reset.
The receiver requests no wipe, password, camera or force-lock policies.

An active administrator must normally be deactivated before its app can be
uninstalled. Users still control deactivation; this is an extra uninstall step,
not an unbreakable lock. Android/OEM policy and background-launch restrictions
still apply. Manual Android Focus starts require Usage access, Overlay access,
notification-policy access when supported, and Device Admin. Every start checks
fresh native status before creating the session; denied, revoked or unreadable
permissions cannot start it. Scheduled activation remains exempt from this new
manual-start check; its existing alarm/setup behavior is unchanged. A timer
starting does not grant missing Android permissions or guarantee app blocking.

After Android sign-in, a required-permission screen blocks entry to the app until
the same four supported permissions are granted. Status is checked on return
from Settings and locally while the app is active. Permission revocation brings
the screen back. Existing app screens remain mounted after the first successful
setup so their state isn't reset by rechecking access. Initial setup delays
mounting them. Focus/schedule and widget synchronization remain outside the UI
gate. No extra database subscriptions are created by permission checking.
If a previously scheduled focus session is already restricted, permission setup
may have to wait until its Settings guard releases at session end. No setup
exception to that guard is introduced. Older builds without the native access
checks show an update-build message instead of silently granting access.

Admin activation is offered before a session, not during it. Once activated,
the grant stays enabled through focus, breaks, session completion and restart.
The app never automatically revokes it. The user may deactivate it in Android
Settings outside a focus session. Obsolete auto-release metadata is discarded
without changing the grant, and expiry no longer schedules admin-removal retries.
Device Owner installations aren't offered this setup; no ownership is removed.

Settings and resolved OEM Settings packages use the existing activity-return
guard for the entire active session, including timed breaks. Other apps remain
unlocked during the break. Calls retain the existing temporary exemption.
This does not guarantee every embedded settings panel is blocked, instantaneous
redirection, or prevention of deactivation via every OEM/system path. Notification
shade blocking is not added. No new database reads/writes are introduced.

Validation: pure native tests cover Settings deadlines across session end, breaks
past the original deadline, Settings guard during breaks, call exemptions and
normal app access during breaks. Native compilation and mobile type checking
must pass. The activation screen, persisted grant, manual deactivation and
Vivo Settings paths require an APK/device test.

References: [Device administration](https://developer.android.com/work/device-admin),
[DevicePolicyManager](https://developer.android.com/reference/android/app/admin/DevicePolicyManager).
