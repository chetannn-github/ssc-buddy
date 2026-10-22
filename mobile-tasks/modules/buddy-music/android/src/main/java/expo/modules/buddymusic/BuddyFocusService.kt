package expo.modules.buddymusic

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.animation.DecelerateInterpolator
import android.view.animation.TranslateAnimation
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextSwitcher
import android.widget.TextView

/** Only observes foreground package names; never requests screen/view contents. */
class BuddyFocusService : AccessibilityService(), SharedPreferences.OnSharedPreferenceChangeListener {
  private val handler = Handler(Looper.getMainLooper())
  private var overlay: View? = null
  private var timer: LinearLayout? = null
  private var renderedTime = ""
  private var foreground = ""
  private lateinit var preferences: SharedPreferences
  private val essentials = mutableSetOf<String>()
  private val ticker = object : Runnable {
    override fun run() {
      if (System.currentTimeMillis() >= preferences.getLong("endsAt", 0)) hide()
      else updateTimer()
      handler.postDelayed(this, if (overlay == null) 1000 else 250)
    }
  }
  override fun onServiceConnected() {
    preferences = prefs(this)
    preferences.registerOnSharedPreferenceChangeListener(this)
    essentials.addAll(setOf(packageName, "android", "com.android.systemui", "com.android.settings", "com.android.permissioncontroller", "com.google.android.permissioncontroller", "com.android.phone", "com.android.server.telecom", "com.android.emergency", "com.google.android.dialer", "com.android.dialer", "com.samsung.android.dialer", "com.android.contacts", "com.google.android.contacts", "com.samsung.android.app.contacts"))
    runCatching { (getSystemService(TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage?.let(essentials::add) }
    val intents = listOf(Intent(Intent.ACTION_DIAL, Uri.parse("tel:")), Intent(Intent.ACTION_VIEW).setType("vnd.android.cursor.dir/contact"), Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))
    intents.forEach { intent -> packageManager.queryIntentActivities(intent, 0).forEach { essentials.add(it.activityInfo.packageName) } }
    (getSystemService(INPUT_METHOD_SERVICE) as? android.view.inputmethod.InputMethodManager)?.enabledInputMethodList?.forEach { essentials.add(it.packageName) }
    handler.post(ticker)
  }
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (!::preferences.isInitialized) return
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val target = event.packageName?.toString() ?: return
    // Ignore events emitted by our own accessibility overlay.
    if (target == packageName && overlay != null) return
    foreground = target
    enforce()
  }
  override fun onSharedPreferenceChanged(shared: SharedPreferences?, key: String?) { handler.post { hide(); enforce() } }
  private fun enforce() {
    if (!FocusAppPolicy.blocks(foreground, System.currentTimeMillis(), preferences.getLong("endsAt", 0), essentials, preferences.getStringSet("allowed", emptySet()).orEmpty())) { hide(); return }
    if (overlay != null) return
    show(foreground)
  }
  private fun text(value: String, size: Float, tint: Int = Color.WHITE) = TextView(this).apply {
    text = value; textSize = size; setTextColor(tint); gravity = Gravity.CENTER
    setPadding(dp(10), dp(8), dp(10), dp(8))
  }
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun show(target: String) {
    val accent = runCatching { Color.parseColor(preferences.getString("accent", "#ffe000")) }.getOrDefault(Color.YELLOW)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(24), dp(24), dp(24))
      background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.argb(30, Color.red(accent), Color.green(accent), Color.blue(accent)), Color.BLACK)).apply { setColor(Color.BLACK); colors = intArrayOf(Color.rgb(Color.red(accent) / 10, Color.green(accent) / 10, Color.blue(accent) / 10), Color.BLACK) }
    }
    root.addView(text("Focus Lock", 22f, accent))
    timer = LinearLayout(this).apply { gravity = Gravity.CENTER }
    root.addView(timer)
    val label = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(target, 0)).toString() }.getOrDefault("This app")
    root.addView(text("$label is paused for your focus session", 15f, Color.LTGRAY))
    val allowed = preferences.getStringSet("allowed", emptySet()).orEmpty()
    root.addView(Button(this).apply {
      text = if (allowed.size < 2) "Allow this app · ${allowed.size}/2" else "2/2 apps already allowed"
      isEnabled = allowed.size < 2
      setOnClickListener {
        val current = preferences.getStringSet("allowed", emptySet()).orEmpty()
        if (current.size < 2 && preferences.getLong("endsAt", 0) > System.currentTimeMillis()) {
          preferences.edit().putStringSet("allowed", FocusAppPolicy.allow(target, System.currentTimeMillis(), preferences.getLong("endsAt", 0), current)).apply()
          hide()
        }
      }
    })
    root.addView(Button(this).apply {
      text = "Quick Recall"
      setOnClickListener {
        packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
          this@BuddyFocusService.foreground = packageName
          preferences.edit().putBoolean("recall", true).apply()
          hide(); startActivity(intent)
        }
      }
    })
    root.addView(text("Phone and Contacts are always allowed", 12f, Color.GRAY))
    root.addView(Button(this).apply { text = "Home"; setOnClickListener { hide(); performGlobalAction(GLOBAL_ACTION_HOME) } })
    val params = WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.OPAQUE)
    params.gravity = Gravity.TOP or Gravity.START
    root.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).addView(root, params); overlay = root; renderedTime = ""; updateTimer() }
  }
  private fun updateTimer() {
    val row = timer ?: return
    val seconds = ((preferences.getLong("endsAt", 0) - System.currentTimeMillis() + 999) / 1000).coerceAtLeast(0)
    val value = "%d:%02d".format(seconds / 60, seconds % 60)
    if (value == renderedTime) return
    if (row.childCount != value.length) {
      row.removeAllViews()
      value.forEach { character ->
        row.addView(TextSwitcher(this).apply {
          setFactory { text("", 48f).apply { typeface = Typeface.MONOSPACE; setPadding(0, 0, 0, 0) } }
          inAnimation = TranslateAnimation(0f, 0f, dp(58).toFloat(), 0f).apply { duration = 750; interpolator = DecelerateInterpolator(2f) }
          outAnimation = TranslateAnimation(0f, 0f, 0f, -dp(58).toFloat()).apply { duration = 750; interpolator = DecelerateInterpolator(2f) }
          setCurrentText(character.toString())
        }, LinearLayout.LayoutParams(dp(30), dp(64)))
      }
    } else value.forEachIndexed { index, char -> if (renderedTime.getOrNull(index) != char) (row.getChildAt(index) as TextSwitcher).setText(char.toString()) }
    renderedTime = value
  }
  private fun hide() {
    overlay?.let { runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(it) } }
    overlay = null; timer = null; renderedTime = ""
  }
  override fun onInterrupt() { hide() }
  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    if (::preferences.isInitialized) preferences.unregisterOnSharedPreferenceChangeListener(this)
    hide(); super.onDestroy()
  }
  companion object {
    fun prefs(context: Context) = context.getSharedPreferences("buddy-focus-lock", Context.MODE_PRIVATE)
    fun enabled(context: Context): Boolean {
      val expected = ComponentName(context, BuddyFocusService::class.java)
      return Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty().split(':').any { ComponentName.unflattenFromString(it) == expected }
    }
    fun sync(context: Context, id: String, endsAt: Double, accent: String) {
      val p = prefs(context)
      val editor = p.edit().putString("session", id).putLong("endsAt", endsAt.toLong()).putString("accent", accent)
      editor.putStringSet("allowed", FocusAppPolicy.forSession(p.getString("session", "").orEmpty(), id, p.getStringSet("allowed", emptySet()).orEmpty()))
      editor.apply()
    }
  }
}
