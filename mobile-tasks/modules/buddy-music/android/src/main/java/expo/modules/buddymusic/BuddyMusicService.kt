package expo.modules.buddymusic

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/** The service owns the queue: transport commands never depend on the JS thread. */
@OptIn(UnstableApi::class)
class BuddyMusicService : MediaSessionService() {
  private var session: MediaSession? = null
  private lateinit var player: ExoPlayer

  override fun onCreate() {
    super.onCreate()
    player = ExoPlayer.Builder(this).build().apply {
      setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
      setHandleAudioBecomingNoisy(true)
      setWakeMode(C.WAKE_MODE_LOCAL)
      repeatMode = Player.REPEAT_MODE_ALL
    }
    val builder = MediaSession.Builder(this, player).setId("ssc-buddy-music").setCallback(object : MediaSession.Callback {
      override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
        // Only the app and trusted system media controllers may operate this private queue.
        if (controller.packageName != packageName && !controller.isTrusted) return MediaSession.ConnectionResult.reject()
        return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
          .setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(SessionCommand(REPEAT, Bundle.EMPTY)).build())
          .build()
      }
      override fun onCustomCommand(session: MediaSession, controller: MediaSession.ControllerInfo, command: SessionCommand, args: Bundle): ListenableFuture<SessionResult> {
        if (command.customAction != REPEAT) return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED))
        player.repeatMode = if (player.repeatMode == Player.REPEAT_MODE_ONE) Player.REPEAT_MODE_ALL else Player.REPEAT_MODE_ONE
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }
    })
    packageManager.getLaunchIntentForPackage(packageName)?.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("sscbuddy://music")
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }?.let { builder.setSessionActivity(PendingIntent.getActivity(this, 814, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)) }
    session = builder.build()
    player.addListener(object : Player.Listener {
      override fun onRepeatModeChanged(repeatMode: Int) { updateButtons() }
    })
    updateButtons()
  }

  private fun updateButtons() {
    val repeatEnabled = player.repeatMode == Player.REPEAT_MODE_ONE
    val buttons = listOf(
      CommandButton.Builder(CommandButton.ICON_PREVIOUS).setDisplayName("Previous song").setPlayerCommand(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM).setSlots(CommandButton.SLOT_BACK).build(),
      CommandButton.Builder(CommandButton.ICON_NEXT).setDisplayName("Next song").setPlayerCommand(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM).setSlots(CommandButton.SLOT_FORWARD).build(),
      CommandButton.Builder(CommandButton.ICON_REPEAT_ALL)
        .setDisplayName(if (repeatEnabled) "Repeat: on" else "Repeat: off")
        .setSessionCommand(SessionCommand(REPEAT, Bundle.EMPTY)).setSlots(CommandButton.SLOT_OVERFLOW).build()
    )
    session?.setCustomLayout(buttons)
    session?.setMediaButtonPreferences(buttons)
  }
  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session
  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
  }
  override fun onDestroy() {
    session?.release()
    session = null
    player.release()
    super.onDestroy()
  }
  companion object { const val REPEAT = "ssc-buddy.music.REPEAT" }
}
