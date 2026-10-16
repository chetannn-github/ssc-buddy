import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { User } from "firebase/auth";
import { requestNotificationPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Constants, { AppOwnership } from "expo-constants";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, DeviceEventEmitter, Easing, FlatList, Image, Modal, NativeModules, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { musicCover, musicSource, musicTracks, trackTitle, videoSource, videoTracks } from "../lib/media";
import { colors } from "../theme";
import { subscribeBottomNavigation } from "../navigation/bottomNavigationVisibility";
import { patchCloudPreferences, watchCloudPreferences } from "../lib/firebase";

export type MediaMode = "video" | "music" | null;
type NativeMusicPlayer = {
  CAPABILITY_PLAY: number; CAPABILITY_PAUSE: number; CAPABILITY_SEEK_TO: number; CAPABILITY_SKIP_TO_NEXT: number; CAPABILITY_SKIP_TO_PREVIOUS: number;
  REPEAT_TRACK: number; REPEAT_QUEUE: number; STATE_PLAYING: string;
  setupPlayer: (options: Record<string, unknown>) => Promise<void>; updateOptions: (options: Record<string, unknown>) => Promise<void>;
  reset: () => Promise<void>; add: (tracks: Record<string, unknown>[]) => Promise<void>; setRepeatMode: (mode: number) => Promise<void>;
  play: () => Promise<void>; pause: () => Promise<void>; skip: (index: number) => Promise<void>; skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>; seekTo: (position: number) => Promise<void>; getPlaybackState: () => Promise<{ state: string }>;
  getProgress: () => Promise<{ position: number; duration: number; buffered: number }>;
};
// Avoid importing react-native-track-player in JS: Expo Go has no native
// module for it and the package reads native constants during import.
const nativeMusicPlayer = NativeModules.TrackPlayerModule as NativeMusicPlayer | undefined;
const nativeMusicEvents = { playbackState: "playback-state", activeTrackChanged: "playback-active-track-changed" } as const;
const playlistName = (track: string) => decodeURIComponent(track).split("/").slice(0, -1).join(" / ") || "Music";
/** Keep liked media first, while preserving the source order inside each group. */
const prioritizeLikes = (items: string[], likes: Set<string>) => {
  return [...items].sort((left, right) => Number(likes.has(right)) - Number(likes.has(left)));
};
const reelIndexFor = (track: string, tracks: string[], firstReelPage: number) => {
  const offset = tracks.indexOf(track);
  if (offset < 0 || !tracks.length) return firstReelPage;
  const base = firstReelPage - (firstReelPage % tracks.length);
  return base + offset;
};

export function MediaOverlay({ user, mode, onClose, musicOpenRequest }: { user: User | null; mode: MediaMode; onClose: () => void; musicOpenRequest: number }) {
  if (mode === "video") return <VideoReels user={user} onClose={onClose} />;
  if (mode === "music") return <MusicPlayer user={user} onClose={onClose} openRequest={musicOpenRequest} />;
  return null;
}

function VideoReels({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const [swiping, setSwiping] = useState(false);
  const [likes, toggleLike, likesReady] = useCloudLikes(user, "ssc-buddy-liked-videos");
  // Apply the liked-first order once when this overlay opens. Reordering after a
  // heart tap changes FlatList's pages and recreates the active native video.
  const [orderedTracks, setOrderedTracks] = useState(() => [...videoTracks]);
  const [orderReady, setOrderReady] = useState(false);
  const likedOrderApplied = useRef(false);
  const reelPages = useMemo(
    () => Array.from({ length: orderedTracks.length * 400 }, (_, index) => ({ id: index, track: orderedTracks[index % orderedTracks.length] })),
    [orderedTracks],
  );
  const firstReelPage = Math.floor(reelPages.length / 2);
  const [index, setIndex] = useState(firstReelPage);
  const reelsRef = useRef<FlatList<{ id: number; track: string }>>(null);
  const initialPickApplied = useRef(false);
  useEffect(() => {
    if (!likesReady || likedOrderApplied.current) return;
    likedOrderApplied.current = true;
    setOrderedTracks(prioritizeLikes(videoTracks, likes));
    setOrderReady(true);
  }, [likes, likesReady]);
  useEffect(() => {
    if (!orderReady || initialPickApplied.current) return;
    initialPickApplied.current = true;
    const track = orderedTracks[0];
    if (!track) return;
    const next = reelIndexFor(track, orderedTracks, firstReelPage);
    setIndex(next);
    requestAnimationFrame(() => reelsRef.current?.scrollToIndex({ index: next, animated: false }));
  }, [firstReelPage, orderReady, orderedTracks]);
  return <Modal visible animationType="slide" onRequestClose={onClose}><View style={styles.reel}>
    <FlatList ref={reelsRef} data={reelPages} keyExtractor={(item) => String(item.id)} pagingEnabled showsVerticalScrollIndicator={false} initialScrollIndex={firstReelPage} getItemLayout={(_, itemIndex) => ({ length: height, offset: height * itemIndex, index: itemIndex })} initialNumToRender={2} maxToRenderPerBatch={2} windowSize={2} removeClippedSubviews onScrollBeginDrag={() => setSwiping(true)} onScrollEndDrag={(event) => { if (!event.nativeEvent.velocity?.y) setSwiping(false); }} onMomentumScrollEnd={(event) => { setIndex(Math.round(event.nativeEvent.contentOffset.y / height)); setSwiping(false); }} renderItem={({ item, index: itemIndex }) => index === itemIndex ? <ReelPage track={item.track} active height={height} onClose={onClose} liked={likes.has(item.track)} swiping={swiping} onToggleLike={() => toggleLike(item.track)} /> : <View style={[styles.reel, { height, flex: 0 }]} />} />
  </View></Modal>;
}

function ReelPage({ track, active, height, onClose, liked, swiping, onToggleLike }: { track: string; active: boolean; height: number; onClose: () => void; liked: boolean; swiping: boolean; onToggleLike: () => void }) {
  const { width } = useWindowDimensions();
  const [speeding, setSpeeding] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [playbackFeedback, setPlaybackFeedback] = useState<"play" | "pause" | "heart" | null>(null);
  const [feedbackPoint, setFeedbackPoint] = useState<{ x: number; y: number } | null>(null);
  const longPressRef = useRef(false);
  const pausedByLongPressRef = useRef(false);
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const heartWiggle = useRef(new Animated.Value(0)).current;
  const heartTravel = useRef(new Animated.Value(0)).current;
  const source = videoSource(track);
  const player = useVideoPlayer(source, (item) => {
    item.loop = true;
    // Android's native player defaults this to false despite the public API
    // default. Keep pitch at 1× so a long-press 2× reel sounds natural.
    item.preservesPitch = true;
  });
  useEffect(() => {
    if (active) player.play(); else player.pause();
  }, [active, player]);
  useEffect(() => {
    player.timeUpdateEventInterval = 0.2;
    const subscription = player.addListener("timeUpdate", ({ currentTime }) => setVideoTime(currentTime));
    return () => subscription.remove();
  }, [player]);
  useEffect(() => () => { if (singleTapTimer.current) clearTimeout(singleTapTimer.current); }, []);
  const progress = player.duration > 0 ? Math.max(0, Math.min(1, videoTime / player.duration)) : 0;
  const startFastForward = () => {
    longPressRef.current = true;
    setSpeeding(true);
    player.preservesPitch = true;
    player.playbackRate = 2;
  };
  const stopFastForward = () => {
    setSpeeding(false);
    player.playbackRate = 1;
  };
  const togglePlayback = () => {
    const pausing = player.playing;
    pausing ? player.pause() : player.play();
    setPlaybackFeedback(pausing ? "pause" : "play");
    feedbackOpacity.stopAnimation();
    feedbackOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(feedbackOpacity, { toValue: 1, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(feedbackOpacity, { toValue: 0, duration: 340, delay: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setPlaybackFeedback(null); });
  };
  const pauseFromLongPress = () => {
    longPressRef.current = true;
    pausedByLongPressRef.current = true;
    player.pause();
  };
  const showLikeFeedback = () => {
    setPlaybackFeedback("heart");
    feedbackOpacity.stopAnimation();
    feedbackOpacity.setValue(0);
    heartWiggle.setValue(0);
    heartTravel.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(feedbackOpacity, { toValue: 1, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(feedbackOpacity, { toValue: 0, duration: 340, delay: 360, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(heartWiggle, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(heartTravel, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setPlaybackFeedback(null); });
  };
  const handleVideoTap = (x: number, y: number) => {
    if (longPressRef.current) { longPressRef.current = false; return; }
    const now = Date.now();
    if (now - lastTapAt.current < 260) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
      lastTapAt.current = 0;
      setFeedbackPoint({ x, y });
      if (!liked) onToggleLike();
      showLikeFeedback();
      return;
    }
    lastTapAt.current = now;
    singleTapTimer.current = setTimeout(() => { lastTapAt.current = 0; togglePlayback(); }, 230);
  };
  return <View style={[styles.reel, { height, flex: 0 }]}>
    <VideoView style={styles.video} player={player} nativeControls={false} contentFit="contain" />
    <View pointerEvents="none" style={styles.reelShade} />
    {!swiping && <Pressable style={styles.close} onPress={onClose}><MaterialCommunityIcons name="close" size={24} color={colors.text} /></Pressable>}
    <Pressable style={styles.videoTap} delayLongPress={280} onLongPress={(event) => { if (event.nativeEvent.locationY <= height * 0.3) startFastForward(); else pauseFromLongPress(); }} onPressOut={() => { if (pausedByLongPressRef.current) { pausedByLongPressRef.current = false; player.play(); } else stopFastForward(); }} onPress={(event) => handleVideoTap(event.nativeEvent.locationX, event.nativeEvent.locationY)} />
    {playbackFeedback && <Animated.View pointerEvents="none" style={[styles.playbackFeedback, playbackFeedback === "heart" && styles.likeFeedback, playbackFeedback === "heart" && feedbackPoint ? { left: feedbackPoint.x - 48, top: feedbackPoint.y - 48, marginLeft: 0, marginTop: 0 } : null, { opacity: feedbackOpacity, transform: playbackFeedback === "heart" ? [{ scale: feedbackOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.12] }) }, { rotate: heartWiggle.interpolate({ inputRange: [0, 0.36, 0.68, 1], outputRange: ["0deg", "-10deg", "8deg", "0deg"] }) }, { translateX: heartTravel.interpolate({ inputRange: [0, 1], outputRange: [0, feedbackPoint ? width / 2 - feedbackPoint.x : 0] }) }, { translateY: heartTravel.interpolate({ inputRange: [0, 1], outputRange: [0, feedbackPoint ? height / 2 - feedbackPoint.y : 0] }) }] : [{ scale: feedbackOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) }] }]}><MaterialCommunityIcons name={playbackFeedback} size={playbackFeedback === "heart" ? 82 : 34} color={playbackFeedback === "heart" ? "#ef4444" : "#fff"} /></Animated.View>}
    {speeding && <View pointerEvents="none" style={styles.speedBadge}><Text style={styles.speedText}>2×</Text></View>}
    <View style={styles.reelControls}><Pressable style={styles.round} onPress={onToggleLike}><MaterialCommunityIcons name={liked ? "heart" : "heart-outline"} size={23} color={liked ? "#fb7185" : colors.text} /></Pressable></View>
    {!swiping && <View pointerEvents="none" style={styles.videoProgressTrack}><View style={[styles.videoProgressFill, { width: `${progress * 100}%` }]} /></View>}
  </View>;
}

function MusicPlayer({ user, onClose, openRequest }: { user: User | null; onClose: () => void; openRequest: number }) {
  const [index, setIndex] = useState(0);
  const [likes, toggleLike, likesReady] = useCloudLikes(user, "ssc-buddy-liked-music");
  const initialPickApplied = useRef(false);
  const likedOrderApplied = useRef(false);
  const [repeat, setRepeat] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState(() => playlistName(musicTracks[0] ?? ""));
  const [minimized, setMinimized] = useState(false);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playbackState, setPlaybackState] = useState<string>("");
  const [playbackProgress, setPlaybackProgress] = useState({ position: 0, duration: 0, buffered: 0 });
  const fallbackPlayer = useAudioPlayer(null, { updateInterval: 300 });
  const fallbackStatus = useAudioPlayerStatus(fallbackPlayer);
  const artworkSpin = useRef(new Animated.Value(0)).current;
  const miniLift = useRef(new Animated.Value(0)).current;
  const artworkAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const shouldSpin = useRef(false);
  const activeTrack = musicTracks[index] ?? musicTracks[0];
  // Same as reels: keep the in-session queue fixed so a heart tap never
  // rebuilds playlists or interferes with the currently playing audio.
  const [orderedTracks, setOrderedTracks] = useState(() => [...musicTracks]);
  const [orderReady, setOrderReady] = useState(false);
  const playlists = useMemo(() => [...new Set(orderedTracks.map(playlistName))], [orderedTracks]);
  const visibleTracks = useMemo(() => orderedTracks.filter((track) => playlistName(track) === selectedPlaylist), [orderedTracks, selectedPlaylist]);
  const playingPlaylistTracks = useMemo(() => orderedTracks.filter((track) => playlistName(track) === playlistName(activeTrack ?? "")), [activeTrack, orderedTracks]);
  const liked = likes.has(activeTrack);
  const discSize = 112;
  const cover = musicCover(activeTrack);
  // Expo Go cannot include this project's custom foreground media service.
  // A development/standalone build receives the service from the expo-audio plugin.
  const supportsBackgroundControls = Constants.appOwnership !== AppOwnership.Expo;
  const usingNativeQueue = Boolean(nativeMusicPlayer);
  const isPlaying = usingNativeQueue ? playbackState === nativeMusicPlayer?.STATE_PLAYING : fallbackStatus.playing;
  useEffect(() => {
    if (!likesReady || likedOrderApplied.current) return;
    likedOrderApplied.current = true;
    setOrderedTracks(prioritizeLikes(musicTracks, likes));
    setOrderReady(true);
  }, [likes, likesReady]);
  useEffect(() => {
    if (!orderReady || initialPickApplied.current) return;
    initialPickApplied.current = true;
    const initial = orderedTracks[0];
    if (!initial) return;
    const nextIndex = musicTracks.indexOf(initial);
    if (nextIndex >= 0) {
      setIndex(nextIndex);
      setSelectedPlaylist(playlistName(initial));
    }
  }, [orderReady, orderedTracks]);
  useEffect(() => { if (openRequest) setMinimized(false); }, [openRequest]);
  useEffect(() => subscribeBottomNavigation(setBottomNavVisible), []);
  useEffect(() => {
    Animated.timing(miniLift, { toValue: bottomNavVisible ? -64 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [bottomNavVisible, miniLift]);
  const fallbackSource = musicSource(activeTrack);
  useEffect(() => {
    if (!nativeMusicPlayer) return;
    const syncState = () => { void nativeMusicPlayer.getPlaybackState().then((value) => setPlaybackState(value.state)).catch(() => undefined); };
    const syncProgress = () => { void nativeMusicPlayer.getProgress().then(setPlaybackProgress).catch(() => undefined); };
    syncState();
    syncProgress();
    const playbackSubscription = DeviceEventEmitter.addListener(nativeMusicEvents.playbackState, (event: { state?: string }) => setPlaybackState(event?.state ?? ""));
    const trackSubscription = DeviceEventEmitter.addListener(nativeMusicEvents.activeTrackChanged, (event: { track?: { id?: string } }) => {
      const nextIndex = musicTracks.indexOf(event?.track?.id ?? "");
      if (nextIndex >= 0) setIndex(nextIndex);
      syncProgress();
    });
    const timer = setInterval(syncProgress, 300);
    return () => { playbackSubscription.remove(); trackSubscription.remove(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (usingNativeQueue) return;
    try { fallbackPlayer.replace(fallbackSource); fallbackPlayer.play(); } catch {}
  }, [fallbackPlayer, fallbackSource, usingNativeQueue]);
  useEffect(() => {
    if (usingNativeQueue) return;
    fallbackPlayer.loop = repeat;
  }, [fallbackPlayer, repeat, usingNativeQueue]);
  useEffect(() => {
    if (usingNativeQueue) return;
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix", shouldPlayInBackground: supportsBackgroundControls }).catch(() => undefined);
  }, [supportsBackgroundControls, usingNativeQueue]);
  useEffect(() => {
    if (usingNativeQueue || !supportsBackgroundControls) return;
    try {
      fallbackPlayer.setActiveForLockScreen(true, {
        title: trackTitle(activeTrack), artist: "SSC Buddy", albumTitle: playlistName(activeTrack), artworkUrl: cover ? Image.resolveAssetSource(cover).uri : undefined,
      }, { showSeekBackward: true, showSeekForward: true });
    } catch {}
  }, [activeTrack, cover, fallbackPlayer, supportsBackgroundControls, usingNativeQueue]);
  useEffect(() => {
    if (!orderReady || !nativeMusicPlayer) return;
    let cancelled = false;
    const startNativeQueue = async () => {
      try {
        try { await nativeMusicPlayer.setupPlayer({ autoHandleInterruptions: true }); }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/already.*initial/i.test(message)) throw error;
        }
        await nativeMusicPlayer.updateOptions({
          capabilities: [nativeMusicPlayer.CAPABILITY_PLAY, nativeMusicPlayer.CAPABILITY_PAUSE, nativeMusicPlayer.CAPABILITY_SKIP_TO_NEXT, nativeMusicPlayer.CAPABILITY_SKIP_TO_PREVIOUS, nativeMusicPlayer.CAPABILITY_SEEK_TO],
          notificationCapabilities: [nativeMusicPlayer.CAPABILITY_PLAY, nativeMusicPlayer.CAPABILITY_PAUSE, nativeMusicPlayer.CAPABILITY_SKIP_TO_NEXT, nativeMusicPlayer.CAPABILITY_SKIP_TO_PREVIOUS],
          compactCapabilities: [nativeMusicPlayer.CAPABILITY_SKIP_TO_PREVIOUS, nativeMusicPlayer.CAPABILITY_PLAY, nativeMusicPlayer.CAPABILITY_SKIP_TO_NEXT],
          progressUpdateEventInterval: 0.3,
        });
        await nativeMusicPlayer.reset();
        await nativeMusicPlayer.add(orderedTracks.map((track) => ({
          id: track, url: musicSource(track), title: trackTitle(track), artist: "SSC Buddy", album: playlistName(track), artwork: musicCover(track)?.uri,
        })));
        await nativeMusicPlayer.setRepeatMode(repeat ? nativeMusicPlayer.REPEAT_TRACK : nativeMusicPlayer.REPEAT_QUEUE);
        await nativeMusicPlayer.play();
        if (!cancelled) setPlayerReady(true);
      } catch { if (!cancelled) setPlayerReady(false); }
    };
    void startNativeQueue();
    return () => { cancelled = true; };
  }, [orderReady, orderedTracks]);
  useEffect(() => {
    if (!supportsBackgroundControls || Platform.OS !== "android") return;
    void requestNotificationPermissionsAsync().catch(() => undefined);
  }, [supportsBackgroundControls]);
  useEffect(() => () => { void nativeMusicPlayer?.pause().then(() => nativeMusicPlayer?.reset()).catch(() => undefined); }, []);
  useEffect(() => {
    if (!playerReady || !nativeMusicPlayer) return;
    void nativeMusicPlayer.setRepeatMode(repeat ? nativeMusicPlayer.REPEAT_TRACK : nativeMusicPlayer.REPEAT_QUEUE);
  }, [playerReady, repeat]);
  useEffect(() => {
    shouldSpin.current = isPlaying;
    artworkAnimation.current?.stop();
    if (!isPlaying) return;
    const spinOnce = () => {
      artworkAnimation.current = Animated.timing(artworkSpin, {
        toValue: 1,
        duration: 18000,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      });
      artworkAnimation.current.start(({ finished }) => {
        if (!finished || !shouldSpin.current) return;
        artworkSpin.setValue(0);
        spinOnce();
      });
    };
    spinOnce();
    return () => { artworkAnimation.current?.stop(); };
  }, [artworkSpin, isPlaying]);
  const selectTrack = useCallback((nextIndex: number) => {
    const nextTrack = musicTracks[nextIndex];
    const queueIndex = orderedTracks.indexOf(nextTrack);
    if (!nextTrack || queueIndex < 0) return;
    setIndex(nextIndex);
    if (playerReady) void nativeMusicPlayer?.skip(queueIndex).then(() => nativeMusicPlayer?.play()).catch(() => undefined);
  }, [orderedTracks, playerReady]);
  const shift = useCallback((amount: number) => {
    const currentTrackIndex = playingPlaylistTracks.indexOf(activeTrack);
    if (currentTrackIndex < 0 || !playingPlaylistTracks.length) return;
    const nextTrack = playingPlaylistTracks[(currentTrackIndex + amount + playingPlaylistTracks.length) % playingPlaylistTracks.length];
    const nextIndex = musicTracks.indexOf(nextTrack);
    if (nextIndex >= 0) selectTrack(nextIndex);
  }, [activeTrack, playingPlaylistTracks, selectTrack]);
  useEffect(() => {
    if (usingNativeQueue || !fallbackStatus.didJustFinish || repeat) return;
    shift(1);
  }, [fallbackStatus.didJustFinish, repeat, shift, usingNativeQueue]);
  const playMusic = () => { if (nativeMusicPlayer) void nativeMusicPlayer.play(); else fallbackPlayer.play(); };
  const pauseMusic = () => { if (nativeMusicPlayer) void nativeMusicPlayer.pause(); else fallbackPlayer.pause(); };
  const rotation = artworkSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const activeDuration = usingNativeQueue ? playbackProgress.duration : fallbackStatus.duration;
  const activeTime = usingNativeQueue ? playbackProgress.position : fallbackStatus.currentTime;
  const progress = dragProgress ?? (activeDuration > 0 ? Math.max(0, Math.min(1, activeTime / activeDuration)) : 0);
  const progressFromPoint = (x: number, y: number, size: number) => {
    const angle = (Math.atan2(y - size / 2, x - size / 2) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return angle / (Math.PI * 2);
  };
  const seekFromPoint = (x: number, y: number, size: number) => {
    if (!activeDuration) return;
    const nextProgress = progressFromPoint(x, y, size);
    setDragProgress(nextProgress);
    if (nativeMusicPlayer) void nativeMusicPlayer.seekTo(nextProgress * activeDuration); else void fallbackPlayer.seekTo(nextProgress * activeDuration);
  };
  const discPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (event) => seekFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, discSize),
    onPanResponderRelease: (event, gesture) => {
      if (Math.hypot(gesture.dx, gesture.dy) < 6) {
        const x = event.nativeEvent.locationX, y = event.nativeEvent.locationY;
        const distance = Math.hypot(x - discSize / 2, y - discSize / 2);
        if (distance > discSize / 2 - 13) {
          seekFromPoint(x, y, discSize);
        } else {
          isPlaying ? pauseMusic() : playMusic();
        }
      } else {
        seekFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, discSize);
      }
      setDragProgress(null);
    },
  });
  if (minimized) {
    return <Animated.View pointerEvents="box-none" style={[styles.miniLayer, { paddingBottom: 12, transform: [{ translateY: miniLift }] }]}>
      <View style={styles.miniPlayer}>
        <Pressable style={styles.miniDisc} onPress={() => isPlaying ? pauseMusic() : playMusic()}><ProgressRing size={38} progress={progress} /><Animated.View style={[styles.miniArtwork, { transform: [{ rotate: rotation }] }]}>{cover ? <Image source={cover} style={styles.coverImage} /> : <MaterialCommunityIcons name="music" size={16} color={colors.accent} />}</Animated.View></Pressable>
        <Pressable style={styles.miniText} onPress={() => setMinimized(false)}><Text numberOfLines={1} style={styles.miniTitle}>{trackTitle(musicTracks[index] ?? "")}</Text><Text style={styles.miniStatus}>{isPlaying ? "Playing" : "Paused"}</Text></Pressable>
        <Pressable hitSlop={8} onPress={() => isPlaying ? pauseMusic() : playMusic()}><MaterialCommunityIcons name={isPlaying ? "pause" : "play"} size={22} color={colors.text} /></Pressable>
        <Pressable hitSlop={8} onPress={onClose}><MaterialCommunityIcons name="close" size={18} color={colors.muted} /></Pressable>
      </View>
    </Animated.View>;
  }
  return <Modal transparent visible animationType="fade" onRequestClose={() => setMinimized(true)}><Pressable style={[styles.backdrop, { padding: 16 }]} onPress={() => setMinimized(true)}><Pressable style={[styles.musicCard, { height: "63%", maxHeight: "63%", padding: 15 }]} onPress={() => undefined}>
    <View style={styles.musicHead}><View /><View style={styles.musicHeaderActions}><Pressable onPress={() => setMinimized(true)} hitSlop={9}><MaterialCommunityIcons name="arrow-collapse" size={20} color={colors.muted} /></Pressable><Pressable onPress={onClose} hitSlop={9}><MaterialCommunityIcons name="close" size={21} color={colors.muted} /></Pressable></View></View>
    <View style={[styles.disc, { width: discSize, height: discSize, marginTop: 3 }]} {...discPan.panHandlers}><Animated.View style={[styles.artwork, { width: 90, height: 90, borderRadius: 45, transform: [{ rotate: rotation }] }]}>{cover ? <Image source={cover} style={styles.coverImage} /> : <MaterialCommunityIcons name="music" size={34} color={colors.accent} />}</Animated.View><ProgressRing size={discSize} progress={progress} /></View>
    <Text style={styles.songTitle} numberOfLines={1}>{trackTitle(musicTracks[index] ?? "")}</Text>
    <View style={styles.controls}><Pressable style={styles.round} onPress={() => toggleLike(activeTrack)}><MaterialCommunityIcons name={liked ? "heart" : "heart-outline"} size={21} color={liked ? "#fb7185" : colors.text} /></Pressable><Pressable style={[styles.round, repeat && { backgroundColor: "#284d7f" }]} onPress={() => setRepeat((value) => !value)}><MaterialCommunityIcons name="repeat" size={20} color={colors.text} /></Pressable><Pressable style={styles.round} onPress={() => shift(-1)}><MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} /></Pressable><Pressable style={styles.round} onPress={() => shift(1)}><MaterialCommunityIcons name="chevron-right" size={28} color={colors.text} /></Pressable></View>
    <View style={styles.playlistHeader}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playlistChips}>{playlists.map((playlist) => <Pressable key={playlist} onPress={() => setSelectedPlaylist(playlist)} style={[styles.playlistChip, playlist === selectedPlaylist && styles.playlistChipActive]}><Text numberOfLines={1} style={[styles.playlistChipText, playlist === selectedPlaylist && styles.playlistChipTextActive]}>{playlist}</Text></Pressable>)}</ScrollView></View><ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={[styles.playlist, { marginTop: 5 }]} contentContainerStyle={styles.playlistContent}>{visibleTracks.map((track) => { const trackIndex = musicTracks.indexOf(track); return <Pressable key={track} onPress={() => selectTrack(trackIndex)} style={[styles.track, { paddingVertical: 5 }, trackIndex === index && styles.trackActive]}><Text numberOfLines={1} style={[styles.trackText, trackIndex === index && styles.trackTextActive]}>{trackTitle(track)}</Text></Pressable>; })}</ScrollView>
  </Pressable></Pressable></Modal>;
}

