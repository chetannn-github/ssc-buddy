import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { MotivationalMusic, MotivationalVideos } from "@/components/layout/AppShell";
import {
  isFirebaseConfigured,
  observeFirebaseUser,
  patchCloudProfile,
  patchCloudPreferences,
  readCloudProfile,
  readCloudPreferences,
  watchCloudProfile,
  watchCloudPreferences,
} from "@/lib/firebase-sync";
import { PROFILE_KEY } from "@/lib/profile";
import { startPracticeSync } from "@/lib/practice-sync";
import { AuthUserContext } from "@/lib/auth-context";
import type { User } from "firebase/auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            search={{}}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CBT MCQ Practice for Government Exams" },
      {
        name: "description",
        content:
          "Offline CBT-style answer marking app for SSC, UPSC, Banking and Railway aspirants.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "CBT MCQ Practice for Government Exams" },
      {
        property: "og:description",
        content:
          "Offline CBT-style answer marking app for SSC, UPSC, Banking and Railway aspirants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [musicOpen, setMusicOpen] = useState(false);
  const [videosOpen, setVideosOpen] = useState(false);

  const [syncUser, setSyncUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(!isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return observeFirebaseUser((user) => {
      setSyncUser(user);
      setAuthResolved(true);
    });
  }, []);

  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    if (isFirebaseConfigured && authResolved && !syncUser && path !== "/auth") {
      void navigate({ to: "/auth", replace: true });
    }
  }, [authResolved, navigate, path, syncUser]);

  useEffect(() => {
    if (!syncUser) return;
    const keys = [
      "ssc-buddy-liked-videos",
      "ssc-buddy-liked-music",
      "ssc-buddy-manifestation-completed",
      "cbt-test-dark-mode",
    ] as const;
    let applying = false;
    let last = "";
    const read = () =>
      Object.fromEntries(
        keys.flatMap((key) => {
          const value = localStorage.getItem(key);
          return value === null
            ? []
            : [
                [
                  key,
                  key.includes("liked") || key === "cbt-test-dark-mode" ? JSON.parse(value) : value,
                ],
              ];
        }),
      );
    const apply = (value: Record<string, unknown>) => {
      applying = true;
      keys.forEach((key) => {
        if (value[key] !== undefined)
          localStorage.setItem(
            key,
            typeof value[key] === "string" ? (value[key] as string) : JSON.stringify(value[key]),
          );
      });
      const next = JSON.stringify(read());
      if (next !== last) {
        last = next;
        window.dispatchEvent(new Event("ssc-preferences-updated"));
      }
      queueMicrotask(() => {
        applying = false;
      });
    };
    let stop: (() => void) | undefined;
    void (async () => {
      const remote = await readCloudPreferences(syncUser);
      if (remote) apply(remote);
      else {
        const initial = read();
        await patchCloudPreferences(syncUser, initial);
        last = JSON.stringify(initial);
      }
      stop = watchCloudPreferences(syncUser, (value) => {
        if (value) apply(value);
      });
    })().catch(() => undefined);
    const save = () => {
      if (applying) return;
      const next = read();
      const previous = last ? (JSON.parse(last) as Record<string, unknown>) : {};
      const changed = Object.fromEntries(
        Object.entries(next).filter(
          ([key, value]) => JSON.stringify(previous[key]) !== JSON.stringify(value),
        ),
      );
      if (Object.keys(changed).length) {
        last = JSON.stringify(next);
        void patchCloudPreferences(syncUser, changed);
      }
    };
    window.addEventListener("ssc-preferences-updated", save);
    return () => {
      stop?.();
      window.removeEventListener("ssc-preferences-updated", save);
    };
  }, [syncUser]);

  useEffect(() => {
    if (!syncUser) return;
    let cleanup: (() => void) | undefined;
    void startPracticeSync(syncUser)
      .then((stop) => {
        cleanup = stop;
      })
      .catch(() => undefined);
    return () => cleanup?.();
  }, [syncUser]);

  // Profile is deliberately synced as its own document: mobile writes cannot replace the
  // browser's full local-storage backup, and both clients use the same key and JSON.
  useEffect(() => {
    if (!syncUser) return;
    let disposed = false;
    let stopWatch: (() => void) | undefined;
    let applyingRemote = false;
    let lastProfile = "";
    const clean = (profile: Record<string, unknown>) =>
      Object.fromEntries(
        ["name", "questionGoal", "examName", "manifestation", "avatar"]
          .filter((key) => profile[key] !== undefined)
          .map((key) => [key, profile[key]]),
      );
    const apply = (profile: Record<string, unknown>) => {
      const raw = JSON.stringify(clean(profile));
      // `savePracticeProfile` and Firestore can serialize identical fields in a different
      // property order. Comparing the raw JSON used to turn every profile snapshot into a
      // fresh local event, which could repeatedly refresh the Profile route after Save.
      try {
        const stored = localStorage.getItem(PROFILE_KEY);
        if (
          stored &&
          JSON.stringify(clean(JSON.parse(stored) as Record<string, unknown>)) === raw
        ) {
          lastProfile = raw;
          return;
        }
      } catch {
        // A corrupt local value is safely replaced by the canonical cloud profile below.
      }
      applyingRemote = true;
      localStorage.setItem(PROFILE_KEY, raw);
      lastProfile = raw;
      window.dispatchEvent(new Event("cbt-profile-updated"));
      queueMicrotask(() => {
        applyingRemote = false;
      });
    };
    const save = () => {
      const value = localStorage.getItem(PROFILE_KEY);
      if (applyingRemote || !value) return;
      try {
        const next = clean(JSON.parse(value) as Record<string, unknown>);
        const previous = lastProfile ? (JSON.parse(lastProfile) as Record<string, unknown>) : {};
        const changed = Object.fromEntries(
          Object.entries(next).filter(([key, field]) => previous[key] !== field),
        );
        if (Object.keys(changed).length) {
          lastProfile = JSON.stringify(next);
          void patchCloudProfile(syncUser, changed);
        }
      } catch {
        /* invalid local profile is ignored */
      }
    };
    const start = async () => {
      const remote = await readCloudProfile(syncUser);
      if (disposed) return;
      const local = localStorage.getItem(PROFILE_KEY);
      if (remote) apply(remote);
      else if (local) {
        const profile = JSON.parse(local) as Record<string, unknown>;
        await patchCloudProfile(syncUser, clean(profile));
        lastProfile = JSON.stringify(clean(profile));
      }
      if (disposed) return;
      stopWatch = watchCloudProfile(syncUser, (profile) => {
        if (profile) apply(profile);
      });
      window.addEventListener("cbt-profile-updated", save);
    };
    void start();
    return () => {
      disposed = true;
      stopWatch?.();
      window.removeEventListener("cbt-profile-updated", save);
    };
  }, [syncUser]);

  useEffect(() => {
    const openMusic = () => setMusicOpen(true);
    window.addEventListener("ssc-music-open", openMusic);
    return () => window.removeEventListener("ssc-music-open", openMusic);
  }, []);
  useEffect(() => {
    const openVideos = () => setVideosOpen(true);
    window.addEventListener("ssc-videos-open", openVideos);
    return () => window.removeEventListener("ssc-videos-open", openVideos);
  }, []);

  return (
    <AuthUserContext.Provider value={syncUser}>
      <QueryClientProvider client={queryClient}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        {musicOpen && <MotivationalMusic onClose={() => setMusicOpen(false)} />}
        {videosOpen && (
          <MotivationalVideos
            onOpen={() => window.dispatchEvent(new Event("ssc-music-pause"))}
            onClose={() => setVideosOpen(false)}
          />
        )}
      </QueryClientProvider>
    </AuthUserContext.Provider>
  );
}
