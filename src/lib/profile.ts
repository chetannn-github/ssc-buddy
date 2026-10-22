import { normalizeAppAccent, type AppAccent } from "./app-accent";
export type PracticeProfile = {
  name: string;
  username?: string;
  questionGoal: number;
  avatar?: string;
  manifestation?: string;
  /** Kept with the profile so web and mobile render the same identity. */
  examName?: string;
  practiceSessionEnabled?: boolean;
  trackProgressEnabled?: boolean; showTrackerOnProfile?: boolean;
  timersEnabled?: boolean;
  habitsEnabled?: boolean;
  randomQuotesEnabled?: boolean;
  accentColor?: AppAccent;
};

export const PROFILE_KEY = "cbt-practice-profile";

export function loadPracticeProfile(): PracticeProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as Partial<PracticeProfile>;
    if (
      !profile.name?.trim() ||
      typeof profile.questionGoal !== "number" ||
      !Number.isFinite(profile.questionGoal) ||
      profile.questionGoal < 1
    ) {
      return null;
    }
    return {
      accentColor: normalizeAppAccent(profile.accentColor),
      name: profile.name.trim(),
      ...(typeof profile.username === "string" && profile.username.trim()
        ? { username: profile.username.trim().toLowerCase() }
        : {}),
      questionGoal: Math.round(profile.questionGoal),
      ...(typeof profile.avatar === "string" ? { avatar: profile.avatar } : {}),
      ...(typeof profile.manifestation === "string" && profile.manifestation.trim()
        ? { manifestation: profile.manifestation.trim().toUpperCase() }
        : {}),
      ...(typeof profile.examName === "string" && profile.examName.trim()
        ? { examName: profile.examName.trim() }
        : {}),
      ...(typeof profile.practiceSessionEnabled === "boolean" ? { practiceSessionEnabled: profile.practiceSessionEnabled } : {}),
      ...(typeof profile.trackProgressEnabled === "boolean" ? { trackProgressEnabled: profile.trackProgressEnabled } : {}),
      ...(typeof profile.showTrackerOnProfile === "boolean" ? { showTrackerOnProfile: profile.showTrackerOnProfile } : {}),
      ...(typeof profile.timersEnabled === "boolean" ? { timersEnabled: profile.timersEnabled } : {}),
      ...(typeof profile.habitsEnabled === "boolean" ? { habitsEnabled: profile.habitsEnabled } : {}),
      ...(typeof profile.randomQuotesEnabled === "boolean" ? { randomQuotesEnabled: profile.randomQuotesEnabled } : {}),
    };
  } catch {
    return null;
  }
}

export function savePracticeProfile(profile: PracticeProfile) {
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      accentColor: normalizeAppAccent(profile.accentColor),
      name: profile.name.trim(),
      ...(profile.username?.trim() ? { username: profile.username.trim().toLowerCase() } : {}),
      questionGoal: Math.max(1, Math.round(profile.questionGoal)),
      ...(profile.avatar ? { avatar: profile.avatar } : {}),
      ...(profile.manifestation?.trim()
        ? { manifestation: profile.manifestation.trim().toUpperCase() }
        : {}),
      ...(profile.examName?.trim() ? { examName: profile.examName.trim() } : {}),
      ...(profile.practiceSessionEnabled === false ? { practiceSessionEnabled: false } : {}),
      ...(profile.trackProgressEnabled === false ? { trackProgressEnabled: false } : {}),
      ...(profile.showTrackerOnProfile === false ? { showTrackerOnProfile: false } : {}),
      ...(profile.timersEnabled === false ? { timersEnabled: false } : {}),
      ...(profile.habitsEnabled === false ? { habitsEnabled: false } : {}),
      ...(profile.randomQuotesEnabled === false ? { randomQuotesEnabled: false } : {}),
    }),
  );
  window.dispatchEvent(new Event("cbt-profile-updated"));
}

export function clearPracticeProfile() {
  localStorage.removeItem(PROFILE_KEY);
  window.dispatchEvent(new Event("cbt-profile-updated"));
}
