package expo.modules.buddymusic

internal object FocusAdminPolicy {
  // Timed breaks release other apps, but not the Settings route to permissions/admin.
  fun settingsDeadline(session: String, paused: Boolean, endsAt: Long, now: Long): Long =
    if (FocusAppPolicy.lockActive(session, paused, endsAt, now)) {
      if (paused) Long.MAX_VALUE else endsAt
    } else 0L
}