function ProgressRing({ size, progress }: { size: number; progress: number }) {
  const stroke = size < 60 ? 2.5 : 4;
  const dotRadius = size < 60 ? 3.5 : 6;
  const radius = (size - stroke) / 2 - dotRadius - 1;
  const circumference = 2 * Math.PI * radius;
  const angle = progress * Math.PI * 2 - Math.PI / 2;
  const dotX = size / 2 + radius * Math.cos(angle);
  const dotY = size / 2 + radius * Math.sin(angle);
  return <Svg pointerEvents="none" width={size} height={size} style={styles.progressRing}>
    <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#3d3d3d" strokeWidth={stroke} fill="transparent" />
    <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#fb4f5a" strokeWidth={stroke} fill="transparent" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} rotation="-90" origin={`${size / 2}, ${size / 2}`} />
    <Circle cx={dotX} cy={dotY} r={dotRadius} fill="#fb4f5a" stroke="#ffd1d4" strokeWidth={size < 60 ? 0.75 : 1} />
  </Svg>;
}

/** Uses the same preferences document and field names as the web media overlays. */
function useCloudLikes(user: User | null, key: "ssc-buddy-liked-videos" | "ssc-buddy-liked-music") {
  const [likes, setLikes] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!user) { setLikes(new Set()); setReady(true); return; }
    setReady(false);
    return watchCloudPreferences(user, (preferences) => {
      const value = preferences?.[key];
      setLikes(new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []));
      setReady(true);
    });
  }, [key, user?.uid]);
  const toggle = (track: string) => {
    setLikes((current) => {
      const next = new Set(current);
      next.has(track) ? next.delete(track) : next.add(track);
      if (user) void patchCloudPreferences(user, { [key]: [...next] });
      return next;
    });
  };
  return [likes, toggle, ready] as const;
}

