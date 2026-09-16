import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FilePenLine,
  Flame,
  GraduationCap,
  ListTodo,
  Minimize2,
  Music2,
  Play,
  RotateCcw,
  RotateCw,
  Route as RouteIcon,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStreaks } from "@/lib/analytics";
import { loadHistory, type TestRecord } from "@/lib/exam";
import { trackerActiveDates } from "@/lib/tracker";
import { loadTrackerData, saveTrackerData } from "@/lib/tracker-store";
import { loadPracticeProfile, savePracticeProfile, type PracticeProfile } from "@/lib/profile";
import { restorePracticeBackup } from "@/lib/backup";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
};

const nav = [
  { title: "Daily tasks", url: "/tasks", icon: ListTodo },
  { title: "Track", url: "/track", icon: RouteIcon },
  { title: "Progress", url: "/progress", icon: BarChart3 },
  { title: "Practice session", url: "/test", icon: FilePenLine },
] as const;

const MANIFESTATION_COMPLETION_KEY = "ssc-buddy-manifestation-completed";

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function hasCompletedTodayManifestation() {
  try {
    return localStorage.getItem(MANIFESTATION_COMPLETION_KEY) === localDateKey();
  } catch {
    return false;
  }
}

function completeTodayManifestation() {
  try {
    localStorage.setItem(MANIFESTATION_COMPLETION_KEY, localDateKey());
  } catch {
    /* Storage only retains today's completion, never the typed text. */
  }
}

