import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Profile } from "./profile";
import { loadPracticeProfile } from "@/lib/profile";

const title = "Profile";
const description = "Your yearly practice activity and progress.";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: `${title} · SSC Buddy` }, { property: "og:title", content: `${title} · SSC Buddy` }, { name: "description", content: description }] }),
  component: HomeProfile,
});

function HomeProfile() {
  const [profile, setProfile] = useState(loadPracticeProfile());
  useEffect(() => {
    const refresh = () => setProfile(loadPracticeProfile());
    window.addEventListener("cbt-profile-updated", refresh);
    return () => window.removeEventListener("cbt-profile-updated", refresh);
  }, []);
  useEffect(() => {
    if (!profile?.username) return;
    // Keep the public URL literal without restarting the entire app.
    const profilePath = `/@${profile.username}`;
    if (window.location.pathname === profilePath) return;
    window.history.replaceState(null, "", profilePath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [profile?.username]);
  if (profile?.username) return null;
  return <Profile />;
}
