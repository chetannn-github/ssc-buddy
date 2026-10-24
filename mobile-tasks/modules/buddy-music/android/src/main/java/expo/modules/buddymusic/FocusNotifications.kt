package expo.modules.buddymusic

import android.app.AutomaticZenRule
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.service.notification.Condition
import android.service.notification.ZenPolicy

/** Owns only our automatic rule; never changes the user's global DND policy/filter. */
internal object FocusNotifications {
  fun supported() = Build.VERSION.SDK_INT >= 29
  fun access(context: Context): Boolean = supported() && runCatching { manager(context).isNotificationPolicyAccessGranted }.getOrDefault(false)
  private fun manager(c: Context) = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private var applied: String? = null
  private var retryAfter = 0L

  @Synchronized fun reconcile(context: Context) {
    if (!supported()) return
    val p = BuddyFocusService.prefs(context)
    val session = p.getString("session", "").orEmpty()
    val granted = access(context)
    val active = granted && FocusNotificationPolicy.silence(session, p.getLong("endsAt", 0),
      p.getBoolean("paused", false), p.getLong("breakUntil", 0), System.currentTimeMillis())
    val key = "$granted:$active:${if (active) session else ""}"
    if (key == applied || SystemClock.elapsedRealtime() < retryAfter) return
    try {
      if (granted) {
        val nm = manager(context)
        val uri = Uri.parse("condition://${context.packageName}/focus-lock")
        // Recover a rule if the process died between Android creating it and saving its ID.
        val rules = nm.automaticZenRules.filterValues { it.conditionId == uri }
        if (active) {
          var id = rules.keys.firstOrNull()
          if (id == null) {
            val activity = requireNotNull(context.packageManager.getLaunchIntentForPackage(context.packageName)?.component)
            val builder = ZenPolicy.Builder().disallowAllSounds()
              .allowCalls(ZenPolicy.PEOPLE_TYPE_ANYONE).allowAlarms(true)
              .allowMedia(true).allowSystem(true)
            if (Build.VERSION.SDK_INT >= 30) builder.allowConversations(ZenPolicy.CONVERSATION_SENDERS_NONE)
            // API 35 added channel overrides. Reflection keeps older compile SDKs compatible.
            if (Build.VERSION.SDK_INT >= 35) ZenPolicy.Builder::class.java
              .getMethod("allowPriorityChannels", Boolean::class.javaPrimitiveType).invoke(builder, false)
            val policy = builder.build()
            val rule = AutomaticZenRule("Focus Lock", null, activity, uri, policy,
              NotificationManager.INTERRUPTION_FILTER_PRIORITY, true)
            id = nm.addAutomaticZenRule(rule)
          }
          require(!id.isNullOrBlank()) { "Could not create notification rule" }
          nm.setAutomaticZenRuleState(id, Condition(uri, "Focus Lock", Condition.STATE_TRUE))
          for (duplicate in rules.keys.filter { it != id }) nm.removeAutomaticZenRule(duplicate)
        } else {
          for (id in rules.keys) {
            nm.setAutomaticZenRuleState(id, Condition(uri, "Focus Lock", Condition.STATE_FALSE))
            check(nm.removeAutomaticZenRule(id)) { "Could not release notification rule" }
          }
        }
      }
      // Android disables automatic rules when policy access is revoked. Retry cleanup on regrant.
      applied = key
      if (p.contains("notificationError")) p.edit().remove("notificationError").apply()
    } catch (_: Exception) {
      retryAfter = SystemClock.elapsedRealtime() + 5000
      if (!p.contains("notificationError")) p.edit().putString("notificationError", "Could not update notification silence.").apply()
    }
  }
}
