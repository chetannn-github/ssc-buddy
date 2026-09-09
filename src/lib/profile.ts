export type PracticeProfile = {
  name: string;
  questionGoal: number;
};

const PROFILE_KEY = "cbt-practice-profile";

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
    return { name: profile.name.trim(), questionGoal: Math.round(profile.questionGoal) };
  } catch {
    return null;
  }
}

export function savePracticeProfile(profile: PracticeProfile) {
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      name: profile.name.trim(),
      questionGoal: Math.max(1, Math.round(profile.questionGoal)),
    }),
  );
  window.dispatchEvent(new Event("cbt-profile-updated"));
}
