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
        val metadata = MediaMetadata.Builder().setTitle(track.getString("title")).setArtist("SSC Buddy").setAlbumTitle(track.optString("album", "Music"))
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
