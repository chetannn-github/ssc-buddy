import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { User } from "firebase/auth";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Constants, { AppOwnership } from "expo-constants";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { musicCover, musicSource, musicTracks, trackTitle, videoSource, videoTracks } from "../lib/media";
import { colors } from "../theme";
import { subscribeBottomNavigation } from "../navigation/bottomNavigationVisibility";
import { patchCloudPreferences, watchCloudPreferences } from "../lib/firebase";

export type MediaMode = "video" | "music" | null;
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
  const orderedTracks = useMemo(() => prioritizeLikes(videoTracks, likes), [likes]);
  const reelPages = useMemo(
    () => Array.from({ length: orderedTracks.length * 400 }, (_, index) => ({ id: index, track: orderedTracks[index % orderedTracks.length] })),
    [orderedTracks],
  );
  const firstReelPage = Math.floor(reelPages.length / 2);
  const [index, setIndex] = useState(firstReelPage);
  const reelsRef = useRef<FlatList<{ id: number; track: string }>>(null);
  const initialPickApplied = useRef(false);
  useEffect(() => {
    if (!likesReady || initialPickApplied.current) return;
    initialPickApplied.current = true;
    const track = orderedTracks[0];
    if (!track) return;
    const next = reelIndexFor(track, orderedTracks, firstReelPage);
    setIndex(next);
    requestAnimationFrame(() => reelsRef.current?.scrollToIndex({ index: next, animated: false }));
  }, [firstReelPage, likesReady, orderedTracks]);
  return <Modal visible animationType="slide" onRequestClose={onClose}><View style={styles.reel}>
    <FlatList ref={reelsRef} data={reelPages} keyExtractor={(item) => String(item.id)} pagingEnabled showsVerticalScrollIndicator={false} initialScrollIndex={firstReelPage} getItemLayout={(_, itemIndex) => ({ length: height, offset: height * itemIndex, index: itemIndex })} initialNumToRender={2} maxToRenderPerBatch={2} windowSize={2} removeClippedSubviews onScrollBeginDrag={() => setSwiping(true)} onScrollEndDrag={(event) => { if (!event.nativeEvent.velocity?.y) setSwiping(false); }} onMomentumScrollEnd={(event) => { setIndex(Math.round(event.nativeEvent.contentOffset.y / height)); setSwiping(false); }} renderItem={({ item, index: itemIndex }) => index === itemIndex ? <ReelPage track={item.track} active height={height} onClose={onClose} liked={likes.has(item.track)} swiping={swiping} onToggleLike={() => toggleLike(item.track)} /> : <View style={[styles.reel, { height, flex: 0 }]} />} />
  </View></Modal>;
}

function ReelPage({ track, active, height, onClose, liked, swiping, onToggleLike }: { track: string; active: boolean; height: number; onClose: () => void; liked: boolean; swiping: boolean; onToggleLike: () => void }) {
  const [speeding, setSpeeding] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [playbackFeedback, setPlaybackFeedback] = useState<"play" | "pause" | null>(null);
  const longPressRef = useRef(false);
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
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
  return <View style={[styles.reel, { height, flex: 0 }]}>
    <VideoView style={styles.video} player={player} nativeControls={false} contentFit="contain" />
    <View pointerEvents="none" style={styles.reelShade} />
    {!swiping && <Pressable style={styles.close} onPress={onClose}><MaterialCommunityIcons name="close" size={24} color={colors.text} /></Pressable>}
    <Pressable style={styles.videoTap} delayLongPress={280} onLongPress={startFastForward} onPressOut={stopFastForward} onPress={() => { if (longPressRef.current) { longPressRef.current = false; return; } togglePlayback(); }} />
    {playbackFeedback && <Animated.View pointerEvents="none" style={[styles.playbackFeedback, { opacity: feedbackOpacity, transform: [{ scale: feedbackOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) }] }]}><MaterialCommunityIcons name={playbackFeedback} size={34} color="#fff" /></Animated.View>}
    {speeding && <View pointerEvents="none" style={styles.speedBadge}><Text style={styles.speedText}>2×</Text></View>}
    <View style={styles.reelControls}><Pressable style={styles.round} onPress={onToggleLike}><MaterialCommunityIcons name={liked ? "heart" : "heart-outline"} size={23} color={liked ? "#fb7185" : colors.text} /></Pressable></View>
    {!swiping && <View pointerEvents="none" style={styles.videoProgressTrack}><View style={[styles.videoProgressFill, { width: `${progress * 100}%` }]} /></View>}
  </View>;
}

