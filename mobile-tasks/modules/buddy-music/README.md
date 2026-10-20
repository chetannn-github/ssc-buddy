# Android background music

Local Expo module, automatically linked from mobile-tasks/modules. Requires a new development/EAS Android build; Expo Go and older APKs keep the Expo Audio fallback. No new JavaScript dependency is required. Media3 1.9.0 matches expo-audio 57.

BuddyMusicService owns ExoPlayer, the playlist, audio focus and MediaSession. Playback/automatic next continue without JS timers. Notifications publish title, artist, artwork, previous/next, play/pause, seeking and a repeat-one/playlist custom action. Notification taps use sscbuddy://music and restore the active track. Closing the player stops and clears playback; minimizing keeps it playing. Switching away from the music component pauses playback.

Android System UI decides notification layout and which custom actions appear. OEM Island/Live Alerts may consume this media session; visibility depends on the phone/OS and is not guaranteed. This does not create an overlay or claim proprietary OEM integration.

## Verification

- pnpm exec tsc --noEmit (inside mobile-tasks)
- pnpm exec expo-modules-autolinking resolve --platform android (BuddyMusicModule must appear)
- node --test scripts/test-music-queue.mjs scripts/test-music-seek.mjs (repository root)
- pnpm exec expo export --platform android (JavaScript bundle only)

Before release, build the native APK and test on a device: play a playlist, lock the screen, wait for track completion, skip both directions, seek, toggle repeat in the expanded notification, and tap artwork to return without restarting. Check audio focus during calls/other media and unplug headphones. Test close/reopen, switching to video, task removal while playing, and the target phone's Island/Live Alerts. Native compilation and on-device behavior have not been verified in the current environment (Android SDK unavailable).
