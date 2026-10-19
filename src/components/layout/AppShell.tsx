import type { PointerEvent, ReactNode } from "react";
import { FloatingMusicPlayer } from "@/components/layout/FloatingMusicPlayer";
import { MusicRingLiquid } from "@/components/layout/MusicRingLiquid";
import { StreakLiquidFlame } from "@/components/profile/StreakLiquidFlame";
import type { PlayerCorner } from "../../../mobile-tasks/src/domain/floating-player";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FilePenLine,
  Flame,
  GraduationCap,
  Heart,
  ListTodo,
  Minimize2,
  Music2,
  Pause,
  Play,
  Repeat2,
  Route as RouteIcon,
  Settings,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStreaks } from "@/lib/analytics";
import { loadHistory, onPracticePersist, type TestRecord } from "@/lib/exam";
import { trackerActiveDates } from "@/lib/tracker";
import { loadTrackerData, saveTrackerData } from "@/lib/tracker-store";
import { loadDailyTasks } from "@/lib/daily-tasks";
import { getXpSummary } from "@/lib/xp";
import { loadPracticeProfile, savePracticeProfile, type PracticeProfile } from "@/lib/profile";
import { checkUsernameAvailability, normalizeUsername, readCloudProfile, saveProfileWithUsername, savePublicProfileActivity, usernameValidationMessage, watchCloudProfile } from "@/lib/firebase-sync";
import type { User } from "firebase/auth";
import { useAuthUser } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { WeeklyAwardCelebration } from "@/components/WeeklyAwardCelebration";
import { CelebrationFireworks } from "@/components/CelebrationFireworks";

type Props = {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
};

const nav = [
  { title: "Daily tasks", url: "/tasks", icon: ListTodo },
  { title: "Track", url: "/track", icon: RouteIcon },
  { title: "Practice session", url: "/test", icon: FilePenLine },
  { title: "Progress", url: "/progress", icon: BarChart3 },
] as const;

const MANIFESTATION_COMPLETION_KEY = "ssc-buddy-manifestation-completed";
const VIDEO_LIKES_KEY = "ssc-buddy-liked-videos";
const MUSIC_LIKES_KEY = "ssc-buddy-liked-music";

function loadLikes(key: string) {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveLikes(key: string, likes: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...likes])); } catch { /* optional */ }
  window.dispatchEvent(new Event("ssc-preferences-updated"));
}

/** Keep saved items first while retaining the manifest's order within each group. */
function prioritizeLikes(items: string[], likes: Set<string>) {
  return [...items].sort((left, right) => Number(likes.has(right)) - Number(likes.has(left)));
}

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function cloudPracticeProfile(value: Record<string, unknown> | null): PracticeProfile | null {
  if (!value || typeof value["name"] !== "string" || !value["name"].trim()) return null;
  const questionGoal = Number(value["questionGoal"]);
  if (!Number.isFinite(questionGoal) || questionGoal < 1) return null;
  return {
    name: value["name"].trim(),
    questionGoal: Math.round(questionGoal),
    ...(typeof value["username"] === "string" && value["username"].trim() ? { username: value["username"].trim().toLowerCase() } : {}),
    ...(typeof value["avatar"] === "string" && value["avatar"] ? { avatar: value["avatar"] } : {}),
    ...(typeof value["manifestation"] === "string" && value["manifestation"].trim() ? { manifestation: value["manifestation"].trim().toUpperCase() } : {}),
    ...(typeof value["examName"] === "string" && value["examName"].trim() ? { examName: value["examName"].trim() } : {}),
    ...(typeof value["practiceSessionEnabled"] === "boolean" ? { practiceSessionEnabled: value["practiceSessionEnabled"] } : {}),
    ...(typeof value["trackProgressEnabled"] === "boolean" ? { trackProgressEnabled: value["trackProgressEnabled"] } : {}),
  };
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
    window.dispatchEvent(new Event("ssc-preferences-updated"));
  } catch {
    /* Storage only retains today's completion, never the typed text. */
  }
}