const styles = StyleSheet.create({
  reel: { flex: 1, backgroundColor: "#000" }, video: { flex: 1 }, reelShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.14)" }, close: { position: "absolute", zIndex: 3, top: 25, right: 18, padding: 8 }, videoTap: { ...StyleSheet.absoluteFill, zIndex: 1 }, playbackFeedback: { position: "absolute", zIndex: 4, top: "50%", left: "50%", width: 70, height: 70, marginLeft: -35, marginTop: -35, alignItems: "center", justifyContent: "center", borderRadius: 35, backgroundColor: "rgba(0,0,0,.58)" }, likeFeedback: { width: 96, height: 96, marginLeft: -48, marginTop: -48, backgroundColor: "transparent" }, speedBadge: { position: "absolute", zIndex: 2, top: 28, right: 65, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(220,38,38,.9)" }, speedText: { color: "#fff", fontSize: 13, fontWeight: "900" }, reelControls: { position: "absolute", zIndex: 2, left: 20, right: 20, bottom: 34 }, reelCaption: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.7, marginTop: 18 }, reelFile: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 5 }, videoProgressTrack: { position: "absolute", zIndex: 3, bottom: 0, left: 0, right: 0, height: 4, backgroundColor: "rgba(255,255,255,.22)" }, videoProgressFill: { height: "100%", backgroundColor: "#ef4444" },
  backdrop: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,.82)" }, musicCard: { maxHeight: "82%", borderRadius: 20, padding: 15, backgroundColor: "#1b1b1b", borderWidth: 1, borderColor: colors.border }, musicHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, musicHeaderActions: { flexDirection: "row", alignItems: "center", gap: 12 }, musicKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" }, disc: { width: 112, height: 112, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 4 }, progressRing: { position: "absolute" }, artwork: { alignItems: "center", justifyContent: "center", width: 90, height: 90, borderRadius: 45, overflow: "hidden", backgroundColor: "#292929" }, songTitle: { color: colors.text, textAlign: "center", marginTop: 7, fontSize: 14, fontWeight: "700" }, controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 9 }, round: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#292929" }, play: { backgroundColor: colors.accent }, playlistLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginTop: 23 }, playlist: { height: 160, flexGrow: 0, gap: 0 }, track: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }, trackActive: { backgroundColor: "#303030" }, trackText: { color: colors.muted, fontSize: 11 }, trackTextActive: { color: colors.text, fontWeight: "700" },
  playlistHeader: { flexDirection: "row", alignItems: "center", marginTop: 15 }, playlistChips: { gap: 5, paddingRight: 7 }, playlistChip: { maxWidth: 105, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#292929" }, playlistChipActive: { backgroundColor: "#e4e4e7" }, playlistChipText: { color: colors.muted, fontSize: 10, fontWeight: "700" }, playlistChipTextActive: { color: "#171717" }, playlistContent: { gap: 0, paddingBottom: 2 },
  coverImage: { width: "100%", height: "100%", borderRadius: 999 },
  miniLayer: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", alignItems: "flex-end", paddingHorizontal: 11 }, miniPlayer: { width: 214, minHeight: 54, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 15, paddingHorizontal: 9, backgroundColor: "#202020", borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 10 }, miniDisc: { width: 38, height: 38, alignItems: "center", justifyContent: "center" }, miniArtwork: { width: 31, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 16, overflow: "hidden", backgroundColor: "#292929" }, miniText: { flex: 1, minWidth: 0 }, miniTitle: { color: colors.text, fontSize: 11, fontWeight: "700" }, miniStatus: { color: colors.muted, fontSize: 9, marginTop: 2 },
});
