import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { readPublicProfile, type PublicProfile } from "@/lib/firebase-sync";
import { useAuthUser } from "@/lib/auth-context";
import { loadPracticeProfile } from "@/lib/profile";
import { Profile } from "./profile";

export const Route = createFileRoute("/$username")({
  head: () => ({ meta: [{ title: "Public Profile · SSC Buddy" }, { property: "og:title", content: "Public Profile · SSC Buddy" }] }),
  component: PublicProfilePage });

function PublicProfilePage() {
  const { username: rawUsername } = Route.useParams();
  const decodedUsername = rawUsername.startsWith("%40") ? `@${rawUsername.slice(3)}` : rawUsername;
  const username = decodedUsername.startsWith("@") ? decodedUsername.slice(1) : "";
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const authUser = useAuthUser();
  const localProfile = loadPracticeProfile();

  useEffect(() => {
    const canonicalPath = `/@${username}`;
    if (username && window.location.pathname !== canonicalPath) {
      window.history.replaceState(null, "", canonicalPath);
    }
  }, [username]);

  useEffect(() => {
    let active = true;
    if (!username) { setProfile(null); return; }
    void readPublicProfile(username).then((next) => { if (active) setProfile(next); }).catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, [username]);

  // The local profile is already the signed-in user's own data, so don't wait for
  // auth/public-profile reads before opening their editable profile.
  if (localProfile?.username === username || (profile && authUser?.uid === profile.uid)) return <Profile />;

  if (profile) return <Profile readOnly publicProfile={profile} />;

  return <AppShell title="Profile">
    <div className="profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 pt-5 pb-10 text-zinc-100 sm:-mx-6 sm:px-6 sm:pt-6 sm:pb-14">
      <div className="mx-auto max-w-4xl">
        {profile === undefined ? <p className="pt-12 text-center text-sm text-zinc-500">Loading profile…</p> : <div className="pt-12 text-center"><h1 className="text-xl font-semibold text-zinc-100">Profile not found</h1><p className="mt-2 text-sm text-zinc-500">This username does not have a public profile.</p></div>}
      </div>
    </div>
  </AppShell>;
}
