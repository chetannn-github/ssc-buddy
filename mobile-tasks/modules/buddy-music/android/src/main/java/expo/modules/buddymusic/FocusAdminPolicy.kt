package expo.modules.buddymusic

internal object FocusAdminPolicy {
  // Admin enabled during setup is retained until it has protected a session.
  fun release(activeSession: Boolean, enrolledSession: String) = !activeSession && enrolledSession.isNotBlank()
  // Timed breaks release other apps, but not the Settings route to permissions/admin.
  fun settingsDeadline(session: String, paused: Boolean, endsAt: Long, now: Long): Long =
    if (FocusAppPolicy.lockActive(session, paused, endsAt, now)) {
      if (paused) Long.MAX_VALUE else endsAt
    } else 0L
}
