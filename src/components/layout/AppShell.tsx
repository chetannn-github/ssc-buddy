import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Flame, GraduationCap, History, LayoutDashboard, PenSquare } from "lucide-react";
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
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "New test", url: "/test", icon: PenSquare },
  { title: "History", url: "/history", icon: History },
];

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-[0_24px_70px_-24px_oklch(0.24_0.05_259_/_0.55)] sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <GraduationCap className="h-6 w-6" />
        </span>
        <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-primary uppercase">Welcome</p>
        <h2 className="mt-1 text-2xl font-semibold">Let’s set your practice goal</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We’ll use this to personalise your profile and track your progress.
        </p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Your name
            <Input
              className="mt-2 h-11"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
          </label>
          <label className="block text-sm font-medium">
            Questions you want to complete
            <Input
              className="mt-2 h-11"
              inputMode="numeric"
              value={goal}
              onChange={(event) => setGoal(event.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 500"
            />
          </label>
        </div>
        <Button className="mt-6 h-11 w-full" disabled={!canContinue} onClick={submit}>
          Create my profile
        </Button>
      </section>
    </div>
  );
}

export function AppShell({ title, subtitle, actions, children }: Props) {
  const path = useRouterState({ select: (r) => r.location.pathname });
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

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header
        className="h-16 text-exam-header-foreground"
        style={{ backgroundImage: "var(--gradient-header)" }}
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
              const active = item.url === "/" ? path === "/" : path.startsWith(item.url);
              return (
                <Link
                  key={item.url}
                  to={item.url}
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
            to="/profile"
            aria-label={`Practice streak: ${currentStreak} days`}
            className={cn(
              "ml-1 flex h-9 min-w-12 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all",
              currentStreak > 0
                ? "bg-amber-400/20 text-amber-200 shadow-[0_0_18px_oklch(0.82_0.17_85_/_0.48)] ring-1 ring-amber-300/35 hover:bg-amber-400/30"
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
