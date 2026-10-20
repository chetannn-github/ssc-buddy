import { createThemedStyles } from "../theme";
import { musicPlaylistName as playlistName, musicQueueFor, initialMusicSelection } from "../domain/music-queue";
import { nativeMusic, useNativeMusic, musicCommand } from "../lib/native-music";
import { musicRingProgress, continueMusicSeek } from "../domain/music-seek";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { User } from "firebase/auth";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Constants, { AppOwnership } from "expo-constants";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, Easing, FlatList, Image, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { MusicLiquidRing } from "../components/MusicLiquidRing";
import { musicCover, musicSource, musicTracks, trackTitle, videoSource, videoTracks } from "../lib/media";
import { colors } from "../theme";
import { FloatingMusicPlayer } from "../components/FloatingMusicPlayer";
import type { PlayerCorner } from "../domain/floating-player";
import { subscribeBottomNavigation } from "../navigation/bottomNavigationVisibility";
import { patchCloudPreferences, watchCloudPreferences } from "../lib/firebase";

export type MediaMode = "video" | "music" | null;
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
  const [fallbackRepeat, setRepeat] = useState(false);
  const native = useNativeMusic();
  const repeat = nativeMusic ? native.status.repeat : fallbackRepeat;
  const [selectedPlaylist, setSelectedPlaylist] = useState(() => playlistName(musicTracks[0] ?? ""));
  const [minimized, setMinimized] = useState(false);
  const [miniCorner, setMiniCorner] = useState<PlayerCorner>("bottom-right");
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const discRef = useRef<View>(null);
  const discOrigin = useRef<{ x: number; y: number } | null>(null);
  const seekGesture = useRef({ active: false, ready: false, x: 0, y: 0, pageX: 0, pageY: 0, moved: false, ring: false, progress: 0 });
  const pendingSeek = useRef<number | null>(null);
  const seekRevision = useRef(0);
  const seekTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [audioModeReady, setAudioModeReady] = useState(false);
  const source = musicSource(musicTracks[index] ?? musicTracks[0]);
  const fallbackPlayer = useAudioPlayer(null, { updateInterval: 500 });
  const fallbackStatus = useAudioPlayerStatus(fallbackPlayer);
  const player = useMemo(() => nativeMusic ? {
    play: () => musicCommand(nativeMusic!.play()),
    pause: () => musicCommand(nativeMusic!.pause()),
    seekTo: (seconds: number) => nativeMusic!.seekTo(seconds),
  } : fallbackPlayer, [fallbackPlayer]);
  const status = nativeMusic ? native.status : fallbackStatus;
  const [isForeground, setIsForeground] = useState(AppState.currentState === "active");
  const advancedTrackRef = useRef<string | null>(null);
  const artworkSpin = useRef(new Animated.Value(0)).current;
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
  // A development/standalone build links the local BuddyMusic Android module.
  const supportsBackgroundControls = Constants.appOwnership !== AppOwnership.Expo;
  useEffect(() => {
    if (!likesReady || likedOrderApplied.current) return;
    likedOrderApplied.current = true;
    setOrderedTracks(prioritizeLikes(musicTracks, likes));
    setOrderReady(true);
  }, [likes, likesReady]);
  useEffect(() => {
    if (!orderReady || initialPickApplied.current || (nativeMusic && !native.ready)) return;
    initialPickApplied.current = true;
    const selection = initialMusicSelection(orderedTracks, nativeMusic ? native.status.trackId : null);
    const initial = selection.track;
    if (!initial) return;
    const nextIndex = musicTracks.indexOf(initial);
    if (nextIndex >= 0) {
      if (nativeMusic && !selection.restore) chooseTrack(nextIndex);
      else setIndex(nextIndex);
      setSelectedPlaylist(playlistName(initial));
    }
  }, [orderReady, orderedTracks, native.ready]);
  useEffect(() => {
    if (!nativeMusic || !native.status.trackId) return;
    const next = musicTracks.indexOf(native.status.trackId);
    if (next >= 0) setIndex(next);
  }, [native.status.trackId]);
  useEffect(() => { if (openRequest) setMinimized(false); }, [openRequest]);
  useEffect(() => () => { if (nativeMusic) void nativeMusic.pause().catch(() => undefined); }, []);
  useEffect(() => subscribeBottomNavigation(setBottomNavVisible), []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => setIsForeground(nextState === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (nativeMusic) return;
    try { fallbackPlayer.replace(source); fallbackPlayer.play(); } catch {}
  }, [fallbackPlayer, source]);
  useEffect(() => { if (!nativeMusic) fallbackPlayer.loop = repeat; }, [fallbackPlayer, repeat]);
  useEffect(() => {
    if (nativeMusic) return;
    let active = true;
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix", shouldPlayInBackground: supportsBackgroundControls })
      .then(() => { if (active) setAudioModeReady(true); })
      .catch(() => { if (active) setAudioModeReady(false); });
    return () => { active = false; };
  }, [supportsBackgroundControls]);
  useEffect(() => {
    // expo-audio currently creates duplicate AndroidX MediaSessions here on
    // some Android builds ("Session ID must be unique"), which terminates
    // the entire app when Music opens. Keep the iOS lock-screen metadata,
    // but skip this unstable Android media-session path.
    if (Platform.OS === "android" || !supportsBackgroundControls || !audioModeReady) return;
    try {
      fallbackPlayer.setActiveForLockScreen(true, {
        title: trackTitle(activeTrack), artist: "SSC Buddy", albumTitle: "Motivation", artworkUrl: cover ? Image.resolveAssetSource(cover).uri : undefined,
      }, { showSeekBackward: true, showSeekForward: true });
    } catch {}
  }, [activeTrack, audioModeReady, cover, player, supportsBackgroundControls]);
  useEffect(() => {
    shouldSpin.current = status.playing;
    artworkAnimation.current?.stop();
    if (!status.playing) return;
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
  }, [artworkSpin, status.playing]);
  function chooseTrack(nextIndex: number) {
    const track = musicTracks[nextIndex];
    if (!track) return;
    if (nativeMusic) {
      if (!native.ready) return;
      const queue = musicQueueFor(orderedTracks, track);
      if (!queue) return;
      musicCommand(nativeMusic.setQueue(JSON.stringify(queue.tracks.map((item) => ({ id: item, url: musicSource(item), title: trackTitle(item), album: playlistName(item), artwork: musicCover(item)?.uri }))), queue.index));
    }
    setIndex(nextIndex);
  }
  const closePlayer = () => { if (nativeMusic) musicCommand(nativeMusic.stop()); onClose(); };
  const shift = (amount: number) => {
    if (nativeMusic) { musicCommand(amount > 0 ? nativeMusic.next() : nativeMusic.previous()); return; }
    const currentTrackIndex = playingPlaylistTracks.indexOf(activeTrack);
    if (currentTrackIndex < 0 || !playingPlaylistTracks.length) return;
    const nextTrack = playingPlaylistTracks[(currentTrackIndex + amount + playingPlaylistTracks.length) % playingPlaylistTracks.length];
    const nextIndex = musicTracks.indexOf(nextTrack);
    if (nextIndex >= 0) setIndex(nextIndex);
  };
  // Native Android playback advances inside the service, even with JS suspended.
  useEffect(() => {
    if (nativeMusic) return;
    if (!status.didJustFinish) { advancedTrackRef.current = null; return; }
    if (!isForeground || repeat || advancedTrackRef.current === activeTrack) return;
    advancedTrackRef.current = activeTrack;
    shift(1);
  }, [activeTrack, isForeground, repeat, status.didJustFinish]);
  const rotation = artworkSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const playbackProgress = status.duration > 0 ? Math.max(0, Math.min(1, status.currentTime / status.duration)) : 0;
  const progress = dragProgress ?? playbackProgress;
  useEffect(() => {
    if (pendingSeek.current !== null && status.duration > 0 && Math.abs(status.currentTime / status.duration - pendingSeek.current) < 0.015) {
      pendingSeek.current = null;
      if (seekTimeout.current) clearTimeout(seekTimeout.current);
      setDragProgress(null);
    }
  }, [status.currentTime, status.duration]);
  useEffect(() => {
    seekRevision.current += 1;
    seekGesture.current.ready = false;
    pendingSeek.current = null;
    setDragProgress(null);
    if (seekTimeout.current) clearTimeout(seekTimeout.current);
    return () => { seekRevision.current += 1; if (seekTimeout.current) clearTimeout(seekTimeout.current); };
  }, [activeTrack]);
  const previewSeek = () => {
    const gesture = seekGesture.current;
    if (!gesture.active || !gesture.ready || !status.duration) return;
    const x = gesture.pageX - gesture.x, y = gesture.pageY - gesture.y;
    if (Math.hypot(x - discSize / 2, y - discSize / 2) < discSize * 0.14) return;
    const next = musicRingProgress(x, y, discSize);
    gesture.progress = gesture.moved ? continueMusicSeek(gesture.progress, next) : next;
    gesture.moved = true;
    setDragProgress(gesture.progress);
  };
  const commitSeek = () => {
    const next = seekGesture.current.progress;
    if (!status.duration) return;
    const revision = ++seekRevision.current;
    pendingSeek.current = next;
    setDragProgress(next);
    if (seekTimeout.current) clearTimeout(seekTimeout.current);
    seekTimeout.current = setTimeout(() => { if (revision === seekRevision.current) { pendingSeek.current = null; setDragProgress(null); } }, 1500);
    void player.seekTo(next * status.duration).catch(() => {
      if (revision === seekRevision.current) { pendingSeek.current = null; setDragProgress(null); }
    });
  };
  const seekHandlers = useRef({
    grant: (_x: number, _y: number) => {}, move: (_x: number, _y: number) => {}, release: (_x: number, _y: number, _distance: number) => {}, cancel: () => {},
  });
  seekHandlers.current = {
    grant: (pageX, pageY) => {
      pendingSeek.current = null;
      seekRevision.current += 1;
      if (seekTimeout.current) clearTimeout(seekTimeout.current);
      const origin = discOrigin.current;
      seekGesture.current = { active: true, ready: Boolean(origin), x: origin?.x ?? 0, y: origin?.y ?? 0, pageX, pageY, moved: false, ring: false, progress };
      const gesture = seekGesture.current;
      if (origin) {
        gesture.ring = Math.hypot(pageX - origin.x - discSize / 2, pageY - origin.y - discSize / 2) > discSize * 0.39;
        if (gesture.ring) previewSeek();
      }
      discRef.current?.measureInWindow((x, y) => {
        if (gesture !== seekGesture.current || !gesture.active) return;
        discOrigin.current = { x, y };
        gesture.x = x; gesture.y = y; gesture.ready = true;
        gesture.ring = Math.hypot(pageX - x - discSize / 2, pageY - y - discSize / 2) > discSize * 0.39;
        if (gesture.ring) previewSeek();
      });
    },
    move: (pageX, pageY) => { seekGesture.current.pageX = pageX; seekGesture.current.pageY = pageY; previewSeek(); },
    release: (pageX, pageY, distance) => {
      const gesture = seekGesture.current;
      if (!gesture.ready) { gesture.active = false; return; }
      gesture.pageX = pageX; gesture.pageY = pageY;
      if (distance < 6 && !gesture.ring) { setDragProgress(null); status.playing ? player.pause() : player.play(); }
      else { previewSeek(); commitSeek(); }
      gesture.ready = false; gesture.active = false;
    },
    cancel: () => { seekGesture.current.active = false; seekGesture.current.ready = false; pendingSeek.current = null; setDragProgress(null); },
  };
  const discPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => seekHandlers.current.grant(event.nativeEvent.pageX, event.nativeEvent.pageY),
    onPanResponderMove: event => seekHandlers.current.move(event.nativeEvent.pageX, event.nativeEvent.pageY),
    onPanResponderRelease: (event, gesture) => seekHandlers.current.release(event.nativeEvent.pageX, event.nativeEvent.pageY, Math.hypot(gesture.dx, gesture.dy)),
    onPanResponderTerminate: () => seekHandlers.current.cancel(),
    onPanResponderTerminationRequest: () => false,
  })).current;
  if (minimized) {
    return <FloatingMusicPlayer corner={miniCorner} onCornerChange={setMiniCorner} bottomNavVisible={bottomNavVisible} style={styles.miniPlayer}>
        <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? "Pause music" : "Play music"} style={styles.miniDisc} onPress={() => status.playing ? player.pause() : player.play()}>
          <View style={styles.miniArtwork}>{cover ? <Image source={cover} style={styles.coverImage} /> : <MaterialCommunityIcons name={status.playing ? "pause" : "play"} size={16} color={colors.text} />}</View>
          <MusicLiquidRing size={32} progress={progress} active={status.playing && isForeground} stroke={2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Expand music player" style={styles.miniText} onPress={() => setMinimized(false)}><Text numberOfLines={1} style={styles.miniTitle}>{trackTitle(musicTracks[index] ?? "")}</Text></Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Close music player" style={styles.miniClose} onPress={closePlayer}><MaterialCommunityIcons name="close" size={16} color={colors.muted} /></Pressable>
    </FloatingMusicPlayer>;
  }
  return <Modal transparent visible animationType="fade" onRequestClose={() => setMinimized(true)}><Pressable style={[styles.backdrop, { padding: 16 }]} onPress={() => setMinimized(true)}><Pressable style={[styles.musicCard, { height: "63%", maxHeight: "63%", padding: 15 }]} onPress={() => undefined}>
    <View style={styles.musicHead}><View /><View style={styles.musicHeaderActions}><Pressable onPress={() => setMinimized(true)} hitSlop={9}><MaterialCommunityIcons name="arrow-collapse" size={20} color={colors.muted} /></Pressable><Pressable onPress={closePlayer} hitSlop={9}><MaterialCommunityIcons name="close" size={21} color={colors.muted} /></Pressable></View></View>
    <View ref={discRef} collapsable={false} onLayout={() => discRef.current?.measureInWindow((x, y) => { discOrigin.current = { x, y }; })} style={[styles.disc, { width: discSize, height: discSize, marginTop: 3 }]} {...discPan.panHandlers}><Animated.View style={[styles.artwork, { width: 90, height: 90, borderRadius: 45, transform: [{ rotate: rotation }] }]}>{cover ? <Image source={cover} style={styles.coverImage} /> : <MaterialCommunityIcons name="music" size={34} color={colors.accent} />}</Animated.View><ProgressRing size={discSize} progress={progress} active={status.playing && isForeground} /></View>
    <Text style={styles.songTitle} numberOfLines={1}>{trackTitle(musicTracks[index] ?? "")}</Text>
    {nativeMusic && native.status.error && <Text style={{ color: "#fb7185", textAlign: "center" }}>Playback failed. Select a song to retry.</Text>}
    <View style={styles.controls}><Pressable style={styles.round} onPress={() => toggleLike(activeTrack)}><MaterialCommunityIcons name={liked ? "heart" : "heart-outline"} size={21} color={liked ? "#fb7185" : colors.text} /></Pressable><Pressable style={[styles.round, repeat && { backgroundColor: "#284d7f" }]} onPress={() => nativeMusic ? musicCommand(nativeMusic.setRepeat(!repeat)) : setRepeat((value) => !value)}><MaterialCommunityIcons name={repeat ? "repeat-once" : "repeat"} size={20} color={colors.text} /></Pressable><Pressable style={styles.round} onPress={() => shift(-1)}><MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} /></Pressable><Pressable style={styles.round} onPress={() => shift(1)}><MaterialCommunityIcons name="chevron-right" size={28} color={colors.text} /></Pressable></View>
    <View style={styles.playlistHeader}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playlistChips}>{playlists.map((playlist) => <Pressable key={playlist} onPress={() => setSelectedPlaylist(playlist)} style={[styles.playlistChip, playlist === selectedPlaylist && styles.playlistChipActive]}><Text numberOfLines={1} style={[styles.playlistChipText, playlist === selectedPlaylist && styles.playlistChipTextActive]}>{playlist}</Text></Pressable>)}</ScrollView></View><ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={[styles.playlist, { marginTop: 5 }]} contentContainerStyle={styles.playlistContent}>{visibleTracks.map((track) => { const trackIndex = musicTracks.indexOf(track); return <Pressable key={track} onPress={() => chooseTrack(trackIndex)} style={[styles.track, { paddingVertical: 5 }, trackIndex === index && styles.trackActive]}><Text numberOfLines={1} style={[styles.trackText, trackIndex === index && styles.trackTextActive]}>{trackTitle(track)}</Text></Pressable>; })}</ScrollView>
  </Pressable></Pressable></Modal>;
}

