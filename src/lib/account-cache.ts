/**
 * Browser cache is intentionally account-scoped. Firebase Auth itself keeps
 * its own credentials, so only SSC Buddy's application data is cleared here.
 */
const OWNER_KEY = "ssc-buddy:local-cache-owner:v1";

const ACCOUNT_DATA_KEYS = [
  "ssc-buddy:active-test:v1",
  "ssc-buddy:tasks:v2",
  "cbt-subjects",
  "cbt-history",
  "cbt-marking",
  "cbt-favorite-questions",
  "ssc-buddy-question-learning",
  "cbt-study-store-version",
  "cbt-practice-profile",
  "ssc-cgl-2027-tracker-v1",
  "ssc-buddy-liked-videos",
  "ssc-buddy-liked-music",
  "ssc-buddy-manifestation-completed",
  "cbt-test-dark-mode",
  "ssc-buddy-firebase-last-sync",
] as const;

/**
 * Returns true only when a previous account's cache was discarded.
 * The first signed-in account keeps pre-cloud local data for one-time migration.
 */
export function prepareWebAccountCache(uid: string) {
  const owner = localStorage.getItem(OWNER_KEY);
  const switchedAccount = Boolean(owner && owner !== uid);
  if (switchedAccount) {
    ACCOUNT_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  }
  localStorage.setItem(OWNER_KEY, uid);
  return switchedAccount;
}
