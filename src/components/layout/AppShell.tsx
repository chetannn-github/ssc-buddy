import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Flame, GraduationCap, History, PenSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStreaks } from "@/lib/analytics";
import { loadHistory, type TestRecord } from "@/lib/exam";
import { loadPracticeProfile, savePracticeProfile, type PracticeProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
};

const nav = [
  { title: "New test", url: "/test", icon: PenSquare },
  { title: "History", url: "/history", icon: History },
] as const;

type AppPath = "/" | "/test" | "/history";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<unknown>) => { finished: Promise<void> };
};

function ProfileOnboarding({ onComplete }: { onComplete: (profile: PracticeProfile) => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("100");
  const parsedGoal = Math.max(1, Math.min(100000, Number(goal) || 0));
  const canContinue = name.trim().length > 0 && Number(goal) >= 1;

  const submit = () => {
    if (!canContinue) return;
    const profile = { name: name.trim(), questionGoal: parsedGoal };
    savePracticeProfile(profile);
    onComplete(profile);
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
        </div>
        <Button
          className="mt-6 h-11 w-full bg-emerald-600 hover:bg-emerald-500"
          disabled={!canContinue}
          onClick={submit}
        >
          Create my profile
        </Button>
      </section>
    </div>
  );
}

export function AppShell({ title, subtitle, actions, children }: Props) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [profile, setProfile] = useState<PracticeProfile | null | undefined>(undefined);

  useEffect(() => {
    const refresh = () => setRecords(loadHistory());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setProfile(loadPracticeProfile());
    refresh();
    window.addEventListener("cbt-profile-updated", refresh);
    return () => window.removeEventListener("cbt-profile-updated", refresh);
  }, []);

  const currentStreak = getStreaks(records).current;
  const isProfilePage = path === "/" || path === "/profile";
  const navigateWithThemeTransition = (event: MouseEvent<HTMLAnchorElement>, to: AppPath) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      path === to
    ) {
      return;
    }

    event.preventDefault();
    const viewDocument = document as ViewTransitionDocument;
    const transitionName = isProfilePage && to !== "/" ? "to-light" : "to-profile";
    if (!viewDocument.startViewTransition) {
      void navigate({ to });
      return;
    }

    const transition = viewDocument.startViewTransition(() => {
      document.documentElement.dataset["profileTransition"] = transitionName;
      return navigate({ to });
    });
    void transition.finished.finally(() => {
      delete document.documentElement.dataset["profileTransition"];
    });
  };

  return (
    <div
      className={cn(
        "flex min-h-screen w-full flex-col",
        isProfilePage ? "bg-[#121212]" : "bg-background",
      )}
    >
      <header
        className={cn(
          "h-16 border-0 shadow-none",
          isProfilePage ? "bg-[#1b1b1b] text-zinc-100" : "text-exam-header-foreground",
        )}
        style={isProfilePage ? undefined : { backgroundImage: "var(--gradient-header)" }}
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
                  onClick={(event) => navigateWithThemeTransition(event, item.url)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                    active
                      ? "bg-white/15 text-white"
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
            onClick={(event) => navigateWithThemeTransition(event, "/")}
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      {profile === null && <ProfileOnboarding onComplete={setProfile} />}
    </div>
  );
}