function ProfileOnboarding({ onComplete }: { onComplete: (profile: PracticeProfile) => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("100");
  const [examName, setExamName] = useState("SSC CGL 2027");
  const [examDate, setExamDate] = useState("");
  const parsedGoal = Math.max(1, Math.min(100000, Number(goal) || 0));
  const canContinue = name.trim().length > 0 && Number(goal) >= 1;
  const importInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState("");

  const submit = () => {
    if (!canContinue) return;
    const profile = { name: name.trim(), questionGoal: parsedGoal };
    savePracticeProfile(profile);
    const tracker = loadTrackerData();
    saveTrackerData({
      ...tracker,
      meta: {
        ...tracker.meta,
        examName: examName.trim() || tracker.meta.examName,
        prepStartDate: localDateKey(),
        examDate,
      },
    });
    onComplete(profile);
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const restored = await restorePracticeBackup(file);
      if (restored) onComplete(restored);
      else setImportError("Backup restored. Please finish your profile setup.");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not restore this backup.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#202020] p-6 text-zinc-100 shadow-[0_24px_70px_-24px_black] sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
          <GraduationCap className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold">Setup your profile</h2>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-zinc-200">
            Your name
            <Input
              className="mt-2 h-11 border-white/10 bg-zinc-900 text-zinc-100"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
          </label>
          <label className="block text-sm font-medium text-zinc-200">
            Questions you want to complete
            <Input
              className="mt-2 h-11 border-white/10 bg-zinc-900 text-zinc-100"
              inputMode="numeric"
              value={goal}
              onChange={(event) => setGoal(event.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 500"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-200">
            Exam name
            <Input
              className="mt-2 h-11 border-white/10 bg-zinc-900 text-zinc-100"
              value={examName}
              onChange={(event) => setExamName(event.target.value)}
              placeholder="e.g. SSC CGL 2027"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-200">
            Exam date <span className="font-normal text-zinc-500">(optional)</span>
            <Input
              className="mt-2 h-11 border-white/10 bg-zinc-900 text-zinc-100"
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
            />
            <span className="mt-1 block text-xs font-normal text-zinc-500">
              Your preparation start date will be set to today.
            </span>
          </label>
        </div>
        <Button
          className="mt-6 h-11 w-full bg-emerald-600 hover:bg-emerald-500"
          disabled={!canContinue}
          onClick={submit}
        >
          Create my profile
        </Button>
        <div className="mt-4 border-t border-white/10 pt-4 text-center">
          <p className="mb-2 text-xs text-zinc-400">Already have a backup?</p>
          <Button
            type="button"
            variant="ghost"
            className="text-zinc-300 hover:bg-white/10 hover:text-white"
            onClick={() => importInput.current?.click()}
          >
            <Upload className="h-4 w-4" /> Import backup
          </Button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void importBackup(event.target.files?.[0])}
          />
          {importError && <p className="mt-2 text-xs text-amber-300">{importError}</p>}
        </div>
      </section>
    </div>
  );
}

function StreakCelebration({ streak, onClose }: { streak: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <section className="streak-celebration relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#171717] p-6 text-center text-zinc-100 shadow-[0_24px_80px_-24px_black] sm:p-7">
        <button
          type="button"
          aria-label="Close streak celebration"
          onClick={onClose}
          className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-amber-300/15 bg-amber-400/10 text-amber-300">
          <Flame className="streak-celebration-flame h-6 w-6 fill-current" />
        </div>
        <p className="mt-4 text-[10px] font-semibold tracking-[0.18em] text-zinc-500 uppercase">
          Streak increased
        </p>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-50">
          {streak}-day streak
        </p>
        <p className="mt-2 text-sm text-zinc-400">Keep showing up.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
        >
          Continue
        </button>
      </section>
    </div>
  );
}

function DailyManifestation({
  manifestation,
  onComplete,
}: {
  manifestation: string;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(1);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const matchesManifestation =
    value.trim().replace(/\s+/g, " ").toLowerCase() ===
    manifestation.trim().replace(/\s+/g, " ").toLowerCase();
  const submit = () => {
    if (!matchesManifestation) {
      setError("Type the sentence exactly to continue.");
      return;
    }
    if (step < 3) {
      setStep((current) => current + 1);
      setValue("");
      setError("");
      return;
    }
    completeTodayManifestation();
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-4 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="manifestation-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171717] p-6 text-zinc-100 shadow-[0_24px_80px_-24px_black]"
      >
        <h2 id="manifestation-title" className="text-lg font-semibold">
          Daily manifestation
        </h2>
        <blockquote className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center text-base font-medium leading-7 text-zinc-100">
          “{manifestation}”
        </blockquote>
        <label className="mt-4 block">
          <Input
            className="h-11 border-white/10 bg-black/30 text-zinc-100 uppercase placeholder:text-zinc-600 focus-visible:border-zinc-500"
            value={value}
            onChange={(event) => {
              setValue(event.target.value.toUpperCase());
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="Type here"
            autoFocus
          />
        </label>
        {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
        <Button
          className="mt-4 h-11 w-full bg-zinc-100 text-zinc-900 hover:bg-white"
          onClick={submit}
        >
          {step === 3 ? "Done" : "Continue"}
        </Button>
      </section>
    </div>
  );
}

function MotivationalVideos({ onClose, onOpen }: { onClose: () => void; onOpen: () => void }) {
  const [videos, setVideos] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    onOpen();
  }, [onOpen]);

  useEffect(() => {
    let active = true;
    fetch("/videos/manifest.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [];
        const files = (await response.json()) as unknown;
        return Array.isArray(files) ? files.filter((file): file is string => typeof file === "string") : [];
      })
      .then((files) => {
        if (!active) return;
        setVideos(files);
        setSelectedVideo(files.length ? files[Math.floor(Math.random() * files.length)] ?? null : null);
      })
      .catch(() => active && setVideos([]));
    return () => {
      active = false;
    };
  }, []);

  const selectedIndex = selectedVideo ? videos.indexOf(selectedVideo) : -1;
  const showVideo = (direction: -1 | 1) => {
    if (selectedIndex < 0 || videos.length < 2) return;
    setSelectedVideo(videos[(selectedIndex + direction + videos.length) % videos.length] ?? null);
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") showVideo(-1);
      if (event.key === "ArrowRight") showVideo(1);
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [onClose, selectedIndex, videos]);

  return (
    <div className="fixed inset-0 z-[75] bg-black/90 backdrop-blur-md" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Motivational videos"
        className="relative h-full w-full overflow-hidden bg-black text-zinc-100"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close video player" className="absolute top-3 right-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-zinc-300 backdrop-blur transition-colors hover:bg-black/80 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        {selectedVideo ? (
          <div className="relative h-full w-full">
            <video
              ref={videoRef}
              key={selectedVideo}
              className="h-full w-full cursor-pointer object-contain"
              autoPlay
              loop={videos.length === 1}
              playsInline
              onClick={togglePlayback}
              onEnded={() => showVideo(1)}
            >
              <source src={`/videos/${encodeURIComponent(selectedVideo)}`} />
              Your browser does not support video playback.
            </video>
            {videos.length > 1 && (
              <>
                <button type="button" onClick={() => showVideo(-1)} aria-label="Previous video" className="absolute top-1/2 left-3 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/80 sm:left-5">
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button type="button" onClick={() => showVideo(1)} aria-label="Next video" className="absolute top-1/2 right-3 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/80 sm:right-5">
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid h-full place-items-center">
            <Play className="h-7 w-7 text-zinc-700" />
          </div>
        )}
      </section>
    </div>
  );
}

function trackTitle(file: string) {
  return decodeURIComponent(file).split("/").at(-1)?.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") ?? file;
}

function playlistName(file: string) {
  return decodeURIComponent(file).split("/").slice(0, -1).join(" / ") || "Music";
}

function embeddedCoverArt(bytes: Uint8Array): Blob | null {
  if (String.fromCharCode(...bytes.slice(0, 3)) !== "ID3") return null;
  const version = bytes[3] ?? 0;
  if (version !== 3 && version !== 4) return null;
  const readSize = (offset: number, synchsafe: boolean) =>
    synchsafe
      ? ((bytes[offset] ?? 0) << 21) | ((bytes[offset + 1] ?? 0) << 14) | ((bytes[offset + 2] ?? 0) << 7) | (bytes[offset + 3] ?? 0)
      : ((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
  const end = Math.min(bytes.length, 10 + readSize(6, true));
  for (let offset = 10; offset + 10 <= end;) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = readSize(offset + 4, version === 4);
    const start = offset + 10;
    if (!id.trim() || size <= 0 || start + size > end) break;
    if (id === "APIC") {
      const mimeEnd = bytes.indexOf(0, start + 1);
      if (mimeEnd < 0) return null;
      const mime = new TextDecoder().decode(bytes.slice(start + 1, mimeEnd)) || "image/jpeg";
      const encoding = bytes[start] ?? 0;
      let imageStart = mimeEnd + 2;
      if (encoding === 0 || encoding === 3) imageStart = bytes.indexOf(0, imageStart) + 1;
      else while (imageStart + 1 < start + size && ((bytes[imageStart] ?? 0) !== 0 || (bytes[imageStart + 1] ?? 0) !== 0)) imageStart += 2;
      if (encoding === 1 || encoding === 2) imageStart += 2;
      return imageStart < start + size ? new Blob([bytes.slice(imageStart, start + size)], { type: mime }) : null;
    }
    offset = start + size;
  }
  return null;
}

function MotivationalMusic({ onClose }: { onClose: () => void }) {
  const [tracks, setTracks] = useState<string[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState("");
  const [playbackPercent, setPlaybackPercent] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/music/manifest.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [];
        const files = (await response.json()) as unknown;
        return Array.isArray(files) ? files.filter((file): file is string => typeof file === "string") : [];
      })
      .then((files) => {
        if (!active) return;
        setTracks(files);
        const playlist = files[0] ? playlistName(files[0]) : "";
        const initialTracks = files.filter((file) => playlistName(file) === playlist);
        setSelectedPlaylist(playlist);
        setSelectedTrack(initialTracks.length ? initialTracks[Math.floor(Math.random() * initialTracks.length)] ?? null : null);
      })
      .catch(() => active && setTracks([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const expand = () => setMinimized(false);
    window.addEventListener("ssc-music-expand", expand);
    return () => window.removeEventListener("ssc-music-expand", expand);
  }, []);

  useEffect(() => {
    const pause = () => audioRef.current?.pause();
    window.addEventListener("ssc-music-pause", pause);
    return () => window.removeEventListener("ssc-music-pause", pause);
  }, []);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setCoverUrl(null);
    setPlaybackPercent(0);
    if (!selectedTrack) return;
    fetch(`/music/${encodeURIComponent(selectedTrack)}`)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        const cover = embeddedCoverArt(new Uint8Array(buffer));
        if (!cover || !active) return;
        objectUrl = URL.createObjectURL(cover);
        setCoverUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedTrack]);

  const playlists = useMemo(() => [...new Set(tracks.map(playlistName))], [tracks]);
  const playlistTracks = tracks.filter((track) => playlistName(track) === selectedPlaylist);
  const playingPlaylistTracks = selectedTrack
    ? tracks.filter((track) => playlistName(track) === playlistName(selectedTrack))
    : [];
  const trackIndex = selectedTrack ? playingPlaylistTracks.indexOf(selectedTrack) : -1;
  const showTrack = (direction: -1 | 1) => {
    if (trackIndex < 0 || playingPlaylistTracks.length < 2) return;
    setSelectedTrack(playingPlaylistTracks[(trackIndex + direction + playingPlaylistTracks.length) % playingPlaylistTracks.length] ?? null);
  };
  const choosePlaylist = (playlist: string) => {
    setSelectedPlaylist(playlist);
  };
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };
  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + seconds));
  };

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") showTrack(-1);
      if (event.key === "ArrowRight") showTrack(1);
      if (event.shiftKey && event.key.toLowerCase() === "n") showTrack(1);
      if (event.shiftKey && event.key.toLowerCase() === "p") showTrack(-1);
      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      }
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [onClose, trackIndex, playingPlaylistTracks]);

  const audioPlayer = selectedTrack ? (
    <audio
      ref={audioRef}
      key={selectedTrack}
      autoPlay
      loop={playingPlaylistTracks.length === 1}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onTimeUpdate={(event) => {
        const { currentTime, duration } = event.currentTarget;
        setPlaybackPercent(Number.isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0);
      }}
      onEnded={() => {
        setIsPlaying(false);
        showTrack(1);
      }}
      src={`/music/${encodeURIComponent(selectedTrack)}`}
    />
  ) : null;

  if (minimized) {
    return (
      <>
        {audioPlayer}
        <div className="fixed right-4 bottom-4 z-[75] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-white/10 bg-[#1b1b1b] p-2 pl-3 text-zinc-100 shadow-2xl">
          <button type="button" onClick={() => setMinimized(false)} className="min-w-0 text-left" aria-label="Expand music player">
            <span className="block max-w-40 truncate text-xs font-medium">{selectedTrack ? trackTitle(selectedTrack) : "Music"}</span>
          </button>
          <button type="button" onClick={togglePlayback} aria-label="Play or pause music" className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-lg p-[2px]" style={{ background: `conic-gradient(#ef4444 ${playbackPercent}%, rgba(255,255,255,0.12) 0)` }}>
            <span className="grid h-full w-full place-items-center overflow-hidden rounded-md bg-[#1b1b1b]">
              {coverUrl ? <img src={coverUrl} alt="Album cover" className="h-full w-full animate-[spin_8s_linear_infinite] object-cover" style={{ animationPlayState: isPlaying ? "running" : "paused" }} /> : <Music2 className="h-4 w-4" />}
            </span>
          </button>
          <button type="button" onClick={onClose} aria-label="Close music player" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/10 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {audioPlayer}
      <div className="fixed inset-0 z-[75] grid place-items-center bg-black/90 p-4 backdrop-blur-md" onMouseDown={() => setMinimized(true)}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Motivational music"
        className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-[#171717] p-5 text-zinc-100 shadow-[0_24px_80px_-24px_black] sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close music player" className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100">
          <X className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMinimized(true)} aria-label="Minimize music player" className="absolute top-3 right-12 grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100">
          <Minimize2 className="h-4 w-4" />
        </button>
        <div className="grid gap-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <div className="flex min-h-64 flex-col items-center justify-center sm:order-2">
            <button
              type="button"
              onClick={togglePlayback}
              className="relative grid h-24 w-24 place-items-center overflow-visible rounded-full p-[3px] text-zinc-100 transition-transform hover:scale-105"
              style={{ background: `conic-gradient(#ef4444 ${playbackPercent}%, rgba(255,255,255,0.12) 0)` }}
              aria-label="Play or pause music"
            >
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-[#171717]">
                {coverUrl ? <img src={coverUrl} alt="Album cover" className="h-full w-full animate-[spin_8s_linear_infinite] object-cover" style={{ animationPlayState: isPlaying ? "running" : "paused" }} /> : <Music2 className="h-9 w-9" />}
              </span>
              <span className="pointer-events-none absolute inset-0" style={{ transform: `rotate(${playbackPercent * 3.6}deg)` }}>
                <span className="absolute top-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-0.5 rounded-full border-2 border-[#171717] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
              </span>
            </button>
            <p className="mt-5 w-56 max-w-full truncate text-center text-base font-semibold text-zinc-100">
              {selectedTrack ? trackTitle(selectedTrack) : "No music added"}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button type="button" onClick={() => seek(-10)} aria-label="Back 10 seconds" className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-200 hover:bg-white/10"><RotateCcw className="h-4 w-4" /></button>
              {tracks.length > 1 && <button type="button" onClick={() => showTrack(-1)} aria-label="Previous song" className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-200 hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>}
              {tracks.length > 1 && <button type="button" onClick={() => showTrack(1)} aria-label="Next song" className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-200 hover:bg-white/10"><ChevronRight className="h-5 w-5" /></button>}
              <button type="button" onClick={() => seek(10)} aria-label="Forward 10 seconds" className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-200 hover:bg-white/10"><RotateCw className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="flex max-h-72 flex-col sm:order-1">
            <div className="flex gap-1 overflow-x-auto pb-2">
              {playlists.map((playlist) => (
                <button key={playlist} type="button" onClick={() => choosePlaylist(playlist)} className={cn("shrink-0 rounded-md px-2 py-1 text-[10px] transition-colors", selectedPlaylist === playlist ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-200")}>
                  {playlist}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {playlistTracks.map((track) => (
              <button key={track} type="button" onClick={() => setSelectedTrack(track)} className={cn("w-full truncate rounded-lg px-3 py-2.5 text-left text-xs transition-colors", selectedTrack === track ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200")}>
                {trackTitle(track)}
              </button>
            ))}
            </div>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}

export function AppShell({ title, subtitle, actions, children }: Props) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [trackerActivityDates, setTrackerActivityDates] = useState<string[]>([]);
  const [profile, setProfile] = useState<PracticeProfile | null | undefined>(undefined);
  const [celebratedStreak, setCelebratedStreak] = useState<number | null>(null);
  const [streakReady, setStreakReady] = useState(false);
  const [manifestationOpen, setManifestationOpen] = useState(false);
  const [videosOpen, setVideosOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const previousStreak = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      setRecords(loadHistory());
      const tracker = loadTrackerData();
      setTrackerActivityDates(trackerActiveDates(tracker));
      setStreakReady(true);
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("cbt-tracker-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("cbt-tracker-updated", refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setProfile(loadPracticeProfile());
    refresh();
    window.addEventListener("cbt-profile-updated", refresh);
    return () => window.removeEventListener("cbt-profile-updated", refresh);
  }, []);

  useEffect(() => {
    if (!profile) return;
    setManifestationOpen(Boolean(profile.manifestation?.trim()) && !hasCompletedTodayManifestation());
  }, [profile]);

  const currentStreak = getStreaks([
    ...records,
    ...trackerActivityDates.map((date) => ({ date })),
  ]).current;

  useEffect(() => {
    if (!streakReady) return;
    if (previousStreak.current === null) {
      previousStreak.current = currentStreak;
      return;
    }
    if (currentStreak <= previousStreak.current) {
      previousStreak.current = currentStreak;
      return;
    }
    previousStreak.current = currentStreak;
    setCelebratedStreak(currentStreak);
  }, [currentStreak, streakReady]);

  const isDarkPage =
    path === "/" ||
    path === "/profile" ||
    path === "/track" ||
    path === "/progress" ||
    path === "/mock-tests" ||
    path === "/test" ||
    path.startsWith("/history");
  return (
    <div
      className={cn(
        "flex min-h-screen w-full flex-col",
        isDarkPage ? "bg-[#121212]" : "bg-background",
      )}
    >
      <header
        className={cn(
          "h-16 border-0 shadow-none",
          isDarkPage ? "bg-[#1b1b1b] text-zinc-100" : "text-exam-header-foreground",
        )}
        style={isDarkPage ? undefined : { backgroundImage: "var(--gradient-header)" }}
      >
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
            {subtitle && <p className="truncate text-xs opacity-75 sm:text-sm">{subtitle}</p>}
          </div>
          {actions}
          <button
            type="button"
            onClick={() => setVideosOpen(true)}
            aria-label="Motivational videos"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:px-3 sm:text-sm"
          >
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">Motivational videos</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (musicOpen) window.dispatchEvent(new Event("ssc-music-expand"));
              else setMusicOpen(true);
            }}
            aria-label="Motivational music"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:px-3 sm:text-sm"
          >
            <Music2 className="h-4 w-4" />
            <span className="hidden sm:inline">Motivational music</span>
          </button>
          <nav className="flex shrink-0 items-center gap-1">
            {nav.map((item) => {
              const active = path.startsWith(item.url);
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  className={cn(
                    "app-nav-link flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                    active
                      ? "is-active bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.title}</span>
                </Link>
              );
            })}
          </nav>
          <Link
            to="/"
            aria-label={`Practice streak: ${currentStreak} days`}
            className={cn(
              "ml-1 flex h-9 min-w-12 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all",
              currentStreak > 0
                ? "bg-amber-400/20 text-amber-200 hover:bg-amber-400/30"
                : "bg-white/10 text-white/75 hover:bg-white/15 hover:text-white",
            )}
          >
            <Flame
              className={cn("h-4 w-4", currentStreak > 0 && "fill-amber-300 text-amber-300")}
            />
            <span>{currentStreak}</span>
          </Link>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6",
          (path === "/" ||
            path === "/profile" ||
            path === "/progress" ||
            path === "/mock-tests" ||
            path === "/test" ||
            path.startsWith("/history")) &&
            "app-page-enter",
        )}
      >
        {children}
      </main>
      {profile === null && <ProfileOnboarding onComplete={setProfile} />}
      {profile?.manifestation && manifestationOpen && (
        <DailyManifestation
          manifestation={profile.manifestation}
          onComplete={() => setManifestationOpen(false)}
        />
      )}
      {videosOpen && <MotivationalVideos onOpen={() => window.dispatchEvent(new Event("ssc-music-pause"))} onClose={() => setVideosOpen(false)} />}
      {musicOpen && <MotivationalMusic onClose={() => setMusicOpen(false)} />}
      {celebratedStreak !== null && (
        <StreakCelebration streak={celebratedStreak} onClose={() => setCelebratedStreak(null)} />
      )}
    </div>
  );
}
