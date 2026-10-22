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
import android.os.Build
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.accessibility.AccessibilityEvent
import android.view.animation.DecelerateInterpolator
import android.view.animation.TranslateAnimation
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextSwitcher
import android.widget.TextView
import android.widget.ImageView
import android.graphics.BitmapFactory

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
      enforce()
      updateTimer()
      handler.postDelayed(this, if (overlay == null) 1000 else 250)
    }
  }
  override fun onServiceConnected() {
    preferences = prefs(this)
    connected = true
    preferences.edit().remove("overlayError").apply()
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
    lastEventAt = System.currentTimeMillis()
    // Ignore events emitted by our own accessibility overlay.
    if (target == packageName && overlay != null) return
    foreground = target
    enforce()
  }
  override fun onSharedPreferenceChanged(shared: SharedPreferences?, key: String?) { handler.post { hide(); enforce() } }
  private fun enforce() {
    if (!FocusAppPolicy.blocks(foreground, System.currentTimeMillis(), restrictionDeadline(), essentials, preferences.getStringSet("allowed", emptySet()).orEmpty())) { hide(); return }
    if (overlay != null) return
    show(foreground)
  }
  private fun restrictionDeadline(): Long = if (preferences.getBoolean("paused", false) && !preferences.getString("session", "").isNullOrEmpty()) Long.MAX_VALUE else preferences.getLong("endsAt", 0)
  private fun text(value: String, size: Float, tint: Int = Color.WHITE) = TextView(this).apply {
    text = value; textSize = size; setTextColor(tint); gravity = Gravity.CENTER
    setPadding(dp(10), dp(8), dp(10), dp(8))
  }
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun shortcut(label: String, intent: Intent?, iconPackage: String? = null): View {
    val tile = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
      setPadding(dp(2), dp(10), dp(2), dp(8))
      contentDescription = "Open $label"; isEnabled = intent != null
      alpha = if (intent != null) 1f else 0.4f
      isFocusable = true
      background = GradientDrawable().apply { setColor(Color.rgb(24, 24, 24)); cornerRadius = dp(18).toFloat() }
    }
    tile.addView(ImageView(this).apply {
      val icon = runCatching {
        if (iconPackage != null) packageManager.getApplicationIcon(iconPackage)
        else if (intent != null) packageManager.getActivityIcon(intent) else null
      }.getOrNull()
      if (icon != null) setImageDrawable(icon) else setImageResource(android.R.drawable.sym_def_app_icon)
      scaleType = ImageView.ScaleType.FIT_CENTER; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }, LinearLayout.LayoutParams(dp(40), dp(40)))
    tile.addView(text(label, 10f, Color.LTGRAY).apply {
      maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END
      setPadding(dp(2), dp(7), dp(2), 0)
    })
    tile.setOnClickListener {
      if (intent == null) return@setOnClickListener
      runCatching {
        // Start first so a missing/disabled app never exposes the blocked app.
        startActivity(Intent(intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        foreground = iconPackage ?: intent.`package` ?: packageName
        hide()
      }.onFailure { android.widget.Toast.makeText(this, "Could not open $label", android.widget.Toast.LENGTH_SHORT).show() }
    }
    return tile
  }
  private fun essentialIntent(intent: Intent): Intent? {
    val resolved = packageManager.resolveActivity(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo
    val activity = resolved?.takeUnless { it.packageName == "android" }
      ?: packageManager.queryIntentActivities(intent, 0).firstOrNull { it.activityInfo.packageName != "android" }?.activityInfo
    return activity?.let { Intent(intent).setComponent(ComponentName(it.packageName, it.name)) }
  }
  private fun show(target: String) {
    val accent = runCatching { Color.parseColor(preferences.getString("accent", "#ffe000")) }.getOrDefault(Color.YELLOW)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(24), dp(24), dp(24))
      background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.argb(30, Color.red(accent), Color.green(accent), Color.blue(accent)), Color.BLACK)).apply { setColor(Color.BLACK); colors = intArrayOf(Color.rgb(Color.red(accent) / 10, Color.green(accent) / 10, Color.blue(accent) / 10), Color.BLACK) }
    }
    val image = preferences.getString("image", "").orEmpty()
    if (image.startsWith("file:")) runCatching {
      val bitmap = BitmapFactory.decodeFile(Uri.parse(image).path, BitmapFactory.Options().apply { inSampleSize = 2 })
      if (bitmap != null) root.addView(ImageView(this).apply {
        setImageBitmap(bitmap); scaleType = ImageView.ScaleType.FIT_CENTER
        contentDescription = "Focus motivation"; clipToOutline = true
        background = GradientDrawable().apply { setColor(Color.BLACK); cornerRadius = dp(20).toFloat() }
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f).apply { setMargins(0, dp(18), 0, dp(18)) })
    }
    root.addView(text("Focus Lock", 16f, accent))
    root.addView(text("Your goals deserve this time.", 24f))
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
        if (current.size < 2 && restrictionDeadline() > System.currentTimeMillis()) {
          preferences.edit().putStringSet("allowed", FocusAppPolicy.allow(target, System.currentTimeMillis(), restrictionDeadline(), current)).apply()
          hide()
        }
      }
    })
    val apps = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
    fun addShortcut(label: String, intent: Intent?, iconPackage: String? = null) {
      apps.addView(shortcut(label, intent, iconPackage), LinearLayout.LayoutParams(0, dp(98), 1f).apply { setMargins(dp(3), 0, dp(3), 0) })
    }
    addShortcut("SSC Buddy", packageManager.getLaunchIntentForPackage(packageName), packageName)
    val phone = essentialIntent(Intent(Intent.ACTION_DIAL, Uri.parse("tel:")))
    addShortcut("Phone", phone, phone?.component?.packageName)
    val contacts = essentialIntent(Intent(Intent.ACTION_VIEW).setType("vnd.android.cursor.dir/contact"))
    addShortcut("Contacts", contacts, contacts?.component?.packageName)
    allowed.sorted().take(2).filter { it !in setOfNotNull(packageName, phone?.component?.packageName, contacts?.component?.packageName) }.forEach { app ->
      val name = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault("Allowed app")
      addShortcut(name, packageManager.getLaunchIntentForPackage(app), app)
    }
    root.addView(apps, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) })
    root.addView(Button(this).apply { text = "Home"; setOnClickListener { hide(); performGlobalAction(GLOBAL_ACTION_HOME) } })
    for (index in 0 until root.childCount) (root.getChildAt(index) as? Button)?.apply {
      isAllCaps = false; textSize = 14f; setTextColor(Color.WHITE)
      background = GradientDrawable().apply { setColor(Color.rgb(31, 31, 31)); cornerRadius = dp(26).toFloat() }
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(10) }
    }
    val params = WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_FULLSCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.OPAQUE)
    params.gravity = Gravity.TOP or Gravity.START
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    root.fitsSystemWindows = false
    root.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    root.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(view: View) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) view.windowInsetsController?.apply {
          systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          hide(WindowInsets.Type.systemBars())
        }
      }
      override fun onViewDetachedFromWindow(view: View) {}
    })
    runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).addView(root, params); overlay = root; renderedTime = ""; updateTimer() }
      .onFailure { error ->
        timer = null
        val message = error.javaClass.simpleName + ": " + error.message.orEmpty()
        if (preferences.getString("overlayError", "") != message) preferences.edit().putString("overlayError", message).apply()
        android.util.Log.e("BuddyFocus", "Could not display Focus Lock overlay", error)
      }
  }
  private fun updateTimer() {
    val row = timer ?: return
    val milliseconds = if (preferences.getBoolean("paused", false)) preferences.getLong("remainingMs", 0) else preferences.getLong("endsAt", 0) - System.currentTimeMillis()
    val seconds = ((milliseconds + 999) / 1000).coerceAtLeast(0)
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
    connected = false
    handler.removeCallbacksAndMessages(null)
    if (::preferences.isInitialized) preferences.unregisterOnSharedPreferenceChangeListener(this)
    hide(); super.onDestroy()
  }
  companion object {
    @Volatile var connected = false
      private set
    @Volatile var lastEventAt = 0L
      private set
    fun prefs(context: Context) = context.getSharedPreferences("buddy-focus-lock", Context.MODE_PRIVATE)
    fun enabled(context: Context): Boolean {
      val expected = ComponentName(context, BuddyFocusService::class.java)
      return Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty().split(':').any { ComponentName.unflattenFromString(it) == expected }
    }
    fun sync(context: Context, id: String, endsAt: Double, accent: String, paused: Boolean = false, remainingMs: Double = 0.0, image: String = "") {
      val p = prefs(context)
      val editor = p.edit().putString("session", id).putLong("endsAt", endsAt.toLong()).putString("accent", accent)
      editor.putBoolean("paused", paused).putLong("remainingMs", remainingMs.toLong())
      if (image.isNotEmpty() || id.isEmpty()) editor.putString("image", image)
      editor.putStringSet("allowed", FocusAppPolicy.forSession(p.getString("session", "").orEmpty(), id, p.getStringSet("allowed", emptySet()).orEmpty()))
      editor.apply()
    }
  }
}
