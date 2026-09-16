import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  FilePenLine,
  Flame,
  GraduationCap,
  Route as RouteIcon,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [countdowns, setCountdowns] = useState([
    { id: "countdown-1", name: "", date: "" },
    { id: "countdown-2", name: "", date: "" },
  ]);
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
        countdowns: countdowns.filter((countdown) => countdown.name.trim() && countdown.date),
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
          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-200">
              Countdowns <span className="font-normal text-zinc-500">(up to 2)</span>
            </p>
            {countdowns.map((countdown, index) => (
              <div key={countdown.id} className="grid gap-2 sm:grid-cols-[1fr_0.8fr]">
                <Input
                  className="h-11 border-white/10 bg-zinc-900 text-zinc-100"
                  value={countdown.name}
                  onChange={(event) =>
                    setCountdowns((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder={`Countdown ${index + 1} name`}
                />
                <Input
                  className="h-11 border-white/10 bg-zinc-900 text-zinc-100"
                  type="date"
                  value={countdown.date}
                  onChange={(event) =>
                    setCountdowns((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, date: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
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
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
      <section className="streak-celebration relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#1b1b1b] px-7 py-8 text-center text-zinc-100 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]">
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_50%_0%,rgba(96,165,250,0.2),transparent_70%)]" />
        <button
          type="button"
          aria-label="Close streak celebration"
          onClick={onClose}
          className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-300 shadow-[0_0_40px_rgba(251,191,36,0.16)]">
          <Flame className="streak-celebration-flame h-9 w-9 fill-current" />
        </div>
        <p className="relative mt-5 text-[11px] font-semibold tracking-[0.2em] text-zinc-400 uppercase">
          Streak increased
        </p>
        <p className="relative mt-2 text-3xl font-bold text-white">{streak} day streak!</p>
        <p className="relative mt-2 text-sm text-zinc-400">You showed up again today. Keep going.</p>
        <button
          type="button"
          onClick={onClose}
          className="relative mt-6 w-full rounded-xl bg-blue-400 px-4 py-3 text-sm font-semibold text-[#101827] transition-colors hover:bg-blue-300"
        >
          Keep going
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
            className="h-11 border-white/10 bg-black/30 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-500"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
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

export function AppShell({ title, subtitle, actions, children }: Props) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [trackerActivityDates, setTrackerActivityDates] = useState<string[]>([]);
  const [profile, setProfile] = useState<PracticeProfile | null | undefined>(undefined);
  const [celebratedStreak, setCelebratedStreak] = useState<number | null>(null);
  const [streakReady, setStreakReady] = useState(false);
  const [manifestationOpen, setManifestationOpen] = useState(false);
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
      {celebratedStreak !== null && (
        <StreakCelebration streak={celebratedStreak} onClose={() => setCelebratedStreak(null)} />
      )}
    </div>
  );
}
