package expo.modules.buddymusic

import android.content.ComponentName
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import org.json.JSONArray

@OptIn(UnstableApi::class)
class BuddyMusicModule : Module() {
  private var controller: MediaController? = null
  private val handler = Handler(Looper.getMainLooper())
  private var observing = false
  private var destroyed = false
  private val listener = object : Player.Listener {
    override fun onEvents(player: Player, events: Player.Events) { emit() }
  }
  private val ticker = object : Runnable {
    override fun run() {
      if (!observing || destroyed) return
      emit()
      handler.postDelayed(this, 500)
    }
  }
  override fun definition() = ModuleDefinition {
    Name("BuddyMusic")
    Events("status")
    AsyncFunction("getFocusLockStatus") {
      val context = requireNotNull(appContext.reactContext)
      val prefs = BuddyFocusService.prefs(context)
      mapOf("enabled" to BuddyFocusService.enabled(context), "allowedCount" to prefs.getStringSet("allowed", emptySet()).orEmpty().size,
        "scheduleAlarmAccess" to FocusSchedules.exactAccess(context),
        "serviceConnected" to BuddyFocusService.connected, "lastEventAt" to BuddyFocusService.lastEventAt,
        "sessionActive" to (prefs.getLong("endsAt", 0) > System.currentTimeMillis() || prefs.getBoolean("paused", false)),
        "unlockAt" to prefs.getLong("endsAt", 0),
        "error" to prefs.getString("overlayError", "").orEmpty())
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("syncFocusLock") { id: String, endsAt: Double, accent: String ->
      BuddyFocusService.sync(requireNotNull(appContext.reactContext), id, endsAt, accent)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("syncFocusState") { id: String, endsAt: Double, accent: String, paused: Boolean, remainingMs: Double, image: String ->
      BuddyFocusService.sync(requireNotNull(appContext.reactContext), id, endsAt, accent, paused, remainingMs, image)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("syncFocusStateWithLimit") { id: String, endsAt: Double, accent: String, paused: Boolean, remainingMs: Double, image: String, appLimit: Int ->
      BuddyFocusService.sync(requireNotNull(appContext.reactContext), id, endsAt, accent, paused, remainingMs, image, appLimit)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("syncFocusStateWithBreaks") { state: String, accent: String, image: String ->
      val value = JSONObject(state)
      BuddyFocusService.sync(requireNotNull(appContext.reactContext), value.optString("lockId", value.optString("id", "")), value.optDouble("endsAt", 0.0), accent, value.optBoolean("paused", false), value.optDouble("remainingMs", 0.0), image, value.optInt("appLimit", 2), state)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("openFocusLockSettings") {
      val context = requireNotNull(appContext.reactContext)
      context.startActivity(android.content.Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("configureFocusSchedules") { uid: String, json: String ->
      FocusSchedules.configure(requireNotNull(appContext.reactContext), uid, json)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("openFocusScheduleSettings") {
      val context = requireNotNull(appContext.reactContext)
      if (android.os.Build.VERSION.SDK_INT >= 31) context.startActivity(android.content.Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readScheduledFocus") {
      BuddyFocusService.prefs(requireNotNull(appContext.reactContext)).getString("scheduledFocusJournal", "[]") ?: "[]"
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("acknowledgeScheduledFocus") { id: String, uid: String ->
      val prefs = BuddyFocusService.prefs(requireNotNull(appContext.reactContext))
      val previous = JSONArray(prefs.getString("scheduledFocusJournal", "[]")), next = JSONArray()
      for (index in 0 until previous.length()) {
        val value = previous.getJSONObject(index)
        if (value.optString("uid") != uid || value.getJSONObject("session").optString("id") != id) next.put(value)
      }
      prefs.edit().putString("scheduledFocusJournal", next.toString()).commit()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("configureFocusImages") { localFiles: String, manifest: String ->
      FocusImages.configure(requireNotNull(appContext.reactContext), localFiles, manifest)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readFocusBreaks") {
      BuddyFocusService.prefs(requireNotNull(appContext.reactContext)).getString("breakActions", "[]") ?: "[]"
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("acknowledgeFocusBreak") { id: String ->
      val prefs = BuddyFocusService.prefs(requireNotNull(appContext.reactContext))
      val actions = JSONArray(prefs.getString("breakActions", "[]"))
      if (actions.length() > 0 && actions.getJSONObject(0).getString("id") == id) {
        actions.remove(0)
        check(prefs.edit().putString("breakActions", actions.toString()).commit()) { "Could not save break sync." }
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("consumeFocusRecall") {
      val prefs = BuddyFocusService.prefs(requireNotNull(appContext.reactContext))
      val requested = prefs.getBoolean("recall", false)
      if (requested) prefs.edit().remove("recall").apply()
      requested
    }.runOnQueue(Queues.MAIN)
    OnStartObserving { handler.post { observing = true; handler.removeCallbacks(ticker); ticker.run() } }
    OnStopObserving { handler.post { observing = false; handler.removeCallbacks(ticker) } }
    AsyncFunction("initialize") { promise: Promise ->
      val existing = controller
      if (existing != null && existing.isConnected) {
        promise.resolve(status())
      } else {
        existing?.removeListener(listener)
        existing?.release()
        controller = null
        val context = requireNotNull(appContext.reactContext)
        val future = MediaController.Builder(context, SessionToken(context, ComponentName(context, BuddyMusicService::class.java))).buildAsync()
        future.addListener({
          try {
            val connected = future.get()
            if (destroyed) { connected.release(); promise.reject("E_CLOSED", "Music player closed", null) }
            else { controller = connected; connected.addListener(listener); promise.resolve(status()); emit() }
          } catch (error: Exception) { promise.reject("E_MUSIC_INIT", "Could not connect to background music", error) }
        }, ContextCompat.getMainExecutor(context))
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("setQueue") { json: String, index: Int ->
      val array = JSONArray(json)
      require(array.length() > 0 && index >= 0 && index < array.length()) { "Invalid music queue" }
      val items = (0 until array.length()).map { position ->
        val track = array.getJSONObject(position)
        val metadata = MediaMetadata.Builder().setTitle(track.getString("title")).setAlbumTitle(track.optString("album", "Music"))
        track.optString("artwork").takeIf { it.isNotBlank() }?.let { metadata.setArtworkUri(Uri.parse(it)) }
        MediaItem.Builder().setMediaId(track.getString("id")).setUri(track.getString("url")).setMediaMetadata(metadata.build()).build()
      }
      requireNotNull(controller).apply { setMediaItems(items, index, 0L); prepare(); play() }
      emit()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("play") { requireNotNull(controller).play(); emit() }.runOnQueue(Queues.MAIN)
    AsyncFunction("pause") { controller?.pause(); emit() }.runOnQueue(Queues.MAIN)
    AsyncFunction("next") { controller?.seekToNextMediaItem(); emit() }.runOnQueue(Queues.MAIN)
    AsyncFunction("previous") { controller?.seekToPreviousMediaItem(); emit() }.runOnQueue(Queues.MAIN)
    AsyncFunction("seekTo") { seconds: Double -> controller?.seekTo((seconds.coerceAtLeast(0.0) * 1000).toLong()); emit() }.runOnQueue(Queues.MAIN)
    AsyncFunction("setRepeat") { single: Boolean -> controller?.repeatMode = if (single) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL; emit() }.runOnQueue(Queues.MAIN)
    AsyncFunction("stop") { controller?.apply { stop(); clearMediaItems() }; emit() }.runOnQueue(Queues.MAIN)
    AsyncFunction("getStatus") { status() }.runOnQueue(Queues.MAIN)
    OnDestroy {
      destroyed = true
      handler.post { observing = false; handler.removeCallbacks(ticker); controller?.removeListener(listener); controller?.release(); controller = null }
    }
  }
  private fun status(): Map<String, Any?> {
    val player = controller
    return mapOf(
      "trackId" to player?.currentMediaItem?.mediaId,
      "playing" to (player?.isPlaying == true),
      "currentTime" to ((player?.currentPosition ?: 0L).coerceAtLeast(0L) / 1000.0),
      "duration" to ((player?.duration ?: C.TIME_UNSET).coerceAtLeast(0L) / 1000.0),
      "repeat" to (player?.repeatMode == Player.REPEAT_MODE_ONE),
      "isLoaded" to (player?.playbackState == Player.STATE_READY),
      "error" to player?.playerError?.message
    )
  }
  private fun emit() { if (observing && !destroyed) sendEvent("status", status()) }
}
