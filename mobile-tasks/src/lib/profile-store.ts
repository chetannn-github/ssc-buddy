import AsyncStorage from "@react-native-async-storage/async-storage";

export const PROFILE_KEY = "cbt-practice-profile";
const LEGACY_PROFILE_KEY = "ssc-buddy-mobile:profile:v1";

export type PracticeProfile = {
  name: string;
  questionGoal: number;
  avatar?: string;
  manifestation?: string;
  examName?: string;
};

export const defaultProfile = (): PracticeProfile => ({ name: "", questionGoal: 100, examName: "SSC CGL 2027", manifestation: "" });

export function normalizeProfile(value: unknown): PracticeProfile {
  const profile = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const legacyGoal = typeof profile.goal === "string" || typeof profile.goal === "number" ? Number(profile.goal) : 100;
  const questionGoal = typeof profile.questionGoal === "number" ? profile.questionGoal : legacyGoal;
  return {
    name: typeof profile.name === "string" ? profile.name.trim() : "",
    questionGoal: Math.max(1, Math.min(100000, Math.round(Number.isFinite(questionGoal) ? questionGoal : 100))),
    ...(typeof profile.avatar === "string" && profile.avatar ? { avatar: profile.avatar } : {}),
    ...(typeof profile.manifestation === "string" && profile.manifestation.trim() ? { manifestation: profile.manifestation.trim().toUpperCase() } : {}),
    examName: typeof profile.examName === "string" && profile.examName.trim() ? profile.examName.trim() : "SSC CGL 2027",
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