function MusicPlayer({ user, onClose, openRequest }: { user: User | null; onClose: () => void; openRequest: number }) {
  const [index, setIndex] = useState(0);
  const [likes, toggleLike, likesReady] = useCloudLikes(user, "ssc-buddy-liked-music");
  const initialPickApplied = useRef(false);
  const [repeat, setRepeat] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState(() => playlistName(musicTracks[0] ?? ""));
  const [minimized, setMinimized] = useState(false);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [audioModeReady, setAudioModeReady] = useState(false);
  const source = musicSource(musicTracks[index] ?? musicTracks[0]);
  // Keep one native player for the entire overlay lifetime. Passing `source`
  // directly to this hook recreates its native shared object whenever a track
  // changes, which can race Android's foreground media service in release APKs.
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const artworkSpin = useRef(new Animated.Value(0)).current;
  const miniLift = useRef(new Animated.Value(0)).current;
  const artworkAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const shouldSpin = useRef(false);
  const activeTrack = musicTracks[index] ?? musicTracks[0];
  const orderedTracks = useMemo(() => prioritizeLikes(musicTracks, likes), [likes]);
  const playlists = useMemo(() => [...new Set(orderedTracks.map(playlistName))], [orderedTracks]);
  const visibleTracks = useMemo(() => orderedTracks.filter((track) => playlistName(track) === selectedPlaylist), [orderedTracks, selectedPlaylist]);
  const playingPlaylistTracks = useMemo(() => orderedTracks.filter((track) => playlistName(track) === playlistName(activeTrack ?? "")), [activeTrack, orderedTracks]);
  const liked = likes.has(activeTrack);
  const discSize = 112;
  const cover = musicCover(activeTrack);
  // Expo Go cannot include this project's custom foreground media service.
  // A development/standalone build receives the service from the expo-audio plugin.
  const supportsBackgroundControls = Constants.appOwnership !== AppOwnership.Expo;
  useEffect(() => {
    if (!likesReady || initialPickApplied.current) return;
    initialPickApplied.current = true;
    const initial = orderedTracks[0];
    if (!initial) return;
    const nextIndex = musicTracks.indexOf(initial);
    if (nextIndex >= 0) {
      setIndex(nextIndex);
      setSelectedPlaylist(playlistName(initial));
    }
  }, [likesReady, orderedTracks]);
  useEffect(() => { if (openRequest) setMinimized(false); }, [openRequest]);
  useEffect(() => subscribeBottomNavigation(setBottomNavVisible), []);
  useEffect(() => {
    Animated.timing(miniLift, { toValue: bottomNavVisible ? -64 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [bottomNavVisible, miniLift]);
  useEffect(() => {
    try {
      player.replace(source);
      player.play();
    } catch {
      // The overlay can close while Android is releasing the native player.
      // A later open creates a fresh player instead of crashing the app.
    }
  }, [player, source]);
  useEffect(() => { player.loop = repeat; }, [player, repeat]);
  useEffect(() => {
    let active = true;
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      shouldPlayInBackground: supportsBackgroundControls,
    }).then(() => {
      if (active) setAudioModeReady(true);
    }).catch(() => {
      if (active) setAudioModeReady(false);
    });
    return () => { active = false; };
  }, [supportsBackgroundControls]);
  useEffect(() => {
    if (!supportsBackgroundControls || !audioModeReady) return;
    try {
      player.setActiveForLockScreen(
        true,
        {
          title: trackTitle(activeTrack),
          artist: "SSC Buddy",
          albumTitle: "Motivation",
          artworkUrl: cover ? Image.resolveAssetSource(cover).uri : undefined,
        },
        { showSeekBackward: true, showSeekForward: true },
      );
    } catch {
      // Playback remains usable if an OEM does not expose lock-screen controls.
    }
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
  const shift = (amount: number) => {
    const currentTrackIndex = playingPlaylistTracks.indexOf(activeTrack);
    if (currentTrackIndex < 0 || !playingPlaylistTracks.length) return;
    const nextTrack = playingPlaylistTracks[(currentTrackIndex + amount + playingPlaylistTracks.length) % playingPlaylistTracks.length];
    const nextIndex = musicTracks.indexOf(nextTrack);
    if (nextIndex >= 0) setIndex(nextIndex);
  };
  const rotation = artworkSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const playbackProgress = status.duration > 0 ? Math.max(0, Math.min(1, status.currentTime / status.duration)) : 0;
  const progress = dragProgress ?? playbackProgress;
  const progressFromPoint = (x: number, y: number, size: number) => {
    const angle = (Math.atan2(y - size / 2, x - size / 2) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return angle / (Math.PI * 2);
  };
  const seekFromPoint = (x: number, y: number, size: number) => {
    if (!status.duration) return;
    const nextProgress = progressFromPoint(x, y, size);
    setDragProgress(nextProgress);
    void player.seekTo(nextProgress * status.duration);
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
          status.playing ? player.pause() : player.play();
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
        <Pressable style={styles.miniDisc} onPress={() => status.playing ? player.pause() : player.play()}><ProgressRing size={38} progress={progress} /><Animated.View style={[styles.miniArtwork, { transform: [{ rotate: rotation }] }]}>{cover ? <Image source={cover} style={styles.coverImage} /> : <MaterialCommunityIcons name="music" size={16} color={colors.accent} />}</Animated.View></Pressable>
        <Pressable style={styles.miniText} onPress={() => setMinimized(false)}><Text numberOfLines={1} style={styles.miniTitle}>{trackTitle(musicTracks[index] ?? "")}</Text><Text style={styles.miniStatus}>{status.playing ? "Playing" : "Paused"}</Text></Pressable>
        <Pressable hitSlop={8} onPress={() => status.playing ? player.pause() : player.play()}><MaterialCommunityIcons name={status.playing ? "pause" : "play"} size={22} color={colors.text} /></Pressable>
        <Pressable hitSlop={8} onPress={onClose}><MaterialCommunityIcons name="close" size={18} color={colors.muted} /></Pressable>
      </View>
    </Animated.View>;
  }
  return <Modal transparent visible animationType="fade" onRequestClose={() => setMinimized(true)}><Pressable style={[styles.backdrop, { padding: 16 }]} onPress={() => setMinimized(true)}><Pressable style={[styles.musicCard, { height: "63%", maxHeight: "63%", padding: 15 }]} onPress={() => undefined}>
    <View style={styles.musicHead}><View /><View style={styles.musicHeaderActions}><Pressable onPress={() => setMinimized(true)} hitSlop={9}><MaterialCommunityIcons name="arrow-collapse" size={20} color={colors.muted} /></Pressable><Pressable onPress={onClose} hitSlop={9}><MaterialCommunityIcons name="close" size={21} color={colors.muted} /></Pressable></View></View>
    <View style={[styles.disc, { width: discSize, height: discSize, marginTop: 3 }]} {...discPan.panHandlers}><Animated.View style={[styles.artwork, { width: 90, height: 90, borderRadius: 45, transform: [{ rotate: rotation }] }]}>{cover ? <Image source={cover} style={styles.coverImage} /> : <MaterialCommunityIcons name="music" size={34} color={colors.accent} />}</Animated.View><ProgressRing size={discSize} progress={progress} /></View>
    <Text style={styles.songTitle} numberOfLines={1}>{trackTitle(musicTracks[index] ?? "")}</Text>
    <View style={styles.controls}><Pressable style={styles.round} onPress={() => toggleLike(activeTrack)}><MaterialCommunityIcons name={liked ? "heart" : "heart-outline"} size={21} color={liked ? "#fb7185" : colors.text} /></Pressable><Pressable style={[styles.round, repeat && { backgroundColor: "#284d7f" }]} onPress={() => setRepeat((value) => !value)}><MaterialCommunityIcons name="repeat" size={20} color={colors.text} /></Pressable><Pressable style={styles.round} onPress={() => shift(-1)}><MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} /></Pressable><Pressable style={styles.round} onPress={() => shift(1)}><MaterialCommunityIcons name="chevron-right" size={28} color={colors.text} /></Pressable></View>
    <View style={styles.playlistHeader}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playlistChips}>{playlists.map((playlist) => <Pressable key={playlist} onPress={() => setSelectedPlaylist(playlist)} style={[styles.playlistChip, playlist === selectedPlaylist && styles.playlistChipActive]}><Text numberOfLines={1} style={[styles.playlistChipText, playlist === selectedPlaylist && styles.playlistChipTextActive]}>{playlist}</Text></Pressable>)}</ScrollView></View><ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={[styles.playlist, { marginTop: 5 }]} contentContainerStyle={styles.playlistContent}>{visibleTracks.map((track) => { const trackIndex = musicTracks.indexOf(track); return <Pressable key={track} onPress={() => setIndex(trackIndex)} style={[styles.track, { paddingVertical: 5 }, trackIndex === index && styles.trackActive]}><Text numberOfLines={1} style={[styles.trackText, trackIndex === index && styles.trackTextActive]}>{trackTitle(track)}</Text></Pressable>; })}</ScrollView>
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
  reel: { flex: 1, backgroundColor: "#000" }, video: { flex: 1 }, reelShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.14)" }, close: { position: "absolute", zIndex: 3, top: 25, right: 18, padding: 8 }, videoTap: { ...StyleSheet.absoluteFill, zIndex: 1 }, playbackFeedback: { position: "absolute", zIndex: 4, top: "50%", left: "50%", width: 70, height: 70, marginLeft: -35, marginTop: -35, alignItems: "center", justifyContent: "center", borderRadius: 35, backgroundColor: "rgba(0,0,0,.58)" }, speedBadge: { position: "absolute", zIndex: 2, top: 28, right: 65, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(220,38,38,.9)" }, speedText: { color: "#fff", fontSize: 13, fontWeight: "900" }, reelControls: { position: "absolute", zIndex: 2, left: 20, right: 20, bottom: 34 }, reelCaption: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.7, marginTop: 18 }, reelFile: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 5 }, videoProgressTrack: { position: "absolute", zIndex: 3, bottom: 0, left: 0, right: 0, height: 4, backgroundColor: "rgba(255,255,255,.22)" }, videoProgressFill: { height: "100%", backgroundColor: "#ef4444" },
  backdrop: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,.82)" }, musicCard: { maxHeight: "82%", borderRadius: 20, padding: 15, backgroundColor: "#1b1b1b", borderWidth: 1, borderColor: colors.border }, musicHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, musicHeaderActions: { flexDirection: "row", alignItems: "center", gap: 12 }, musicKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" }, disc: { width: 112, height: 112, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 4 }, progressRing: { position: "absolute" }, artwork: { alignItems: "center", justifyContent: "center", width: 90, height: 90, borderRadius: 45, overflow: "hidden", backgroundColor: "#292929" }, songTitle: { color: colors.text, textAlign: "center", marginTop: 7, fontSize: 14, fontWeight: "700" }, controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 9 }, round: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#292929" }, play: { backgroundColor: colors.accent }, playlistLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginTop: 23 }, playlist: { height: 160, flexGrow: 0, gap: 0 }, track: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }, trackActive: { backgroundColor: "#303030" }, trackText: { color: colors.muted, fontSize: 11 }, trackTextActive: { color: colors.text, fontWeight: "700" },
  playlistHeader: { flexDirection: "row", alignItems: "center", marginTop: 15 }, playlistChips: { gap: 5, paddingRight: 7 }, playlistChip: { maxWidth: 105, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#292929" }, playlistChipActive: { backgroundColor: "#e4e4e7" }, playlistChipText: { color: colors.muted, fontSize: 10, fontWeight: "700" }, playlistChipTextActive: { color: "#171717" }, playlistContent: { gap: 0, paddingBottom: 2 },
  coverImage: { width: "100%", height: "100%", borderRadius: 999 },
  miniLayer: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", alignItems: "flex-end", paddingHorizontal: 11 }, miniPlayer: { width: 214, minHeight: 54, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 15, paddingHorizontal: 9, backgroundColor: "#202020", borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 10 }, miniDisc: { width: 38, height: 38, alignItems: "center", justifyContent: "center" }, miniArtwork: { width: 31, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 16, overflow: "hidden", backgroundColor: "#292929" }, miniText: { flex: 1, minWidth: 0 }, miniTitle: { color: colors.text, fontSize: 11, fontWeight: "700" }, miniStatus: { color: colors.muted, fontSize: 9, marginTop: 2 },
});
