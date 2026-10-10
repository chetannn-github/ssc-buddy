import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, GraduationCap, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  downloadCloudSnapshot,
  hasCloudSnapshot,
  hasMeaningfulLocalData,
  isFirebaseConfigured,
  observeFirebaseUser,
  signInFirebase,
  signInWithGoogleFirebase,
} from "@/lib/firebase-sync";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(isFirebaseConfigured);
  const [message, setMessage] = useState("");
  const hasCheckedExistingSession = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return observeFirebaseUser((user) => {
      setChecking(false);
      if (!hasCheckedExistingSession.current) {
        hasCheckedExistingSession.current = true;
        if (user) void navigate({ to: "/", replace: true });
      }
    });
  }, [navigate]);

  const finishAuthentication = async (user: Awaited<ReturnType<typeof signInFirebase>>) => {
    if (!hasMeaningfulLocalData() && await hasCloudSnapshot(user)) await downloadCloudSnapshot(user);
    await navigate({ to: "/", replace: true });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setMessage("");
    try {
      let user;
      try {
        user = await signInFirebase(email.trim(), password);
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
        user = await signInFirebase(email.trim(), password, true);
      }
      await finishAuthentication(user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setMessage("");
    try {
      await finishAuthentication(await signInWithGoogleFirebase());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in with Google.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return <main className="grid min-h-screen place-items-center bg-[#121212] text-zinc-300"><LoaderCircle className="h-5 w-5 animate-spin" /></main>;

  return (
    <main className="min-h-screen overflow-hidden bg-[#121212] text-zinc-100 lg:grid lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-white/[0.06] bg-[#171717] lg:block">
        <img src="/auth.jpg" alt="Focused study" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,18,18,.82),rgba(18,18,18,.3)),linear-gradient(0deg,rgba(18,18,18,.8),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3 text-zinc-100"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><GraduationCap className="h-5 w-5" /></span><span className="font-semibold">SSC Buddy</span></div>
          <div className="max-w-md"><p className="text-xs font-semibold tracking-[.2em] text-emerald-300 uppercase">Your preparation, in sync</p><h1 className="mt-4 text-5xl font-semibold leading-tight tracking-tight">Study anywhere.<br />Pick up exactly where you left off.</h1><p className="mt-5 text-base leading-7 text-zinc-400">Your practice, tracker, favourites and progress stay private to your account.</p></div>
          <p className="text-sm text-zinc-600">Built for focused SSC preparation.</p>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><GraduationCap className="h-5 w-5" /></span><h1 className="mt-4 text-2xl font-semibold">SSC Buddy</h1></div>
          <p className="text-xs font-semibold tracking-[.18em] text-emerald-300 uppercase">Your private workspace</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Continue to SSC Buddy</h2>
          <p className="mt-2 text-sm text-zinc-400">Sign in if you already have an account. Otherwise, we’ll create one for you.</p>
          {!isFirebaseConfigured ? <p className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">Firebase is not configured yet. Add the values from <code>.env.example</code> to <code>.env.local</code>.</p> : <>
            <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
              <input className="h-12 w-full rounded-full border border-white/10 bg-white/[.04] px-5 text-sm outline-none transition focus:border-emerald-400/60" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus />
              <div className="relative"><input className="h-12 w-full rounded-full border border-white/10 bg-white/[.04] px-5 pr-12 text-sm outline-none transition focus:border-emerald-400/60" type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="absolute top-1/2 right-4 -translate-y-1/2 text-zinc-500 hover:text-zinc-200" type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
              <button className="flex h-12 w-full items-center justify-center rounded-full bg-emerald-500 text-sm font-semibold text-[#06251d] transition hover:bg-emerald-400 disabled:opacity-60" disabled={loading}>Continue</button>
            </form>
            <div className="my-5 flex items-center gap-3 text-xs text-zinc-600 before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10">OR</div>
            <button className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[.04] text-sm font-medium transition hover:bg-white/[.08] disabled:opacity-60" type="button" disabled={loading} onClick={() => void signInWithGoogle()}><img src="/google.png" alt="" aria-hidden="true" className="h-4 w-4" />Continue with Google</button>
            {message && <p className="mt-4 text-center text-sm text-amber-300">{message}</p>}
          </>}
        </div>
      </section>
      {loading && <div className="fixed inset-0 z-50 grid place-items-center bg-[#121212]/85 backdrop-blur-md"><div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#1d1d1d] px-7 py-6 shadow-2xl"><LoaderCircle className="h-6 w-6 animate-spin text-emerald-300" /><p className="text-sm font-medium text-zinc-200">Securing your workspace…</p></div></div>}
    </main>
  );
}
