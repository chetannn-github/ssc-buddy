import { collection, doc, getDoc, getDocs, type Firestore } from "firebase/firestore";
import { observeOnce } from "../../shared/read-once";
import { emptyFocusDay, studyTimeZone, type FocusDay } from "../../shared/study-focus";
import { publishStudyFocusDay, studyControlPath, type StudyControl } from "../../shared/study-lock";

// Display-only adapters retain the shared hook's API. Focus Lock enforcement
// must keep using shared/study-lock's live watchStudyControl instead.
export const webFocusReader = {
  publishStudyFocusDay,
  watchStudyControl(db: Firestore, uid: string, next: (value: StudyControl | null, pending: boolean) => void, failed: (error: Error) => void) {
    return observeOnce(db, JSON.stringify(["focus-control-display", uid]), async () => {
      const snapshot = await getDoc(doc(db, ...studyControlPath(uid)));
      return snapshot.exists() ? snapshot.data() as StudyControl : null;
    }, value => next(value, false), failed);
  },
  watchStudyFocusDays(db: Firestore, uid: string, next: (value: Record<string, FocusDay>) => void, failed: (error: Error) => void) {
    return observeOnce(db, JSON.stringify(["focus-days", uid]), async () => {
      const snapshot = await getDocs(collection(db, "users", uid, "studyFocusDays"));
      return Object.fromEntries(snapshot.docs.map(entry => {
        const value = entry.data();
        return [entry.id, { totalMilliseconds: Math.max(0, Number(value["totalMilliseconds"]) || 0), sessionCredits: value["sessionCredits"] ?? emptyFocusDay().sessionCredits }];
      }));
    }, next, failed);
  },
  watchPublicStudyFocus(db: Firestore, uid: string, username: string, next: (value: { days: Record<string, number>; timeZone: string }) => void, failed: (error: Error) => void) {
    const name = username.trim().toLowerCase();
    return observeOnce(db, JSON.stringify(["public-focus", uid, name]), async () => {
      if (!/^[a-z0-9._]{3,24}$/.test(name)) return { days: {}, timeZone: studyTimeZone() };
      const value = (await getDoc(doc(db, "publicProfiles", name))).data();
      const own = value?.["uid"] === uid;
      let timeZone = own ? value["focusTimeZone"] || studyTimeZone() : studyTimeZone();
      try { new Intl.DateTimeFormat("en-US", { timeZone }); } catch { timeZone = studyTimeZone(); }
      const days = own ? Object.fromEntries(Object.entries(value["focusDays"] ?? {}).filter(([date, total]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof total === "number" && Number.isFinite(total) && total >= 0)) as Record<string, number> : {};
      return { days, timeZone };
    }, next, failed);
  },
};
export const { watchStudyFocusDays, watchPublicStudyFocus } = webFocusReader;
