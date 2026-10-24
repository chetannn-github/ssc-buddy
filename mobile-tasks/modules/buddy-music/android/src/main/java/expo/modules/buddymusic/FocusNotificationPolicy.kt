package expo.modules.buddymusic

internal object FocusNotificationPolicy {
  fun silence(session: String, endsAt: Long, paused: Boolean, breakUntil: Long, now: Long): Boolean =
    FocusAppPolicy.lockActive(session, paused, endsAt, now) &&
      FocusBreakPolicy.restrictionDeadline(now, endsAt, paused, breakUntil, session.isNotBlank()) > now
}
