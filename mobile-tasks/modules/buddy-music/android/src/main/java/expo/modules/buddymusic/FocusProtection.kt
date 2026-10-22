package expo.modules.buddymusic

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/** Optional user-approved admin; never changes credentials, wipes data or locks the device. */
class FocusAdminReceiver : DeviceAdminReceiver() {
  override fun onDisableRequested(context: Context, intent: Intent): CharSequence? =
    if (FocusProtection.active(context)) "Focus Lock is active. Disabling this admin removes uninstall protection." else null
}

class FocusRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, "expo.modules.buddymusic.FOCUS_EXPIRY")) {
      FocusProtection.reconcile(context)
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
  fun request(context: Context) {
    context.startActivity(Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
      .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin(context))
      .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Protect SSC Buddy from direct uninstall during Focus Lock. Android lets you deactivate this admin in Settings. No screen lock, password or erase permissions are requested.")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
  fun reconcile(context: Context) {
    val p = BuddyFocusService.prefs(context)
    val active = active(context)
    val dpm = manager(context)
    if (active && enabled(context)) p.edit().putBoolean("adminSession", true).apply()
    if (owner(context) && enabled(context)) runCatching { dpm.setUninstallBlocked(admin(context), context.packageName, active) }
      .onFailure { p.edit().putString("protectionError", "Could not update managed uninstall protection.").apply() }
    // Ordinary admin is released at expiry, without any internet request.
    if (!active && p.getBoolean("adminSession", false)) {
      if (enabled(context) && !owner(context)) dpm.removeActiveAdmin(admin(context))
      p.edit().putBoolean("adminSession", false).apply()
    }
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pending = PendingIntent.getBroadcast(context, 7319,
      Intent(context, FocusRestoreReceiver::class.java).setAction("expo.modules.buddymusic.FOCUS_EXPIRY"),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    alarm.cancel(pending)
    if (active && !p.getBoolean("paused", false)) {
      // No exact-alarm permission needed; service also reconciles every second.
      alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, p.getLong("endsAt", 0), pending)
    }
  }
}
