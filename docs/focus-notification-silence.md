# Android Focus notification silence

Focus Lock uses one app-owned Android automatic Do Not Disturb rule on Android 10+.
Grant **Silent notifications** access once in Focus setup. This is required for
manual Android Focus starts on supported versions; scheduled starts do not use
the manual permission gate. It needs a new native Android build, not just an
OTA JavaScript update. Web, extensions and Windows cannot silence Android notifications.

While the local Focus Lock is restricted, the rule silences ordinary notification
sounds and vibration. Calls from anyone and alarms are allowed by this rule;
media and system audio remain allowed. Existing user DND modes can still impose
stricter settings. Notifications aren't deleted or hidden from their history.

Timed breaks remove only this app's rule. Resuming reactivates silence; expiry
removes it before the completion screen. Scheduled/offline sessions use the same
saved native deadline. Global DND settings and ringer volume are never changed.
Legacy indefinite pauses retain the existing restriction behavior and silence.

The service checks local state without database access. Android rule mutations
occur on lifecycle/permission changes, not on each timer tick. Process restart
recovers the rule by its app-owned condition URI; permission denial/revocation
does not prevent Focus Lock. Failures are shown in setup and retried while the
service runs. Existing expiry alarms and boot/time-change restoration reconcile
the rule too. OS suspension/force-stop can delay expiry cleanup; this has not
been physically validated on Vivo. Android permits users to override DND rules.

References: [AutomaticZenRule](https://developer.android.com/reference/android/app/AutomaticZenRule),
[NotificationManager](https://developer.android.com/reference/android/app/NotificationManager),
[ZenPolicy.Builder](https://developer.android.com/reference/android/service/notification/ZenPolicy.Builder).

## Verification

JVM policy tests cover active/empty/expired sessions, timed break/resume and
legacy restricted pauses. Native API compilation and app TypeScript checks must
pass. Device checks before release:

- Deny DND access: focus still runs; no notification policy changes.
- Grant access, start manual and scheduled sessions: messages silent, calls and
  alarms ring, media remains audible.
- Break: prior notification behavior returns; auto-resume silences again.
- End: rule disappears even while celebration remains open.
- Start with manual DND already enabled: focus ending doesn't disable it.
- Revoke/regrant access, restart app, and reboot across a saved deadline: no
  duplicate Focus rule, and expired sessions don't reactivate silence.
