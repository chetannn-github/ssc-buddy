import AsyncStorage from "@react-native-async-storage/async-storage";

const OWNER_KEY = "ssc-buddy:local-cache-owner:v1";

// These are app-owned caches only. Firebase's own auth persistence is never
// removed, otherwise signing out would also break normal account switching.
const ACCOUNT_DATA_KEYS = [
  "ssc-buddy:tasks:v2",
  "ssc-buddy-mobile:tasks:v1",
  "cbt-subjects",
  "cbt-history",
  "cbt-favorite-questions",
  "cbt-marking",
  "ssc-buddy-mobile:practice-bank:v1",
  "ssc-buddy-mobile:practice-history:v1",
  "ssc-buddy-mobile:favourite-questions:v1",
  "ssc-buddy-mobile:tracker:v1",
  "ssc-buddy-mobile:mock-tests:v1",
  "cbt-practice-profile",
  "ssc-buddy-mobile:profile:v1",
  "ssc-buddy:unlock-quiz:v1",
] as const;

/**
 * Keeps offline cache private to a Firebase uid. First sign-in retains legacy
 * local data for migration; later sign-ins with a different uid start clean.
 */
export async function prepareMobileAccountCache(uid: string) {
  const owner = await AsyncStorage.getItem(OWNER_KEY);
  const switchedAccount = Boolean(owner && owner !== uid);
  if (switchedAccount) await AsyncStorage.multiRemove([...ACCOUNT_DATA_KEYS]);
  await AsyncStorage.setItem(OWNER_KEY, uid);
  return switchedAccount;
}
