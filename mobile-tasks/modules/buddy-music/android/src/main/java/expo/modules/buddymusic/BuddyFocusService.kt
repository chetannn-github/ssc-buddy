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
import android.media.AudioManager
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
import android.widget.ScrollView
import android.graphics.BitmapFactory
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Only observes foreground package names; never requests screen/view contents. */
class BuddyFocusService : AccessibilityService(), SharedPreferences.OnSharedPreferenceChangeListener {
  private val handler = Handler(Looper.getMainLooper())
  private var overlay: View? = null
  private var timer: LinearLayout? = null
  private var renderedTime = ""
  private var foreground = ""
  private var protectionState = ""
  private var motivation: ImageView? = null
  private var lastImageRotation = -60000L
  private var imageBusy = false
  private val imageWorker = java.util.concurrent.Executors.newSingleThreadExecutor()
  private lateinit var preferences: SharedPreferences
  private val essentials = mutableSetOf<String>()
  private val ticker = object : Runnable {
    override fun run() {
      val state = "${FocusProtection.active(this@BuddyFocusService)}:${preferences.getLong("endsAt", 0)}:${preferences.getBoolean("paused", false)}:${FocusProtection.enabled(this@BuddyFocusService)}"
      if (state != protectionState) {
        protectionState = state
        FocusProtection.reconcile(this@BuddyFocusService)
      }
      enforce()
      updateTimer()
      rotateMotivation()
      handler.postDelayed(this, if (overlay == null) 1000 else 250)
    }
  }
  override fun onServiceConnected() {
    preferences = prefs(this)
    connected = true
    preferences.edit().remove("overlayError").apply()
    preferences.registerOnSharedPreferenceChangeListener(this)
    essentials.addAll(setOf(packageName, "android", "com.android.systemui", "com.android.settings", "com.android.permissioncontroller", "com.google.android.permissioncontroller", "com.android.phone", "com.android.server.telecom", "com.android.emergency", "com.google.android.dialer", "com.android.dialer", "com.samsung.android.dialer", "com.android.contacts", "com.google.android.contacts", "com.samsung.android.app.contacts"))
    essentials.addAll(setOf("com.android.incallui", "com.samsung.android.incallui"))
    runCatching { (getSystemService(TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage?.let(essentials::add) }
    val intents = listOf(Intent(Intent.ACTION_DIAL, Uri.parse("tel:")), Intent(Intent.ACTION_VIEW).setType("vnd.android.cursor.dir/contact"))
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
    // Keep the focus screen in place while Android displays transient system UI.
    if (target == "com.android.systemui") {
      if (isRinging()) hide()
      return // Preserve the underlying app so its lock returns after ringing stops.
    }
    this@BuddyFocusService.foreground = target
    enforce()
  }
  override fun onSharedPreferenceChanged(shared: SharedPreferences?, key: String?) { handler.post { hide(); enforce() } }
  private fun enforce() {
    if (!FocusAppPolicy.blocks(foreground, System.currentTimeMillis(), restrictionDeadline(), essentials, preferences.getStringSet("allowed", emptySet()).orEmpty(), isRinging())) { hide(); return }
    if (overlay != null) return
    show(foreground)
  }
  private fun isRinging() = runCatching { (getSystemService(AUDIO_SERVICE) as AudioManager).mode == AudioManager.MODE_RINGTONE }.getOrDefault(false)
  private fun restrictionDeadline(): Long = if (preferences.getBoolean("paused", false) && !preferences.getString("session", "").isNullOrEmpty()) Long.MAX_VALUE else preferences.getLong("endsAt", 0)
  private fun text(value: String, size: Float, tint: Int = Color.WHITE) = TextView(this).apply {
    text = value; textSize = size; setTextColor(tint); gravity = Gravity.CENTER
    setPadding(dp(10), dp(8), dp(10), dp(8))
  }
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun rotateMotivation() {
    if (motivation == null) return
    val now = android.os.SystemClock.elapsedRealtime()
    if (imageBusy || now - lastImageRotation < 60000) return
    imageBusy = true; lastImageRotation = now
    imageWorker.execute {
      val bitmap = runCatching {
        val next = FocusImages.next(this, FocusImages.current(this)) ?: return@runCatching null
        BitmapFactory.decodeFile(Uri.parse(next).path, BitmapFactory.Options().apply { inSampleSize = 2 })
      }.getOrNull()
      handler.post {
        imageBusy = false
        if (bitmap != null) motivation?.setImageBitmap(bitmap)
      }
    }
  }
  private fun shortcut(label: String, intent: Intent?, iconPackage: String? = null): View {
    val tile = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
      setPadding(dp(2), dp(10), dp(2), dp(8))
      contentDescription = "Open $label"; isEnabled = intent != null
      alpha = if (intent != null) 1f else 0.4f
      isFocusable = true
    }
    tile.addView(ImageView(this).apply {
      val icon = runCatching {
        if (iconPackage != null) packageManager.getApplicationIcon(iconPackage)
        else if (intent != null) packageManager.getActivityIcon(intent) else null
      }.getOrNull()
      if (icon != null) setImageDrawable(icon) else setImageResource(android.R.drawable.sym_def_app_icon)
      scaleType = ImageView.ScaleType.FIT_CENTER; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      clipToOutline = true
      outlineProvider = object : android.view.ViewOutlineProvider() {
        override fun getOutline(view: View, outline: android.graphics.Outline) {
          outline.setRoundRect(0, 0, view.width, view.height, dp(11).toFloat())
        }
      }
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
        this@BuddyFocusService.foreground = iconPackage ?: intent.`package` ?: packageName
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
  private fun showAppPicker() {
    if (!FocusProtection.active(this)) return
    val sessionId = preferences.getString("session", "")
    val accent = runCatching { Color.parseColor(preferences.getString("accent", "#ffe000")) }.getOrDefault(Color.YELLOW)
    val selected = preferences.getStringSet("allowed", emptySet()).orEmpty()
    if (selected.size >= 2) return
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(32), dp(20), dp(24)); setBackgroundColor(Color.BLACK)
    }
    root.addView(Button(this).apply {
      text = "‹  Allowed apps · ${selected.size}/2"; isAllCaps = false; setTextColor(Color.WHITE)
      setBackgroundColor(Color.TRANSPARENT)
      setOnClickListener { hide(); enforce() }
    })
    val rows = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val launchers = packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0).map { it.activityInfo.packageName }.toSet()
    val installed = packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
      .distinctBy { it.activityInfo.packageName }
      .filter { it.activityInfo.packageName !in essentials && it.activityInfo.packageName !in selected && it.activityInfo.packageName !in launchers }
      .sortedBy { it.loadLabel(packageManager).toString().lowercase() }
    installed.forEach { app ->
      val appPackage = app.activityInfo.packageName
      val label = app.loadLabel(packageManager).toString()
      val row = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(8), dp(10), dp(8), dp(10)); isFocusable = true
        contentDescription = "Allow $label for this session"
      }
      row.addView(ImageView(this).apply { setImageDrawable(app.loadIcon(packageManager)); scaleType = ImageView.ScaleType.FIT_CENTER }, LinearLayout.LayoutParams(dp(40), dp(40)))
      row.addView(text(label, 14f).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; maxLines = 2 }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      row.addView(text("+", 24f, accent))
      row.setOnClickListener {
        val current = preferences.getStringSet("allowed", emptySet()).orEmpty()
        if (!FocusProtection.active(this) || preferences.getString("session", "") != sessionId || current.size >= 2) return@setOnClickListener
        if (packageManager.getLaunchIntentForPackage(appPackage) == null) return@setOnClickListener
        val next = FocusAppPolicy.allow(appPackage, System.currentTimeMillis(), restrictionDeadline(), current)
        if (preferences.edit().putStringSet("allowed", next).commit()) { hide(); enforce() }
      }
      rows.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
    if (installed.isEmpty()) rows.addView(text("No more apps available", 14f, Color.GRAY))
    root.addView(ScrollView(this).apply { addView(rows); isVerticalScrollBarEnabled = false }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
    hide()
    attachOverlay(root)
  }
  private fun show(target: String) {
    val accent = runCatching { Color.parseColor(preferences.getString("accent", "#ffe000")) }.getOrDefault(Color.YELLOW)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(24), dp(24), dp(24))
      background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.argb(30, Color.red(accent), Color.green(accent), Color.blue(accent)), Color.BLACK)).apply { setColor(Color.BLACK); colors = intArrayOf(Color.rgb(Color.red(accent) / 10, Color.green(accent) / 10, Color.blue(accent) / 10), Color.BLACK) }
    }
    val image = FocusImages.current(this).ifEmpty { preferences.getString("image", "").orEmpty() }
    val imageView = ImageView(this).apply {
      scaleType = ImageView.ScaleType.FIT_CENTER; contentDescription = "Focus motivation"; clipToOutline = true
      background = GradientDrawable().apply { setColor(Color.BLACK); cornerRadius = dp(20).toFloat() }
    }
    if (image.startsWith("file:")) runCatching {
      val bitmap = BitmapFactory.decodeFile(Uri.parse(image).path, BitmapFactory.Options().apply { inSampleSize = 2 })
      if (bitmap != null) imageView.setImageBitmap(bitmap)
    }
    motivation = imageView
    root.addView(imageView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f).apply { setMargins(0, dp(18), 0, dp(18)) })
    root.addView(text("Focus Lock", 16f, accent))
    root.addView(text("Your goals deserve this time.", 24f))
    timer = LinearLayout(this).apply { gravity = Gravity.CENTER }
    root.addView(timer)
    val label = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(target, 0)).toString() }.getOrDefault("This app")
    root.addView(text("$label is paused for your focus session", 15f, Color.LTGRAY))
    root.addView(Button(this).apply {
      text = if (preferences.getBoolean("paused", false)) "Resume focus" else "Take a break"
      setOnClickListener {
        val now = System.currentTimeMillis()
        if (!FocusProtection.active(this@BuddyFocusService)) return@setOnClickListener
        val paused = !preferences.getBoolean("paused", false)
        val remaining = if (paused) preferences.getLong("endsAt", 0) - now else preferences.getLong("remainingMs", 0)
        if (remaining <= 0) return@setOnClickListener
        val actions = JSONArray(preferences.getString("breakActions", "[]"))
        actions.put(JSONObject().put("id", UUID.randomUUID().toString()).put("lockId", preferences.getString("session", "")).put("at", now).put("paused", paused))
        val edit = preferences.edit().putBoolean("paused", paused).putLong("remainingMs", remaining).putString("breakActions", actions.toString())
        if (!paused) edit.putLong("endsAt", now + remaining)
        if (edit.commit()) FocusProtection.reconcile(this@BuddyFocusService)
      }
    })
    val allowed = preferences.getStringSet("allowed", emptySet()).orEmpty()
    val apps = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
    fun addShortcut(label: String, intent: Intent?, iconPackage: String? = null) {
      apps.addView(shortcut(label, intent, iconPackage), LinearLayout.LayoutParams(0, dp(98), 1f).apply { setMargins(dp(3), 0, dp(3), 0) })
    }
    addShortcut("SSC Buddy", packageManager.getLaunchIntentForPackage(packageName), packageName)
    val phone = essentialIntent(Intent(Intent.ACTION_DIAL, Uri.parse("tel:")))
    addShortcut("Phone", phone, phone?.component?.packageName)
    allowed.sorted().take(2).filter { it !in setOfNotNull(packageName, phone?.component?.packageName) }.forEach { app ->
      val name = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault("Allowed app")
      addShortcut(name, packageManager.getLaunchIntentForPackage(app), app)
    }
    if (allowed.size < 2) apps.addView(LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; isFocusable = true; contentDescription = "Add allowed app"
      addView(text("+", 36f, accent), LinearLayout.LayoutParams(dp(40), dp(48)))
      addView(text("Add app", 10f, Color.LTGRAY))
      setOnClickListener { showAppPicker() }
    }, LinearLayout.LayoutParams(0, dp(98), 1f))
    root.addView(apps, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) })
    for (index in 0 until root.childCount) (root.getChildAt(index) as? Button)?.apply {
      isAllCaps = false; textSize = 14f; setTextColor(Color.WHITE)
      background = GradientDrawable().apply { setColor(Color.rgb(31, 31, 31)); cornerRadius = dp(26).toFloat() }
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(10) }
    }
    attachOverlay(root)
  }
  private fun attachOverlay(root: View) {
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
    overlay = null; timer = null; motivation = null; renderedTime = ""
  }
  override fun onInterrupt() { hide() }
  override fun onDestroy() {
    connected = false
    imageWorker.shutdownNow()
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
      // Local overlay breaks must reach the shared timer before cloud snapshots can replace them.
      if (JSONArray(p.getString("breakActions", "[]")).length() > 0) return
      // Cached empty/sign-out packets cannot clear a still-active offline lock.
      if (FocusProtection.active(context) && id != p.getString("session", "")) return
      val editor = p.edit().putString("session", id).putLong("endsAt", endsAt.toLong()).putString("accent", accent)
      editor.putBoolean("paused", paused).putLong("remainingMs", remainingMs.toLong())
      if (image.isNotEmpty() || id.isEmpty()) editor.putString("image", image)
      editor.putStringSet("allowed", FocusAppPolicy.forSession(p.getString("session", "").orEmpty(), id, p.getStringSet("allowed", emptySet()).orEmpty()))
      check(editor.commit()) { "Could not save the focus unlock deadline on this phone." }
      FocusProtection.reconcile(context)
    }
  }
}
