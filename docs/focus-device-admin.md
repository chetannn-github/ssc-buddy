# Optional Device Admin and Settings protection

Normal Android users may choose **Uninstall protection** in Focus setup. It opens
Android's standard Device Administrator activation UI; this is not Device Owner
or kiosk provisioning and needs neither Accessibility nor a device reset.
The receiver requests no wipe, password, camera or force-lock policies.

An active administrator must normally be deactivated before its app can be
uninstalled. Users still control deactivation; this is an extra uninstall step,
not an unbreakable lock. Android/OEM policy and background-launch restrictions
still apply. Denying this optional access doesn't prevent a focus session.

Admin activation is offered before a session, not during it. The grant is retained
while setting up the next session, recorded against that local session when it
starts, and retained during timed breaks. At expiry the app requests removal of
its admin access. Removal is asynchronous: the journal remains until removal is
confirmed, with local service/alarm retry and boot restoration. An enabled grant
that has never protected a session remains until used or manually deactivated.
Device Owner installations aren't offered this setup; no ownership is removed.

Settings and resolved OEM Settings packages use the existing activity-return
guard for the entire active session, including timed breaks. Other apps remain
unlocked during the break. Calls retain the existing temporary exemption.
This does not guarantee every embedded settings panel is blocked, instantaneous
redirection, or prevention of deactivation via every OEM/system path. Notification
shade blocking is not added. No new database reads/writes are introduced.

Validation: pure native tests cover grant/session/end lifecycle decisions, breaks
past the original deadline, Settings guard during breaks, call exemptions and
normal app access during breaks. Native compilation and mobile type checking
must pass. The activation screen, asynchronous removal, reboot recovery and
Vivo Settings paths require an APK/device test.

References: [Device administration](https://developer.android.com/work/device-admin),
[DevicePolicyManager](https://developer.android.com/reference/android/app/admin/DevicePolicyManager).
