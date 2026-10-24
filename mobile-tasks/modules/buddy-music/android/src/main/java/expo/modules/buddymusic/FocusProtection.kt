package expo.modules.buddymusic

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/** Optional normal Device Admin; no Device Owner enrollment or destructive policies. */
class FocusAdminReceiver : DeviceAdminReceiver() {
  override fun onEnabled(context: Context, intent: Intent) { FocusProtection.reconcile(context) }
  override fun onDisabled(context: Context, intent: Intent) {
    BuddyFocusService.prefs(context).edit().remove("adminSession").remove("protectionError").apply()
  }
}

class FocusRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED, AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED, FocusSchedules.ACTION, "expo.modules.buddymusic.FOCUS_EXPIRY")) {
      FocusSchedules.tick(context)
      FocusSchedules.arm(context)
      FocusProtection.reconcile(context)
      BuddyFocusService.ensureRunning(context)
    }
  }
}

internal object FocusProtection {
  private var lastRemovalAttempt = 0L
  private fun manager(context: Context) = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
  private fun admin(context: Context) = ComponentName(context, FocusAdminReceiver::class.java)
  fun enabled(context: Context) = manager(context).isAdminActive(admin(context))
  fun owner(context: Context) = manager(context).isDeviceOwnerApp(context.packageName)
  fun openAdminSettings(context: Context) {
    check(!active(context)) { "Enable uninstall protection before starting Focus Lock." }
    context.startActivity(Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
      .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin(context))
      .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
        "Adds an administrator deactivation step before uninstalling SSC Buddy. Access is released after your focus session.")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
  fun reconcileAdmin(context: Context) {
    val p = BuddyFocusService.prefs(context)
    val active = active(context)
    val granted = enabled(context)
    if (active && granted) {
      val id = p.getString("session", "").orEmpty()
      if (p.getString("adminSession", "") != id) p.edit().putString("adminSession", id).remove("protectionError").apply()
    } else if (FocusAdminPolicy.release(active, p.getString("adminSession", "").orEmpty())) {
      if (!granted) {
        p.edit().remove("adminSession").remove("protectionError").apply()
        return
      }
      val now = android.os.SystemClock.elapsedRealtime()
      if (lastRemovalAttempt != 0L && now - lastRemovalAttempt < 2000) return
      lastRemovalAttempt = now
      runCatching {
        if (owner(context)) {
          // Do not deprovision an existing managed device. Only release our legacy uninstall flag.
          manager(context).setUninstallBlocked(admin(context), context.packageName, false)
          p.edit().remove("adminSession").apply()
        } else manager(context).removeActiveAdmin(admin(context))
      }.onFailure {
        if (!p.contains("protectionError")) p.edit().putString("protectionError", "Could not release uninstall protection.").apply()
      }
    }
  }
  fun active(context: Context): Boolean {
    val p = BuddyFocusService.prefs(context)
    return FocusAppPolicy.lockActive(p.getString("session", "").orEmpty(), p.getBoolean("paused", false), p.getLong("endsAt", 0), System.currentTimeMillis())
  }
  fun reconcile(context: Context) {
    BuddyFocusService.finishTimedBreak(context)
    FocusNotifications.reconcile(context)
    reconcileAdmin(context)
    val p = BuddyFocusService.prefs(context)
    val active = active(context)
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pending = PendingIntent.getBroadcast(context, 7319,
      Intent(context, FocusRestoreReceiver::class.java).setAction("expo.modules.buddymusic.FOCUS_EXPIRY"),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    alarm.cancel(pending)
    val breakUntil = p.getLong("breakUntil", 0)
    if (active && (!p.getBoolean("paused", false) || breakUntil > 0)) {
      // No exact-alarm permission needed; service also reconciles every second.
      alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, if (p.getBoolean("paused", false)) breakUntil else p.getLong("endsAt", 0), pending)
    }
    if (!active && p.contains("adminSession")) {
      // removeActiveAdmin is asynchronous; retain recovery until Android confirms removal.
      alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 5000, pending)
    }
  }
}