function ProgressRing({ size, progress, active = true }: { size: number; progress: number; active?: boolean }) {
  const stroke = size < 60 ? 2.5 : 4;
  const dotRadius = size < 60 ? 3.5 : 6;
  const radius = (size - stroke) / 2 - dotRadius - 1;
  const circumference = 2 * Math.PI * radius;
  const angle = progress * Math.PI * 2 - Math.PI / 2;
  const dotX = size / 2 + radius * Math.cos(angle);
  const dotY = size / 2 + radius * Math.sin(angle);
  return <>
    <MusicLiquidRing size={size} progress={progress} active={active} radius={radius} stroke={stroke} />
    <Svg pointerEvents="none" width={size} height={size} style={styles.progressRing}>
    <Circle cx={dotX} cy={dotY} r={dotRadius} fill="#fb4f5a" stroke="#ffd1d4" strokeWidth={size < 60 ? 0.75 : 1} />
  </Svg></>;
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

const styles = createThemedStyles({
  reel: { flex: 1, backgroundColor: "#000" }, video: { flex: 1 }, reelShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.14)" }, close: { position: "absolute", zIndex: 3, top: 25, right: 18, padding: 8 }, videoTap: { ...StyleSheet.absoluteFill, zIndex: 1 }, playbackFeedback: { position: "absolute", zIndex: 4, top: "50%", left: "50%", width: 70, height: 70, marginLeft: -35, marginTop: -35, alignItems: "center", justifyContent: "center", borderRadius: 35, backgroundColor: "rgba(0,0,0,.58)" }, likeFeedback: { width: 96, height: 96, marginLeft: -48, marginTop: -48, backgroundColor: "transparent" }, speedBadge: { position: "absolute", zIndex: 2, top: 28, right: 65, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(220,38,38,.9)" }, speedText: { color: "#fff", fontSize: 13, fontWeight: "900" }, reelControls: { position: "absolute", zIndex: 2, left: 20, right: 20, bottom: 34 }, reelCaption: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.7, marginTop: 18 }, reelFile: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 5 }, videoProgressTrack: { position: "absolute", zIndex: 3, bottom: 0, left: 0, right: 0, height: 4, backgroundColor: "rgba(255,255,255,.22)" }, videoProgressFill: { height: "100%", backgroundColor: "#ef4444" },
  backdrop: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,.82)" }, musicCard: { maxHeight: "82%", borderRadius: 20, padding: 15, backgroundColor: "#1b1b1b", borderWidth: 1, borderColor: colors.border }, musicHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, musicHeaderActions: { flexDirection: "row", alignItems: "center", gap: 12 }, musicKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" }, disc: { width: 112, height: 112, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 4 }, progressRing: { position: "absolute" }, artwork: { alignItems: "center", justifyContent: "center", width: 90, height: 90, borderRadius: 45, overflow: "hidden", backgroundColor: "#292929" }, songTitle: { color: colors.text, textAlign: "center", marginTop: 7, fontSize: 14, fontWeight: "700" }, controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 9 }, round: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#292929" }, play: { backgroundColor: colors.accent }, playlistLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginTop: 23 }, playlist: { height: 160, flexGrow: 0, gap: 0 }, track: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }, trackActive: { backgroundColor: "#303030" }, trackText: { color: colors.muted, fontSize: 11 }, trackTextActive: { color: colors.text, fontWeight: "700" },
  playlistHeader: { flexDirection: "row", alignItems: "center", marginTop: 15 }, playlistChips: { gap: 5, paddingRight: 7 }, playlistChip: { maxWidth: 105, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#292929" }, playlistChipActive: { backgroundColor: "#e4e4e7" }, playlistChipText: { color: colors.muted, fontSize: 10, fontWeight: "700" }, playlistChipTextActive: { color: "#171717" }, playlistContent: { gap: 0, paddingBottom: 2 },
  coverImage: { width: "100%", height: "100%", borderRadius: 999 },
  miniPlayer: { width: 160, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingLeft: 12, paddingRight: 8, paddingVertical: 8, backgroundColor: "#1b1b1b", borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 10 }, miniDisc: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, overflow: "hidden" }, miniArtwork: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 13, overflow: "hidden", backgroundColor: "#292929" }, miniText: { flex: 1, minWidth: 0 }, miniTitle: { color: colors.text, fontSize: 12, fontWeight: "500" }, miniClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8 },
});