function ProfileOnboarding({ onComplete, user, existingProfile }: { onComplete: (profile: PracticeProfile) => void; user: User; existingProfile: PracticeProfile | null }) {
  const [name, setName] = useState(existingProfile?.name ?? user.displayName?.trim() ?? "");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [goal, setGoal] = useState(String(existingProfile?.questionGoal ?? 100));
  const [examName, setExamName] = useState(existingProfile?.examName ?? "SSC CGL 2027");
  const [manifestation, setManifestation] = useState(existingProfile?.manifestation ?? "");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [practiceSessionEnabled, setPracticeSessionEnabled] = useState(existingProfile?.practiceSessionEnabled !== false);
  const [trackProgressEnabled, setTrackProgressEnabled] = useState(existingProfile?.trackProgressEnabled !== false);
  const parsedGoal = Math.max(1, Math.min(100000, Number(goal) || 0));
  const canContinue = name.trim().length > 0 && Number(goal) >= 1 && usernameStatus === "available";

  useEffect(() => {
    const value = normalizeUsername(username);
    const validationError = usernameValidationMessage(value);
    if (validationError) { setUsernameStatus(value ? "invalid" : "idle"); setUsernameMessage(value ? validationError : ""); return; }
    setUsernameStatus("checking"); setUsernameMessage("Checking availability…");
    const timer = window.setTimeout(() => {
      void checkUsernameAvailability(user, value).then((result) => {
        setUsernameStatus(result.available ? "available" : "taken");
        setUsernameMessage(result.available ? "Username is available." : result.reason);
      }).catch((error) => { const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""; setUsernameStatus("idle"); setUsernameMessage(code === "permission-denied" ? "Username checks need the latest Firestore rules." : "Could not check availability. Try again."); });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [username, user]);

  const submit = async () => {
    if (!canContinue || isSaving) return;
    setIsSaving(true);
    const profile = {
      name: name.trim(),
      username: normalizeUsername(username),
      questionGoal: parsedGoal,
      ...(existingProfile?.avatar ? { avatar: existingProfile.avatar } : {}),
      ...(manifestation.trim() ? { manifestation: manifestation.trim().toUpperCase() } : {}),
      ...(examName.trim() ? { examName: examName.trim() } : {}),
      practiceSessionEnabled,
      trackProgressEnabled,
    };
    try {
      await saveProfileWithUsername(user, profile);
      savePracticeProfile(profile);
      const tracker = loadTrackerData();
      saveTrackerData({
        ...tracker,
        meta: {
          ...tracker.meta,
          examName: examName.trim() || tracker.meta.examName,
          prepStartDate: localDateKey(),
        },
      });
      onComplete(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your username. Try again.";
      setUsernameStatus(message.toLowerCase().includes("taken") ? "taken" : "idle");
      setUsernameMessage(message);
    } finally { setIsSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
      <section className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#1e1e1e] p-4 text-zinc-100 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight text-zinc-50">Setup your profile</h2><button type="button" aria-label="Profile settings" onClick={() => setSettingsOpen(true)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"><Settings className="h-4 w-4" /></button></div>
          <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-zinc-200">
            Your name
            <Input
              className="mt-1.5 h-10 border-white/10 bg-[#151515] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
          </label>
          <label className="block text-sm font-medium text-zinc-200">
            Username
            <div className="relative mt-2">
              <Input
                className="h-10 border-white/10 bg-[#151515] pr-10 text-zinc-100 lowercase placeholder:text-zinc-500 focus-visible:border-zinc-500"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                placeholder="e.g. ssc_aspirant"
                autoCapitalize="none"
                autoCorrect="off"
              />
              {usernameStatus === "checking" && <span className="absolute inset-y-0 right-3 flex items-center text-xs text-zinc-500">…</span>}
              {usernameStatus === "available" && <span className="absolute inset-y-0 right-3 flex items-center text-emerald-400">✓</span>}
              {usernameStatus === "taken" && <span className="absolute inset-y-0 right-3 flex items-center text-red-400">×</span>}
            </div>
            {usernameMessage && <span className={cn("mt-1 block text-xs font-normal", usernameStatus === "available" ? "text-emerald-400" : "text-red-300")}>{usernameMessage}</span>}
          </label>
          <label className="block text-sm font-medium text-zinc-200">
            Question goal
            <Input
              className="mt-1.5 h-10 border-white/10 bg-[#151515] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
              inputMode="numeric"
              value={goal}
              onChange={(event) => setGoal(event.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 500"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-200">
            Daily manifestation <span className="font-normal text-zinc-500">(optional)</span>
            <Input
              className="mt-1.5 h-10 border-white/10 bg-[#151515] text-zinc-100 uppercase placeholder:text-zinc-500 focus-visible:border-zinc-500"
              value={manifestation}
              onChange={(event) => setManifestation(event.target.value.toUpperCase())}
              placeholder="Write the sentence you want to type daily"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-200">
            Exam name
            <Input
              className="mt-1.5 h-10 border-white/10 bg-[#151515] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
              value={examName}
              onChange={(event) => setExamName(event.target.value)}
              placeholder="e.g. SSC CGL 2027"
            />
          </label>
        </div>
        {settingsOpen && <div className="absolute inset-0 z-10 rounded-2xl bg-[#1e1e1e] p-6 sm:p-8"><div className="flex items-center gap-2"><button type="button" aria-label="Back to profile form" onClick={() => setSettingsOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"><ArrowLeft className="h-4 w-4" /></button><h3 className="text-lg font-semibold">Settings</h3></div><div className="mt-6 space-y-3"><button type="button" onClick={() => setPracticeSessionEnabled((value) => !value)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#151515] px-3 py-3 text-left"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Practice session</span><span className="mt-0.5 block text-xs leading-4 text-zinc-500">Take practice tests, review answers and track your results.</span></span><span className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors", practiceSessionEnabled ? "border-zinc-100 bg-zinc-100" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", practiceSessionEnabled ? "translate-x-5 bg-zinc-900" : "translate-x-1 bg-zinc-400")} /></span></button><button type="button" onClick={() => setTrackProgressEnabled((value) => !value)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#151515] px-3 py-3 text-left"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Track</span><span className="mt-0.5 block text-xs leading-4 text-zinc-500">Track syllabus, revision and mock test progress.</span></span><span className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors", trackProgressEnabled ? "border-zinc-100 bg-zinc-100" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", trackProgressEnabled ? "translate-x-5 bg-zinc-900" : "translate-x-1 bg-zinc-400")} /></span></button></div></div>}
        <Button
          className="mt-4 h-10 w-full bg-sky-500 text-sky-950 hover:bg-sky-400"
          disabled={!canContinue || isSaving}
          onClick={() => void submit()}
        >
          {isSaving ? "Creating profile…" : "Save profile"}
        </Button>
      </section>
    </div>
  );
}

function StreakCelebration({ streak, onClose }: { streak: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <CelebrationFireworks />
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

function LevelCelebration({ level, onClose }: { level: number; onClose: () => void }) {
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"><section className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#171717] p-6 text-center text-zinc-100 shadow-[0_24px_80px_-24px_black] sm:p-7"><button type="button" aria-label="Close level celebration" onClick={onClose} className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100"><X className="h-4 w-4" /></button><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-violet-300/15 bg-violet-400/10 text-violet-300"><Trophy className="h-6 w-6" /></div><p className="mt-4 text-[10px] font-semibold tracking-[0.18em] text-zinc-500 uppercase">Level up</p><p className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-50">Level {level}</p><p className="mt-2 text-sm text-zinc-400">Your effort is paying off.</p><button type="button" onClick={onClose} className="mt-5 w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white">Continue</button></section></div>;
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
        <div className="flex items-center justify-between gap-3">
          <h2 id="manifestation-title" className="text-lg font-semibold">
            Daily manifestation
          </h2>
          <span aria-live="polite" aria-label={`Repetition ${step} of 3`} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tabular-nums text-zinc-200">
            {step}/3
          </span>
        </div>
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

export function MotivationalVideos({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: () => void;
}) {
  const [videos, setVideos] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [likedVideos, setLikedVideos] = useState(() => loadLikes(VIDEO_LIKES_KEY));
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackOverlay, setPlaybackOverlay] = useState<"play" | "pause" | null>(null);
  const [videoDirection, setVideoDirection] = useState<"next" | "previous">("next");
  const [dragOffset, setDragOffset] = useState(0);
  const [isDraggingReel, setIsDraggingReel] = useState(false);
  const [isFastForward, setIsFastForward] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [likeOverlay, setLikeOverlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const swipeStartY = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likeOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAt = useRef(0);
  const doubleTapPending = useRef(false);
  const longPressActivated = useRef(false);
  const ignoreVideoClick = useRef(false);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onOpen();
  }, [onOpen]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/media/videos/manifest.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [];
        const files = (await response.json()) as unknown;
        return Array.isArray(files)
          ? files.filter((file): file is string => typeof file === "string")
          : [];
      })
      .then((files) => {
        if (!active) return;
        const ordered = prioritizeLikes(files, loadLikes(VIDEO_LIKES_KEY));
        setVideos(ordered);
        setSelectedVideo(ordered[0] ?? null);
      })
      .catch(() => active && setVideos([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVideos((current) => prioritizeLikes(current, likedVideos));
  }, [likedVideos]);

  const selectedIndex = selectedVideo ? videos.indexOf(selectedVideo) : -1;
  const showVideo = (direction: -1 | 1) => {
    if (selectedIndex < 0 || videos.length < 2) return;
    setVideoDirection(direction === 1 ? "next" : "previous");
    setSelectedVideo(videos[(selectedIndex + direction + videos.length) % videos.length] ?? null);
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    const action = video.paused ? "play" : "pause";
    if (action === "play") void video.play();
    else video.pause();
    setPlaybackOverlay(action);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setPlaybackOverlay(null), 650);
  };
  const setVideoPlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    // Explicitly preserve pitch: some mobile browsers otherwise raise the
    // voice pitch at 2× even though their desktop defaults preserve it.
    video.preservesPitch = true;
    video.playbackRate = rate;
  };
  const toggleLike = () => {
    if (!selectedVideo) return;
    setLikedVideos((current) => {
      const next = new Set(current);
      if (next.has(selectedVideo)) next.delete(selectedVideo); else next.add(selectedVideo);
      saveLikes(VIDEO_LIKES_KEY, next);
      return next;
    });
    setLikeOverlay(true);
    if (likeOverlayTimer.current) clearTimeout(likeOverlayTimer.current);
    likeOverlayTimer.current = setTimeout(() => setLikeOverlay(false), 700);
  };

  useEffect(
    () => () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      if (reelTimer.current) clearTimeout(reelTimer.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (likeOverlayTimer.current) clearTimeout(likeOverlayTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    },
    [],
  );

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") showVideo(-1);
      if (event.key === "ArrowDown" || event.key === "ArrowRight") showVideo(1);
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close video player"
          className="absolute top-3 right-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-zinc-300 backdrop-blur transition-colors hover:bg-black/80 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        {selectedVideo ? (
          <div
            className="group relative h-full w-full"
            onTouchStart={(event) => {
              swipeStartY.current = event.touches[0]?.clientY ?? null;
              setIsDraggingReel(true);
              const now = Date.now();
              doubleTapPending.current = now - lastTapAt.current < 340;
              longPressActivated.current = false;
              if (doubleTapPending.current && singleTapTimer.current) {
                clearTimeout(singleTapTimer.current);
              }
              if (longPressTimer.current) clearTimeout(longPressTimer.current);
              longPressTimer.current = setTimeout(() => {
                if (videoRef.current) {
                  setVideoPlaybackRate(2);
                  setIsFastForward(true);
                  longPressActivated.current = true;
                }
              }, 450);
            }}
            onTouchMove={(event) => {
              if (longPressTimer.current) clearTimeout(longPressTimer.current);
              const start = swipeStartY.current;
              const current = event.touches[0]?.clientY;
              if (start === null || current === undefined) return;
              setDragOffset(
                Math.max(
                  -window.innerHeight * 0.7,
                  Math.min(window.innerHeight * 0.7, current - start),
                ),
              );
            }}
            onTouchEnd={(event) => {
              if (longPressTimer.current) clearTimeout(longPressTimer.current);
              setVideoPlaybackRate(1);
              setIsFastForward(false);
              const start = swipeStartY.current;
              swipeStartY.current = null;
              const end = event.changedTouches[0]?.clientY;
              if (start === null || end === undefined) return;
              const distance = end - start;
              setIsDraggingReel(false);
              if (Math.abs(distance) < 90 || videos.length < 2) {
                setDragOffset(0);
                if (longPressActivated.current) {
                  longPressActivated.current = false;
                  return;
                }
                ignoreVideoClick.current = true;
                window.setTimeout(() => {
                  ignoreVideoClick.current = false;
                }, 350);
                if (doubleTapPending.current) {
                  toggleLike();
                  lastTapAt.current = 0;
                  doubleTapPending.current = false;
                } else {
                  lastTapAt.current = Date.now();
                  singleTapTimer.current = setTimeout(() => {
                    togglePlayback();
                    lastTapAt.current = 0;
                  }, 340);
                }
                return;
              }
              didSwipe.current = true;
              const direction = distance < 0 ? 1 : -1;
              setDragOffset(distance < 0 ? -window.innerHeight : window.innerHeight);
              if (reelTimer.current) clearTimeout(reelTimer.current);
              reelTimer.current = setTimeout(() => {
                showVideo(direction);
                setDragOffset(0);
              }, 220);
            }}
            onTouchCancel={() => {
              if (longPressTimer.current) clearTimeout(longPressTimer.current);
              setVideoPlaybackRate(1);
              setIsFastForward(false);
              setIsDraggingReel(false);
              setDragOffset(0);
            }}
          >
            <div
              className={cn(
                "h-full w-full",
                !isDraggingReel && "transition-transform duration-200 ease-out",
              )}
              style={{ transform: `translateY(${dragOffset}px)` }}
            >
              <video
                ref={videoRef}
                key={`${selectedVideo}-${videoDirection}`}
                className={cn(
                  "h-full w-full cursor-pointer touch-none select-none object-contain [-webkit-touch-callout:none]",
                  videoDirection === "next" ? "reel-slide-in-up" : "reel-slide-in-down",
                )}
                autoPlay
                loop
                playsInline
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                onContextMenu={(event) => event.preventDefault()}
                onDragStart={(event) => event.preventDefault()}
                onClick={() => {
                  if (ignoreVideoClick.current) return;
                  if (didSwipe.current) {
                    didSwipe.current = false;
                    return;
                  }
                  togglePlayback();
                }}
                onDoubleClick={toggleLike}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onLoadedMetadata={(event) => {
                  event.currentTarget.preservesPitch = true;
                  event.currentTarget.playbackRate = 1;
                  setIsFastForward(false);
                  setVideoProgress(0);
                }}
                onTimeUpdate={(event) => {
                  const { currentTime, duration } = event.currentTarget;
                  setVideoProgress(
                    Number.isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0,
                  );
                }}
              >
                <source src={`/media/videos/${encodeURIComponent(selectedVideo)}`} />
                Your browser does not support video playback.
              </video>
            </div>
            {likeOverlay && (
              <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
                <Heart className="h-20 w-20 animate-in zoom-in-50 fade-in fill-red-500 text-red-500 drop-shadow-2xl duration-300" />
              </div>
            )}
            {isFastForward && (
              <span className="pointer-events-none absolute top-4 right-14 z-20 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
                2×
              </span>
            )}
            <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 h-1 bg-white/20">
              <span
                className="block h-full bg-red-500 transition-[width] duration-300 ease-out"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
            <div className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 flex-col gap-3 opacity-100 transition-opacity sm:right-5 sm:flex sm:opacity-0 sm:group-hover:opacity-100">
              <button
                type="button"
                onClick={toggleLike}
                aria-label={likedVideos.has(selectedVideo) ? "Unlike video" : "Like video"}
                className={cn("pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-black/50 backdrop-blur hover:bg-black/80", likedVideos.has(selectedVideo) ? "text-red-400" : "text-white")}
              >
                <Heart className={cn("h-5 w-5", likedVideos.has(selectedVideo) && "fill-current")} />
              </button>
              {videos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => showVideo(-1)}
                    aria-label="Previous video"
                    className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/80"
                  >
                    <ChevronUp className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => showVideo(1)}
                    aria-label="Next video"
                    className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/80"
                  >
                    <ChevronDown className="h-6 w-6" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={togglePlayback}
                aria-label={isPlaying ? "Pause video" : "Play video"}
                className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/80"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="h-5 w-5 fill-current" />
                )}
              </button>
            </div>
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
  return (
    decodeURIComponent(file)
      .split("/")
      .at(-1)
      ?.replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ") ?? file
  );
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
      ? ((bytes[offset] ?? 0) << 21) |
        ((bytes[offset + 1] ?? 0) << 14) |
        ((bytes[offset + 2] ?? 0) << 7) |
        (bytes[offset + 3] ?? 0)
      : ((bytes[offset] ?? 0) << 24) |
        ((bytes[offset + 1] ?? 0) << 16) |
        ((bytes[offset + 2] ?? 0) << 8) |
        (bytes[offset + 3] ?? 0);
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
      else
        while (
          imageStart + 1 < start + size &&
          ((bytes[imageStart] ?? 0) !== 0 || (bytes[imageStart + 1] ?? 0) !== 0)
        )
          imageStart += 2;
      if (encoding === 1 || encoding === 2) imageStart += 2;
      return imageStart < start + size
        ? new Blob([bytes.slice(imageStart, start + size)], { type: mime })
        : null;
    }
    offset = start + size;
  }
  return null;
}

export function MotivationalMusic({ onClose }: { onClose: () => void }) {
  const [tracks, setTracks] = useState<string[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [likedTracks, setLikedTracks] = useState(() => loadLikes(MUSIC_LIKES_KEY));
  const [minimized, setMinimized] = useState(false);
  const [miniCorner, setMiniCorner] = useState<PlayerCorner>("bottom-right");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState("");
  const [playbackPercent, setPlaybackPercent] = useState(0);
  const [repeatTrack, setRepeatTrack] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/media/music/manifest.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [];
        const files = (await response.json()) as unknown;
        return Array.isArray(files)
          ? files.filter((file): file is string => typeof file === "string")
          : [];
      })
      .then((files) => {
        if (!active) return;
        const ordered = prioritizeLikes(files, loadLikes(MUSIC_LIKES_KEY));
        setTracks(ordered);
        const initial = ordered[0] ?? null;
        const playlist = initial ? playlistName(initial) : "";
        setSelectedPlaylist(playlist);
        setSelectedTrack(initial);
      })
      .catch(() => active && setTracks([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setTracks((current) => prioritizeLikes(current, likedTracks));
  }, [likedTracks]);

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
    fetch(`/media/music/${encodeURIComponent(selectedTrack)}`)
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
  const playlistTracks = prioritizeLikes(
    tracks.filter((track) => playlistName(track) === selectedPlaylist),
    likedTracks,
  );
  const playingPlaylistTracks = selectedTrack
    ? prioritizeLikes(tracks.filter((track) => playlistName(track) === playlistName(selectedTrack)), likedTracks)
    : [];
  const trackIndex = selectedTrack ? playingPlaylistTracks.indexOf(selectedTrack) : -1;
  const showTrack = (direction: -1 | 1) => {
    if (trackIndex < 0 || playingPlaylistTracks.length < 2) return;
    setSelectedTrack(
      playingPlaylistTracks[
        (trackIndex + direction + playingPlaylistTracks.length) % playingPlaylistTracks.length
      ] ?? null,
    );
  };
  const choosePlaylist = (playlist: string) => {
    setSelectedPlaylist(playlist);
    const first = prioritizeLikes(
      tracks.filter((track) => playlistName(track) === playlist),
      likedTracks,
    )[0];
    if (first) setSelectedTrack(first);
  };
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };
  const toggleTrackLike = () => {
    if (!selectedTrack) return;
    setLikedTracks((current) => {
      const next = new Set(current);
      if (next.has(selectedTrack)) next.delete(selectedTrack); else next.add(selectedTrack);
      saveLikes(MUSIC_LIKES_KEY, next);
      return next;
    });
  };
  const handleRingPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    // The central record controls playback; the outer ring seeks through the song.
    if (Math.hypot(x, y) <= bounds.width * 0.39) {
      togglePlayback();
      return;
    }
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const angle = (Math.atan2(y, x) * 180) / Math.PI;
    const percent = ((angle + 450) % 360) / 3.6;
    audio.currentTime = (percent / 100) * audio.duration;
    setPlaybackPercent(percent);
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
      loop={repeatTrack}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onTimeUpdate={(event) => {
        const { currentTime, duration } = event.currentTarget;
        setPlaybackPercent(
          Number.isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0,
        );
      }}
      onEnded={() => {
        setIsPlaying(false);
        if (!repeatTrack) showTrack(1);
      }}
      src={`/media/music/${encodeURIComponent(selectedTrack)}`}
    />
  ) : null;

  if (minimized) {
    return (
      <>
        {audioPlayer}
        <FloatingMusicPlayer corner={miniCorner} onCornerChange={setMiniCorner}>
          <button
            type="button"
            onClick={togglePlayback}
            aria-label="Play or pause music"
            className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-full p-[2px]"
            style={{
              background: `conic-gradient(#ef4444 ${playbackPercent}%, rgba(255,255,255,0.12) 0)`,
            }}
          >
            <MusicRingLiquid progress={playbackPercent} playing={isPlaying} />
            <span className="relative z-10 grid h-full w-full place-items-center overflow-hidden rounded-full bg-[#1b1b1b]">
              {coverUrl ? (
                <img
                  draggable={false}
                  src={coverUrl}
                  alt="Album cover"
                  className={cn(
                    "music-cover-art h-full w-full select-none object-cover",
                    isPlaying && "music-cover-art-playing",
                  )}
                />
              ) : (
                <Music2 className="h-4 w-4" />
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="min-w-0 text-left"
            aria-label="Expand music player"
          >
            <span className="block max-w-40 truncate text-xs font-medium">
              {selectedTrack ? trackTitle(selectedTrack) : "Music"}
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close music player"
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/10 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </FloatingMusicPlayer>
      </>
    );
  }

  return (
    <>
      {audioPlayer}
      <div
        className="fixed inset-0 z-[75] grid place-items-center bg-black/90 p-4 backdrop-blur-md"
        onMouseDown={() => setMinimized(true)}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Motivational music"
          className="relative w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#171717] p-5 text-zinc-100 shadow-[0_24px_80px_-24px_black] sm:max-w-3xl sm:p-6"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close music player"
            className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="Minimize music player"
            className="absolute top-3 right-12 grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-100"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <div className="grid min-w-0 gap-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="flex min-h-64 flex-col items-center justify-center sm:order-2">
              <button
                type="button"
                onPointerDown={handleRingPointerDown}
                onDoubleClick={toggleTrackLike}
                className="relative grid h-24 w-24 touch-none select-none place-items-center overflow-visible rounded-full p-[3px] text-zinc-100 transition-transform hover:scale-105"
                style={{
                  background: `conic-gradient(#ef4444 ${playbackPercent}%, rgba(255,255,255,0.12) 0)`,
                }}
                aria-label="Play or pause music"
              >
                <MusicRingLiquid progress={playbackPercent} playing={isPlaying} />
                <span className="relative z-10 grid h-full w-full place-items-center overflow-hidden rounded-full bg-[#171717]">
                  {coverUrl ? (
                    <img
                      draggable={false}
                      src={coverUrl}
                      alt="Album cover"
                      className={cn(
                        "music-cover-art h-full w-full select-none object-cover",
                        isPlaying && "music-cover-art-playing",
                      )}
                    />
                  ) : (
                    <Music2 className="h-9 w-9" />
                  )}
                </span>
                <span
                  className="pointer-events-none absolute inset-0 z-20"
                  style={{ transform: `rotate(${playbackPercent * 3.6}deg)` }}
                >
                  <span className="absolute top-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-0.5 rounded-full border-2 border-[#171717] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                </span>
              </button>
              <p className="mt-5 w-56 max-w-full truncate text-center text-base font-semibold text-zinc-100">
                {selectedTrack ? trackTitle(selectedTrack) : "No music added"}
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={toggleTrackLike}
                  aria-label={likedTracks.has(selectedTrack ?? "") ? "Unlike song" : "Like song"}
                  className={cn("grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] hover:bg-white/10", likedTracks.has(selectedTrack ?? "") ? "text-red-400" : "text-zinc-200")}
                >
                  <Heart className={cn("h-4 w-4", likedTracks.has(selectedTrack ?? "") && "fill-current")} />
                </button>
                <button
                  type="button"
                  onClick={() => setRepeatTrack((current) => !current)}
                  aria-label={repeatTrack ? "Turn off repeat" : "Repeat current song"}
                  aria-pressed={repeatTrack}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full transition-colors",
                    repeatTrack
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/[0.06] text-zinc-200 hover:bg-white/10",
                  )}
                >
                  <Repeat2 className="h-4 w-4" />
                </button>
                {tracks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => showTrack(-1)}
                    aria-label="Previous song"
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-200 hover:bg-white/10"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                {tracks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => showTrack(1)}
                    aria-label="Next song"
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-200 hover:bg-white/10"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex min-w-0 max-h-72 flex-col sm:order-1">
              <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {playlists.map((playlist) => (
                  <button
                    key={playlist}
                    type="button"
                    onClick={() => choosePlaylist(playlist)}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 text-[10px] leading-none transition-colors",
                      selectedPlaylist === playlist
                        ? "bg-white/10 text-white"
                        : "text-zinc-400 hover:text-zinc-200",
                    )}
                  >
                    {playlist}
                  </button>
                ))}
              </div>
              <div className="min-w-0 max-w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {playlistTracks.map((track) => (
                  <button
                    key={track}
                    type="button"
                    onClick={() => setSelectedTrack(track)}
                    className={cn(
                      "w-full truncate rounded-lg px-3 py-2.5 text-left text-xs transition-colors",
                      selectedTrack === track
                        ? "bg-white/10 text-white"
                        : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
                    )}
                  >
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
  const navigate = useNavigate();
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [trackerActivityDates, setTrackerActivityDates] = useState<string[]>([]);
  const [taskActivityDates, setTaskActivityDates] = useState<string[]>([]);
  const [xpLevel, setXpLevel] = useState<number | null>(null);
  const [profile, setProfile] = useState<PracticeProfile | null | undefined>(undefined);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [celebratedStreak, setCelebratedStreak] = useState<number | null>(null);
  const [celebratedLevel, setCelebratedLevel] = useState<number | null>(null);
  const [streakReady, setStreakReady] = useState(false);
  const [manifestationOpen, setManifestationOpen] = useState(false);
  const authUser = useAuthUser();
  const previousStreak = useRef<number | null>(null);
  const previousXpLevel = useRef<number | null>(null);
  const navLinks = useRef(new Map<string, HTMLAnchorElement>());
  const navTimer = useRef<number | null>(null);
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [navIndicator, setNavIndicator] = useState({ left: 0, width: 0 });
  const visibleNav = nav.filter(
    (item) =>
      (item.url !== "/test" || profile?.practiceSessionEnabled !== false) &&
      (!(["/track", "/progress"] as string[]).includes(item.url) || profile?.trackProgressEnabled !== false),
  );
  const activeNavUrl = visibleNav.find((item) => path.startsWith(item.url))?.url;
  const navIndicatorUrl = navTarget ?? activeNavUrl;

  useEffect(() => {
    const updateIndicator = () => {
      const link = navIndicatorUrl ? navLinks.current.get(navIndicatorUrl) : undefined;
      if (link) setNavIndicator({ left: link.offsetLeft, width: link.offsetWidth });
    };
    const frame = requestAnimationFrame(updateIndicator);
    window.addEventListener("resize", updateIndicator);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateIndicator);
    };
  }, [navIndicatorUrl, profile?.practiceSessionEnabled, profile?.trackProgressEnabled]);

  useEffect(() => {
    if (navTarget && navTarget === activeNavUrl) setNavTarget(null);
  }, [activeNavUrl, navTarget]);

  useEffect(() => () => { if (navTimer.current) window.clearTimeout(navTimer.current); }, []);

  useEffect(() => {
    const refresh = () => {
      setRecords(loadHistory());
      const tracker = loadTrackerData();
      setTrackerActivityDates(trackerActiveDates(tracker));
      const tasks = loadDailyTasks();
      setTaskActivityDates(tasks.filter((task) => task.completed).map((task) => (task.completedAt ?? task.date).slice(0, 10)));
      setXpLevel(getXpSummary(tasks).level);
      setStreakReady(true);
    };
    refresh();
    window.addEventListener("cbt-tracker-updated", refresh);
    window.addEventListener("ssc-daily-tasks-updated", refresh);
    const stopPracticeObserver = onPracticePersist((key) => {
      if (key === "cbt-history") refresh();
    });
    return () => {
      window.removeEventListener("cbt-tracker-updated", refresh);
      window.removeEventListener("ssc-daily-tasks-updated", refresh);
      stopPracticeObserver();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setProfile(loadPracticeProfile());
    refresh();
    window.addEventListener("cbt-profile-updated", refresh);
    return () => window.removeEventListener("cbt-profile-updated", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    if (!authUser) { setProfileHydrated(true); return; }
    setProfileHydrated(false);
    const applyCloudProfile = (raw: Record<string, unknown> | null) => {
      const next = cloudPracticeProfile(raw);
      if (next) savePracticeProfile(next);
      if (active && next) setProfile(next);
      if (active) setProfileHydrated(true);
    };
    void readCloudProfile(authUser).then(applyCloudProfile).catch(() => { if (active) setProfileHydrated(true); });
    const unsubscribe = watchCloudProfile(authUser, applyCloudProfile);
    return () => { active = false; unsubscribe(); };
  }, [authUser?.uid]);

  useEffect(() => {
    if (!profile) return;
    setManifestationOpen(
      Boolean(profile.manifestation?.trim()) && !hasCompletedTodayManifestation(),
    );
  }, [profile]);

  useEffect(() => {
    if (!authUser || !profile?.username) return;
    const activity: Record<string, number> = {};
    const add = (value: string, count = 1) => {
      const date = value.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      activity[date] = (activity[date] ?? 0) + Math.max(1, Math.round(count));
    };
    records.forEach((record) => add(record.date));
    const tracker = loadTrackerData();
    tracker.tests.log.forEach((test) => add(test.date));
    tracker.activity.forEach((entry) => add(entry.date, Math.abs(Number(entry.count) || 1)));
    loadDailyTasks().filter((task) => task.completed).forEach((task) => add(task.completedAt ?? task.date));
    const publicRecords = records.map(({ questions: _questions, answerKey: _answerKey, questionIds: _questionIds, answers, ...record }) => ({
      ...record,
      // Retain only the number attempted for dashboard metrics, never selected answers.
      answers: answers.map((answer) => (answer ? "A" : null)),
    }));
    void savePublicProfileActivity(authUser, profile, activity, {
      records: publicRecords,
      tracker,
      dailyTasks: loadDailyTasks(),
    }).catch(() => undefined);
  }, [authUser, profile, records, trackerActivityDates]);

  const currentStreak = getStreaks([
    ...records,
    ...trackerActivityDates.map((date) => ({ date })),
    ...taskActivityDates.map((date) => ({ date })),
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

  useEffect(() => {
    if (xpLevel === null) return;
    if (previousXpLevel.current === null) { previousXpLevel.current = xpLevel; return; }
    if (xpLevel > previousXpLevel.current) setCelebratedLevel(xpLevel);
    previousXpLevel.current = xpLevel;
  }, [xpLevel]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#121212] text-zinc-100">
      <header className="h-16 border-0 bg-[#1b1b1b] text-zinc-100 shadow-none">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link
            to="/tasks"
            aria-label="Open daily tasks"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/15"
          >
            <GraduationCap className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
            {subtitle && <p className="truncate text-xs opacity-75 sm:text-sm">{subtitle}</p>}
          </div>
          {actions}
          <nav className="relative flex shrink-0 items-center gap-1">
            {navIndicator.width > 0 && <span aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 rounded-md bg-white/15 transition-[left,width] duration-300 ease-out" style={{ left: navIndicator.left, width: navIndicator.width }} />}
            {visibleNav.map((item) => {
              const active = path.startsWith(item.url);
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  ref={(node) => { if (node) navLinks.current.set(item.url, node); }}
                  onClick={(event) => {
                    if (path.startsWith(item.url)) return;
                    event.preventDefault();
                    if (navTimer.current) window.clearTimeout(navTimer.current);
                    setNavTarget(item.url);
                    navTimer.current = window.setTimeout(() => {
                      void navigate({ to: item.url });
                    }, 220);
                  }}
                  className={cn(
                    "app-nav-link relative z-10 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                    active
                      ? "is-active text-white"
                      : "text-white/70 hover:text-white",
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
            <StreakLiquidFlame active={currentStreak > 0} className="h-4 w-4" />
            <span>{currentStreak}</span>
          </Link>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full flex-1 px-4 py-6 sm:px-6",
          path === "/question-view" ? "max-w-7xl" : "max-w-5xl",
          (path === "/" ||
            path === "/profile" ||
            path === "/progress" ||
            path === "/mock-tests" ||
            path === "/test" ||
            path.startsWith("/question-bank") ||
            path === "/question-view" ||
            path.startsWith("/history")) &&
            "app-page-enter",
        )}
      >
        {children}
      </main>
      {profileHydrated && profile !== undefined && !profile?.username && authUser && <ProfileOnboarding user={authUser} existingProfile={profile} onComplete={setProfile} />}
      {profile?.manifestation && manifestationOpen && (
        <DailyManifestation
          manifestation={profile.manifestation}
          onComplete={() => setManifestationOpen(false)}
        />
      )}
      {celebratedStreak !== null && (
        <StreakCelebration streak={celebratedStreak} onClose={() => setCelebratedStreak(null)} />
      )}
      {celebratedLevel !== null && <LevelCelebration level={celebratedLevel} onClose={() => setCelebratedLevel(null)} />}
      {authUser && !manifestationOpen && celebratedStreak === null && celebratedLevel === null && <WeeklyAwardCelebration uid={authUser.uid} />}
    </div>
  );
}
