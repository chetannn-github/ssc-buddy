import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { GraduationCap, History, LayoutDashboard, PenSquare } from "lucide-react";
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

export function AppShell({ title, subtitle, actions, children }: Props) {
  const path = useRouterState({ select: (r) => r.location.pathname });

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
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
