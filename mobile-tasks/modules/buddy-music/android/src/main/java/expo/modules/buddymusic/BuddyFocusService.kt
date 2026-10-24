package expo.modules.buddymusic

import android.app.Service
import android.app.AppOpsManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Notification
import android.app.PendingIntent
import android.app.KeyguardManager
import android.app.usage.UsageStatsManager
import android.app.usage.UsageEvents
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.PowerManager
import android.os.Process
import android.content.Context
import android.content.ComponentName
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
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.animation.DecelerateInterpolator
import android.view.animation.TranslateAnimation
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextSwitcher
import android.widget.TextView
import android.widget.ImageView
import android.widget.ScrollView
import android.widget.FrameLayout
import android.view.KeyEvent
import android.graphics.BitmapFactory
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Usage Access + application overlay; this build does not register Accessibility. */
class BuddyFocusService : Service(), SharedPreferences.OnSharedPreferenceChangeListener {
  private val handler = Handler(Looper.getMainLooper())
  private var overlay: View? = null
  private var appPicker: View? = null
  private var pickerClosing = false
  private var timer: LinearLayout? = null
  private var breakButton: Button? = null
  private var rebuildOverlay = false
  private var renderedTime = ""
  private var foreground = ""
  private var protectionState = ""
  private var wasRestricted = false
  private var motivation: ImageView? = null
  private var imageBusy = false
  private val imageWorker = java.util.concurrent.Executors.newSingleThreadExecutor()
  private lateinit var preferences: SharedPreferences
  private val essentials = mutableSetOf<String>()
  private val settingsPackages = mutableSetOf("com.android.settings")
  private val settingsGuard = FocusSettingsGuard()
  private val foregroundTracker = FocusForegroundTracker()
  private var scannedUntil = 0L
  private var lastNotificationState = ""
  private val ticker = object : Runnable {
    override fun run() {
      if (!enabled(this@BuddyFocusService) || !FocusProtection.active(this@BuddyFocusService)) {
        hide(); stopSelf(); return
      }
      finishTimedBreak(this@BuddyFocusService)
      val previousForeground = foreground
      scanForeground()
      val state = "${FocusProtection.active(this@BuddyFocusService)}:${preferences.getLong("endsAt", 0)}:${preferences.getBoolean("paused", false)}:${FocusProtection.enabled(this@BuddyFocusService)}"
      if (state != protectionState) {
        protectionState = state
        FocusProtection.reconcile(this@BuddyFocusService)
      }
      enforce(appSwitch = foreground != previousForeground)
      updateTimer()
      updateBreakButton()
      updateNotification()
      handler.postDelayed(this, 400)
    }
  }
  override fun onCreate() {
    super.onCreate()
    preferences = prefs(this)
    // Existing selections survive an APK upgrade but now occupy payment slots.
    val session = preferences.getString("session", "").orEmpty()
    val selections = FocusPaymentPolicy.forSession(session, session, preferences.getStringSet("allowed", emptySet()).orEmpty(), preferences.getStringSet("paymentAllowed", emptySet()).orEmpty())
    check(preferences.edit().putStringSet("allowed", selections.apps).putStringSet("paymentAllowed", selections.payments).commit())
    connected = true
    FocusSchedules.tick(this)
    FocusSchedules.arm(this)
    preferences.edit().remove("overlayError").apply()
    preferences.registerOnSharedPreferenceChangeListener(this)
    essentials.addAll(setOf(packageName, "android", "com.android.systemui", "com.android.permissioncontroller", "com.google.android.permissioncontroller", "com.android.phone", "com.android.server.telecom", "com.android.emergency", "com.google.android.dialer", "com.android.dialer", "com.samsung.android.dialer", "com.android.contacts", "com.google.android.contacts", "com.samsung.android.app.contacts"))
    // Resolve OEM Settings too, without treating permission controllers as the
    // Settings app. They remain available for normal system permission dialogs.
    val resolvedSettings = runCatching {
      packageManager.queryIntentActivities(Intent(Settings.ACTION_SETTINGS), android.content.pm.PackageManager.MATCH_DEFAULT_ONLY).map { it.activityInfo.packageName }
    }.getOrDefault(emptyList())
    settingsPackages.addAll(FocusSettingsGuard.packages(resolvedSettings))
    essentials.addAll(setOf("com.android.incallui", "com.samsung.android.incallui"))
    runCatching { (getSystemService(TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage?.let(essentials::add) }
    val intents = listOf(Intent(Intent.ACTION_DIAL, Uri.parse("tel:")), Intent(Intent.ACTION_VIEW).setType("vnd.android.cursor.dir/contact"))
    intents.forEach { intent -> packageManager.queryIntentActivities(intent, 0).forEach { essentials.add(it.activityInfo.packageName) } }
    (getSystemService(INPUT_METHOD_SERVICE) as? android.view.inputmethod.InputMethodManager)?.enabledInputMethodList?.forEach { essentials.add(it.packageName) }
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      startFocusNotification()
      if (!enabled(this) || !FocusProtection.active(this)) { stopSelf(); return START_NOT_STICKY }
      handler.removeCallbacks(ticker)
      handler.post(ticker)
    } catch (error: Exception) {
      preferences.edit().putString("overlayError", "Could not start app blocking: ${error.javaClass.simpleName}").apply()
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }
  private fun scanForeground() {
    val now = System.currentTimeMillis()
    if (scannedUntil > now) { scannedUntil = 0; foregroundTracker.reset() }
    val from = FocusForegroundTracker.queryStart(scannedUntil, now)
    runCatching {
      val unlocked = (getSystemService(POWER_SERVICE) as PowerManager).isInteractive && !(getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
      if (!unlocked) { foreground = ""; return@runCatching }
      val events = (getSystemService(USAGE_STATS_SERVICE) as UsageStatsManager).queryEvents(from, now)
        ?: throw IllegalStateException("Usage events unavailable")
      val event = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        // A focusable application overlay may pause its underlying activity on
        // some phones. Wait for a new resumed app rather than hide/re-show in a loop.
        val overlayPausedApp = overlay != null && event.packageName == foregroundTracker.current &&
          event.eventType in setOf(UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED)
        if (!overlayPausedApp && foregroundTracker.event(event.packageName.orEmpty(), event.eventType, event.timeStamp)) lastEventAt = event.timeStamp
      }
      scannedUntil = now
      foreground = foregroundTracker.current
      if (preferences.getString("overlayError", "") == "Could not read app usage events.") preferences.edit().remove("overlayError").apply()
    }.onFailure {
      // A transient query failure cannot remove a currently visible block.
      // Keep the last confirmed foreground and retry the same overlap next tick.
      preferences.edit().putString("overlayError", "Could not read app usage events.").apply()
    }
  }
  private fun notification() = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "focus-lock") else Notification.Builder(this))
    .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
    .setContentTitle("Focus Lock")
    .setContentText(if (preferences.getBoolean("paused", false)) "Break in progress" else "Focus session in progress")
    .setContentIntent(PendingIntent.getActivity(this, 7320,
      packageManager.getLaunchIntentForPackage(packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE).build()
  private fun startFocusNotification() {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("focus-lock", "Focus Lock", NotificationManager.IMPORTANCE_LOW))
    if (Build.VERSION.SDK_INT >= 34) startForeground(7320, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(7320, notification())
    lastNotificationState = preferences.getBoolean("paused", false).toString()
  }
  private fun updateNotification() {
    val state = preferences.getBoolean("paused", false).toString()
    if (state == lastNotificationState) return
    lastNotificationState = state
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(7320, notification())
  }
  private val refreshOverlay = Runnable {
    if (appPicker != null) { enforce(); return@Runnable }
    if (rebuildOverlay) {
      rebuildOverlay = false
      if (overlay != null && shouldBlockForeground()) show(foreground)
    }
    enforce()
    updateBreakButton()
    updateTimer()
  }
  override fun onSharedPreferenceChanged(shared: SharedPreferences?, key: String?) {
    // Break journals, image-cache and admin metadata do not change the visible screen.
    // Batch one preference transaction and preserve the overlay window on pause/resume.
    if (key !in setOf("session", "allowed", "paymentAllowed", "accent", "paused", "endsAt", "remainingMs", "appLimit", "breakUntil", "breakLimit", "breaksTaken", "phaseStartedAt")) return
    if (key in setOf("session", "allowed", "paymentAllowed", "accent", "appLimit")) rebuildOverlay = true
    handler.removeCallbacks(refreshOverlay)
    handler.post(refreshOverlay)
  }
  private fun enforce(appSwitch: Boolean = false) {
    val now = System.currentTimeMillis()
    // A ringing call temporarily hides the overlay; it must be eligible again
    // when the call UI closes, even without a new application launch event.
    val restricted = now < restrictionDeadline() && !isRinging()
    val restrictionStarted = restricted && !wasRestricted
    wasRestricted = restricted
    // Some system Settings screens suppress TYPE_APPLICATION_OVERLAY entirely.
    // Merely retaining an attached overlay does not cover those screens. Return
    // to our own app only after Usage Access actually identifies Settings; keep
    // the overlay in place until Android confirms the real foreground change.
    if (settingsGuard.shouldReturn(foreground, now, restrictionDeadline(), isRinging(), settingsPackages)) {
      runCatching {
        val launch = packageManager.getLaunchIntentForPackage(packageName) ?: error("Main activity unavailable")
        startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
      }.onFailure {
        preferences.edit().putString("overlayError", "Could not return from Settings. Open SSC Buddy to resume blocking.").apply()
      }
    }
    val blocked = shouldBlockForeground()
    if (!blocked) { hide(); return }
    if (overlay != null) return
    if (!FocusWindowPolicy.mayShow(blocked, appSwitch, restrictionStarted)) return
    show(foreground)
  }
  private fun shouldBlockForeground() = FocusAppPolicy.blocks(foreground, System.currentTimeMillis(), restrictionDeadline(), essentials, allowedApps() + paymentApps(), isRinging(), settingsPackages)
  private fun allowedAppLimit() = FocusAppPolicy.appLimit(preferences.getInt("appLimit", 2))
  private fun allowedApps() = preferences.getStringSet("allowed", emptySet()).orEmpty()
    .filterNot { FocusAppPolicy.isSettings(it, settingsPackages) }.toSet()
  private fun paymentApps() = FocusPaymentPolicy.selected(preferences.getStringSet("paymentAllowed", emptySet()).orEmpty(), settingsPackages)
  private fun isRinging() = runCatching { (getSystemService(AUDIO_SERVICE) as AudioManager).mode == AudioManager.MODE_RINGTONE }.getOrDefault(false)
  private fun restrictionDeadline(): Long = FocusBreakPolicy.restrictionDeadline(System.currentTimeMillis(), preferences.getLong("endsAt", 0), preferences.getBoolean("paused", false), preferences.getLong("breakUntil", 0), !preferences.getString("session", "").isNullOrEmpty())
  private fun text(value: String, size: Float, tint: Int = Color.WHITE) = TextView(this).apply {
    text = value; textSize = size; setTextColor(tint); gravity = Gravity.CENTER
    setPadding(dp(10), dp(8), dp(10), dp(8))
  }
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun rotateMotivation() {
    val host = overlay ?: return
    val imageView = motivation ?: return
    if (!host.isAttachedToWindow || !shouldBlockForeground()) return
    val sessionId = preferences.getString("session", "")
    if (imageBusy) return
    imageBusy = true
    imageWorker.execute {
      val bitmap = runCatching {
        val next = FocusImages.next(this, FocusImages.current(this)) ?: return@runCatching null
        BitmapFactory.decodeFile(Uri.parse(next).path, BitmapFactory.Options().apply { inSampleSize = 2 })
      }.getOrNull()
      handler.post {
        imageBusy = false
        // Downloads may finish after an allowed app opens or a new overlay is
        // created. A rotation belongs only to the visible window that requested it.
        if (bitmap != null && overlay === host && motivation === imageView &&
          host.isAttachedToWindow && sessionId == preferences.getString("session", "") && shouldBlockForeground()) {
          imageView.setImageBitmap(bitmap)
        }
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
        // Usage events can arrive a poll later; do not briefly reopen the old
        // app's overlay after the user explicitly launches an allowed app here.
        foregroundTracker.event(this@BuddyFocusService.foreground, 1, System.currentTimeMillis())
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
  private fun showAppPicker(payments: Boolean = false) {
    val host = overlay as? FrameLayout ?: return
    if (appPicker != null) return
    if (!FocusProtection.active(this)) return
    val sessionId = preferences.getString("session", "")
    val selected = if (payments) paymentApps() else allowedApps()
    val limit = if (payments) FocusPaymentPolicy.LIMIT else allowedAppLimit()
    if (selected.size >= limit) return
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(32), dp(20), dp(24)); setBackgroundColor(Color.BLACK)
    }
    val heading = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; orientation = LinearLayout.HORIZONTAL }
    heading.addView(object : View(this) {
      private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; strokeWidth = dp(2).toFloat(); style = android.graphics.Paint.Style.STROKE; strokeCap = android.graphics.Paint.Cap.ROUND; strokeJoin = android.graphics.Paint.Join.ROUND }
      override fun onDraw(canvas: android.graphics.Canvas) {
        super.onDraw(canvas)
        val x = width / 2f; val y = height / 2f
        canvas.drawPath(android.graphics.Path().apply { moveTo(x + dp(5), y - dp(7)); lineTo(x - dp(3), y); lineTo(x + dp(5), y + dp(7)) }, paint)
        canvas.drawLine(x - dp(3), y, x + dp(11), y, paint)
      }
    }.apply { contentDescription = "Back to Focus Lock"; isFocusable = true; setOnClickListener { closeAppPicker() } }, LinearLayout.LayoutParams(dp(48), dp(48)))
    heading.addView(text(if (payments) "Payment apps" else "Allowed apps", 18f).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; setPadding(dp(4), 0, 0, 0) }, LinearLayout.LayoutParams(0, dp(48), 1f))
    heading.addView(text("${selected.size}/$limit", 13f, Color.LTGRAY))
    root.addView(heading, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)))
    val rows = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val launchers = packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0).map { it.activityInfo.packageName }.toSet()
    val installed = packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
      .distinctBy { it.activityInfo.packageName }
      .filter {
        val target = it.activityInfo.packageName
        target !in essentials && target !in allowedApps() && target !in paymentApps() && target !in launchers &&
          !FocusAppPolicy.isSettings(target, settingsPackages) && ((target in FocusPaymentPolicy.packages) == payments)
      }
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
      row.addView(text("+", 24f, Color.WHITE))
      row.setOnClickListener {
        val current = if (payments) paymentApps() else allowedApps()
        if (!FocusProtection.active(this) || preferences.getString("session", "") != sessionId || current.size >= limit) return@setOnClickListener
        if (packageManager.getLaunchIntentForPackage(appPackage) == null) return@setOnClickListener
        val next = if (payments) FocusPaymentPolicy.allow(appPackage, System.currentTimeMillis(), restrictionDeadline(), current, settingsPackages)
          else FocusAppPolicy.allow(appPackage, System.currentTimeMillis(), restrictionDeadline(), current, limit, settingsPackages)
        if (preferences.edit().putStringSet(if (payments) "paymentAllowed" else "allowed", next).commit()) closeAppPicker()
      }
      rows.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
    if (installed.isEmpty()) rows.addView(text(if (payments) "No supported payment apps installed" else "No more apps available", 14f, Color.GRAY))
    root.addView(ScrollView(this).apply { addView(rows); isVerticalScrollBarEnabled = false }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
    val panel = object : FrameLayout(this) {
      private var downX = 0f
      private var downY = 0f
      private var edge = false
      private var dragging = false
      override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
          downX = event.rawX; downY = event.rawY; edge = event.x <= dp(36); dragging = false
        }
        if (edge && event.actionMasked == MotionEvent.ACTION_MOVE && event.rawX - downX > dp(12) && event.rawX - downX > kotlin.math.abs(event.rawY - downY)) dragging = true
        return dragging || super.onInterceptTouchEvent(event)
      }
      override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!dragging) return super.onTouchEvent(event)
        when (event.actionMasked) {
          MotionEvent.ACTION_MOVE -> { animate().cancel(); translationX = (event.rawX - downX).coerceAtLeast(0f) }
          MotionEvent.ACTION_UP -> { if (translationX > width * 0.22f) closeAppPicker() else animate().translationX(0f).setDuration(200).setInterpolator(DecelerateInterpolator()).start(); dragging = false }
          MotionEvent.ACTION_CANCEL -> { animate().translationX(0f).setDuration(200).start(); dragging = false }
        }
        return true
      }
    }.apply {
      setBackgroundColor(Color.BLACK); isFocusableInTouchMode = true
      setOnKeyListener { _, code, event ->
        if (code == KeyEvent.KEYCODE_BACK) { if (event.action == KeyEvent.ACTION_UP) closeAppPicker(); true } else false
      }
      addView(root, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }
    appPicker = panel; pickerClosing = false
    host.addView(panel, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    panel.requestFocus()
    panel.translationX = host.width.coerceAtLeast(resources.displayMetrics.widthPixels).toFloat()
    panel.animate().translationX(0f).setDuration(260).setInterpolator(DecelerateInterpolator(2f)).start()
  }
  private fun closeAppPicker() {
    val panel = appPicker ?: return
    if (pickerClosing) return
    pickerClosing = true
    panel.animate().cancel()
    panel.animate().translationX(panel.width.coerceAtLeast(resources.displayMetrics.widthPixels).toFloat()).setDuration(230).setInterpolator(DecelerateInterpolator(2f)).withEndAction {
      if (appPicker === panel) {
        (panel.parent as? FrameLayout)?.removeView(panel)
        appPicker = null; pickerClosing = false
        handler.post(refreshOverlay)
      }
    }.start()
  }
  private fun show(target: String) {
    // Recheck at the window boundary as refreshes can outlive an app switch.
    if (target != foreground || !shouldBlockForeground()) return
    val accent = runCatching { Color.parseColor(preferences.getString("accent", "#ffe000")) }.getOrDefault(Color.YELLOW)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(24), dp(24), dp(24))
      background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.argb(30, Color.red(accent), Color.green(accent), Color.blue(accent)), Color.BLACK)).apply { setColor(Color.BLACK); colors = intArrayOf(Color.rgb(Color.red(accent) / 10, Color.green(accent) / 10, Color.blue(accent) / 10), Color.BLACK) }
    }
    val image = FocusImages.current(this).ifEmpty { preferences.getString("image", "").orEmpty() }
    val imageView = ImageView(this).apply {
      scaleType = ImageView.ScaleType.FIT_CENTER; contentDescription = "Focus motivation. Double tap to change image"; clipToOutline = true
      background = GradientDrawable().apply { setColor(Color.BLACK); cornerRadius = dp(20).toFloat() }
    }
    val imageGestures = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
      override fun onDown(event: MotionEvent) = true
      override fun onDoubleTap(event: MotionEvent): Boolean { rotateMotivation(); return true }
    })
    imageView.setOnTouchListener { _, event -> imageGestures.onTouchEvent(event) }
    imageView.isFocusable = true
    imageView.accessibilityDelegate = object : View.AccessibilityDelegate() {
      override fun onInitializeAccessibilityNodeInfo(host: View, info: android.view.accessibility.AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(host, info)
        info.addAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK, "Change image"))
      }
      override fun performAccessibilityAction(host: View, action: Int, args: android.os.Bundle?): Boolean {
        if (action == android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK) { rotateMotivation(); return true }
        return super.performAccessibilityAction(host, action, args)
      }
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
    root.addView(Button(this).apply {
      breakButton = this
      text = if (preferences.getBoolean("paused", false)) "Resume focus" else "Take a break"
      setOnClickListener {
        val now = System.currentTimeMillis()
        if (!FocusProtection.active(this@BuddyFocusService)) return@setOnClickListener
        val wasPaused = preferences.getBoolean("paused", false)
        val limit = preferences.getInt("breakLimit", -1)
        if (limit >= 0 && (wasPaused || !FocusBreakPolicy.canBreak(now, preferences.getLong("phaseStartedAt", now), preferences.getLong("endsAt", 0), limit, preferences.getInt("breaksTaken", 0)))) return@setOnClickListener
        val paused = !wasPaused
        val remaining = if (paused) preferences.getLong("endsAt", 0) - now else preferences.getLong("remainingMs", 0)
        if (remaining <= 0) return@setOnClickListener
        val actions = JSONArray(preferences.getString("breakActions", "[]"))
        actions.put(JSONObject().put("id", UUID.randomUUID().toString()).put("lockId", preferences.getString("session", "")).put("at", now).put("paused", paused))
        val edit = preferences.edit().putBoolean("paused", paused).putLong("remainingMs", remaining).putString("breakActions", actions.toString())
        if (limit >= 0) edit.putLong("breakUntil", now + FocusBreakPolicy.DURATION_MS).putInt("breaksTaken", preferences.getInt("breaksTaken", 0) + 1)
        if (!paused) edit.putLong("endsAt", now + remaining).putLong("phaseStartedAt", now)
        if (edit.commit()) { FocusProtection.reconcile(this@BuddyFocusService); enforce() }
      }
    })
    val allowed = allowedApps()
    val apps = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
    fun addShortcut(label: String, intent: Intent?, iconPackage: String? = null) {
      apps.addView(shortcut(label, intent, iconPackage), LinearLayout.LayoutParams(0, dp(98), 1f).apply { setMargins(dp(3), 0, dp(3), 0) })
    }
    addShortcut("SSC Buddy", packageManager.getLaunchIntentForPackage(packageName), packageName)
    val phone = essentialIntent(Intent(Intent.ACTION_DIAL, Uri.parse("tel:")))
    addShortcut("Phone", phone, phone?.component?.packageName)
    allowed.sorted().take(allowedAppLimit()).filter { it !in setOfNotNull(packageName, phone?.component?.packageName) }.forEach { app ->
      val name = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault("Allowed app")
      addShortcut(name, packageManager.getLaunchIntentForPackage(app), app)
    }
    if (allowed.size < allowedAppLimit()) apps.addView(LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; isFocusable = true; contentDescription = "Add allowed app"
      addView(text("+", 36f, accent), LinearLayout.LayoutParams(dp(40), dp(48)))
      addView(text("Add app", 10f, Color.LTGRAY))
      setOnClickListener { showAppPicker() }
    }, LinearLayout.LayoutParams(0, dp(98), 1f))
    val payments = paymentApps()
    payments.sorted().forEach { app ->
      val name = runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault("Payment app")
      addShortcut(name, packageManager.getLaunchIntentForPackage(app), app)
    }
    if (payments.size < FocusPaymentPolicy.LIMIT) apps.addView(LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; isFocusable = true; contentDescription = "Add payment app"
      addView(text("+", 36f, accent), LinearLayout.LayoutParams(dp(40), dp(48)))
      addView(text("Payment app", 10f, Color.LTGRAY).apply { maxLines = 2; setPadding(dp(2), 0, dp(2), 0) })
      setOnClickListener { showAppPicker(payments = true) }
    }, LinearLayout.LayoutParams(0, dp(98), 1f).apply { setMargins(dp(3), 0, dp(3), 0) })
    root.addView(apps, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) })
    for (index in 0 until root.childCount) (root.getChildAt(index) as? Button)?.apply {
      isAllCaps = false; textSize = 14f; setTextColor(Color.rgb(17, 17, 17))
      background = GradientDrawable().apply { setColor(Color.rgb(249, 252, 245)); cornerRadius = dp(26).toFloat() }
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(10) }
    }
    attachOverlay(root)
  }
  private fun attachOverlay(root: View) {
    (overlay as? FrameLayout)?.let { host ->
      host.removeAllViews(); host.addView(root, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
      renderedTime = ""; updateTimer(); return
    }
    val host = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); addView(root, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)) }
    val params = WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_FULLSCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.OPAQUE)
    params.gravity = Gravity.TOP or Gravity.START
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    host.fitsSystemWindows = false
    root.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    host.systemUiVisibility = root.systemUiVisibility
    host.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(view: View) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) view.windowInsetsController?.apply {
          systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          hide(WindowInsets.Type.systemBars())
        }
      }
      override fun onViewDetachedFromWindow(view: View) {}
    })
    runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).addView(host, params); overlay = host; renderedTime = ""; updateTimer() }
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
    val value = if (seconds >= 3600) {
      "%02d:%02d:%02d".format(seconds / 3600, (seconds / 60) % 60, seconds % 60)
    } else {
      "%d:%02d".format(seconds / 60, seconds % 60)
    }
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
  private fun updateBreakButton() {
    val button = breakButton ?: return
    val limit = preferences.getInt("breakLimit", -1)
    if (limit < 0) { button.text = if (preferences.getBoolean("paused", false)) "Resume focus" else "Take a break"; button.isEnabled = true; return }
    val now = System.currentTimeMillis()
    val left = (limit - preferences.getInt("breaksTaken", 0)).coerceAtLeast(0)
    val wait = (FocusBreakPolicy.MIN_FOCUS_MS - (now - preferences.getLong("phaseStartedAt", now))).coerceAtLeast(0)
    button.isEnabled = FocusBreakPolicy.canBreak(now, preferences.getLong("phaseStartedAt", now), preferences.getLong("endsAt", 0), limit, preferences.getInt("breaksTaken", 0)) && !preferences.getBoolean("paused", false)
    button.text = if (left == 0) "No breaks remaining" else if (wait > 0) "Break in " + ((wait + 59999) / 60000) + " min" else "Take a break · 10 min"
    button.alpha = if (button.isEnabled) 1f else 0.45f
  }
  private fun hide() {
    appPicker?.animate()?.cancel(); appPicker = null; pickerClosing = false
    overlay?.let { runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(it) } }
    overlay = null; timer = null; breakButton = null; motivation = null; renderedTime = ""
  }
  override fun onDestroy() {
    connected = false
    imageWorker.shutdownNow()
    handler.removeCallbacksAndMessages(null)
    if (::preferences.isInitialized) preferences.unregisterOnSharedPreferenceChangeListener(this)
    hide(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy()
  }
  companion object {
    @Volatile var connected = false
      private set
    @Volatile var lastEventAt = 0L
      private set
    fun finishTimedBreak(context: Context, now: Long = System.currentTimeMillis()) {
      val p = prefs(context)
      val until = p.getLong("breakUntil", 0)
      if (!p.getBoolean("paused", false) || until <= 0 || now < until) return
      val actions = JSONArray(p.getString("breakActions", "[]"))
      actions.put(JSONObject().put("id", UUID.randomUUID().toString()).put("lockId", p.getString("session", "")).put("at", until).put("paused", false))
      p.edit().putBoolean("paused", false).putLong("endsAt", until + p.getLong("remainingMs", 0))
        .putLong("phaseStartedAt", until).remove("breakUntil").putString("breakActions", actions.toString()).commit()
    }
    fun prefs(context: Context) = context.getSharedPreferences("buddy-focus-lock", Context.MODE_PRIVATE)
    fun enabled(context: Context): Boolean {
      return usageEnabled(context) && Settings.canDrawOverlays(context)
    }
    fun usageEnabled(context: Context): Boolean {
      val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      return runCatching { ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED }.getOrDefault(false)
    }
    fun ensureRunning(context: Context) {
      if (!enabled(context) || !FocusProtection.active(context) || connected) return
      runCatching {
        val intent = Intent(context, BuddyFocusService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      }
        .onFailure { prefs(context).edit().putString("overlayError", "Open SSC Buddy to resume app blocking.").apply() }
    }
    fun sync(context: Context, id: String, endsAt: Double, accent: String, paused: Boolean = false, remainingMs: Double = 0.0, image: String = "", appLimit: Int = 2, breakState: String = "") {
      val p = prefs(context)
      // Local overlay breaks must reach the shared timer before cloud snapshots can replace them.
      if (JSONArray(p.getString("breakActions", "[]")).length() > 0) return
      // Cached empty/sign-out packets cannot clear a still-active offline lock.
      if (FocusProtection.active(context) && id != p.getString("session", "")) return
      val editor = p.edit().putString("session", id).putLong("endsAt", endsAt.toLong()).putString("accent", accent)
      if (p.getString("session", "") != id || !p.contains("appLimit")) editor.putInt("appLimit", FocusAppPolicy.appLimit(appLimit))
      if (breakState.isNotEmpty()) {
        val state = JSONObject(breakState)
        editor.putInt("breakLimit", state.optInt("breakLimit", -1)).putInt("breaksTaken", state.optInt("breaksTaken", 0))
          .putLong("breakUntil", state.optLong("breakUntil", 0)).putLong("phaseStartedAt", state.optLong("startedAt", System.currentTimeMillis()))
      } else if (p.getString("session", "") != id) editor.remove("breakLimit").remove("breaksTaken").remove("breakUntil").remove("phaseStartedAt")
      editor.putBoolean("paused", paused).putLong("remainingMs", remainingMs.toLong())
      if (image.isNotEmpty() || id.isEmpty()) editor.putString("image", image)
      val selections = FocusPaymentPolicy.forSession(p.getString("session", "").orEmpty(), id, p.getStringSet("allowed", emptySet()).orEmpty(), p.getStringSet("paymentAllowed", emptySet()).orEmpty())
      editor.putStringSet("allowed", selections.apps).putStringSet("paymentAllowed", selections.payments)
      check(editor.commit()) { "Could not save the focus unlock deadline on this phone." }
      FocusProtection.reconcile(context)
      ensureRunning(context)
    }
  }
}
