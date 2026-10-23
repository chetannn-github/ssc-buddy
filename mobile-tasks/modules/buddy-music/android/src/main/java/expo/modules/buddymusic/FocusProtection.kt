package expo.modules.buddymusic

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/** Retained only so updates can release admin access granted by older versions. */
class FocusAdminReceiver : DeviceAdminReceiver()

class FocusRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, "expo.modules.buddymusic.FOCUS_EXPIRY")) {
      FocusProtection.reconcile(context)
      BuddyFocusService.ensureRunning(context)
    }
  }
}

internal object FocusProtection {
  private fun manager(context: Context) = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
  private fun admin(context: Context) = ComponentName(context, FocusAdminReceiver::class.java)
  fun enabled(context: Context) = manager(context).isAdminActive(admin(context))
  fun owner(context: Context) = manager(context).isDeviceOwnerApp(context.packageName)
  fun active(context: Context): Boolean {
    val p = BuddyFocusService.prefs(context)
    return FocusAppPolicy.lockActive(p.getString("session", "").orEmpty(), p.getBoolean("paused", false), p.getLong("endsAt", 0), System.currentTimeMillis())
  }
  fun reconcile(context: Context) {
    BuddyFocusService.finishTimedBreak(context)
    val p = BuddyFocusService.prefs(context)
    val active = active(context)
    val dpm = manager(context)
    // Focus Lock no longer requests or uses device admin. Release legacy grants;
    // the locally persisted deadline and boot restoration remain independent.
    if (enabled(context)) runCatching {
      if (owner(context)) dpm.setUninstallBlocked(admin(context), context.packageName, false)
      else dpm.removeActiveAdmin(admin(context))
    }
    if (p.contains("adminSession") || p.contains("protectionError")) p.edit().remove("adminSession").remove("protectionError").apply()
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
  }
}
