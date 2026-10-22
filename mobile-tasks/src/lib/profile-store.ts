import { normalizeAppAccent, type AppAccent } from "../domain/app-accent";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const PROFILE_KEY = "cbt-practice-profile";
const LEGACY_PROFILE_KEY = "ssc-buddy-mobile:profile:v1";

export type PracticeProfile = {
  name: string;
  username?: string;
  questionGoal: number;
  avatar?: string;
  manifestation?: string;
  examName?: string;
  practiceSessionEnabled?: boolean;
  trackProgressEnabled?: boolean; showTrackerOnProfile?: boolean;
  timersEnabled?: boolean;
  habitsEnabled?: boolean;
  randomQuotesEnabled?: boolean;
  accentColor?: AppAccent;
};

export const defaultProfile = (): PracticeProfile => ({ name: "", questionGoal: 100, manifestation: "" });

export function normalizeProfile(value: unknown): PracticeProfile {
  const profile = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const legacyGoal = typeof profile.goal === "string" || typeof profile.goal === "number" ? Number(profile.goal) : 100;
  const questionGoal = typeof profile.questionGoal === "number" ? profile.questionGoal : legacyGoal;
  return {
    accentColor: normalizeAppAccent(profile.accentColor),
    name: typeof profile.name === "string" ? profile.name.trim() : "",
    ...(typeof profile.username === "string" && profile.username.trim() ? { username: profile.username.trim().toLowerCase() } : {}),
    questionGoal: Math.max(1, Math.min(100000, Math.round(Number.isFinite(questionGoal) ? questionGoal : 100))),
    ...(typeof profile.avatar === "string" && profile.avatar ? { avatar: profile.avatar } : {}),
    ...(typeof profile.manifestation === "string" && profile.manifestation.trim() ? { manifestation: profile.manifestation.trim().toUpperCase() } : {}),
    ...(typeof profile.examName === "string" && profile.examName.trim() ? { examName: profile.examName.trim() } : {}),
    ...(typeof profile.practiceSessionEnabled === "boolean" ? { practiceSessionEnabled: profile.practiceSessionEnabled } : {}),
    ...(typeof profile.trackProgressEnabled === "boolean" ? { trackProgressEnabled: profile.trackProgressEnabled } : {}),
    ...(typeof profile.showTrackerOnProfile === "boolean" ? { showTrackerOnProfile: profile.showTrackerOnProfile } : {}),
    ...(typeof profile.timersEnabled === "boolean" ? { timersEnabled: profile.timersEnabled } : {}),
    ...(typeof profile.habitsEnabled === "boolean" ? { habitsEnabled: profile.habitsEnabled } : {}),
      ...(typeof profile.randomQuotesEnabled === "boolean" ? { randomQuotesEnabled: profile.randomQuotesEnabled } : {}),
  };
}

export async function loadProfile() {
  const current = await AsyncStorage.getItem(PROFILE_KEY);
  if (current) {
    try { return normalizeProfile(JSON.parse(current)); } catch { /* fall through */ }
  }
  const legacy = await AsyncStorage.getItem(LEGACY_PROFILE_KEY);
  if (legacy) {
    try {
      const migrated = normalizeProfile(JSON.parse(legacy));
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(migrated));
      await AsyncStorage.removeItem(LEGACY_PROFILE_KEY);
      return migrated;
    } catch { /* default below */ }
  }
  return defaultProfile();
}

export async function saveProfile(profile: PracticeProfile) {
  const normalized = normalizeProfile(profile);
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(normalized));
  return normalized;
}
