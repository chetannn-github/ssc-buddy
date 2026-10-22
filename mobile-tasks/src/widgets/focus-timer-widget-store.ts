import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseFirestore } from "../lib/firebase";
import { loadProfile } from "../lib/profile-store";
import { emptyFocusDay, focusDayKey } from "../../../shared/study-focus";
import { type StudySession } from "../../../shared/study-controller";
import { type FocusWidgetSnapshot, focusTimerWidgetModel } from "../domain/focus-timer-widget";

const key = (uid: string) => `ssc-buddy:focus-widget:v1:${uid}`;
export const saveFocusWidgetSnapshot = (snapshot: FocusWidgetSnapshot) => AsyncStorage.setItem(key(snapshot.uid), JSON.stringify(snapshot));

export async function focusTimerWidgetView(uid?: string) {
  let cached: FocusWidgetSnapshot | null = null;
  if (!uid) return focusTimerWidgetModel(null, uid);
  try {
    cached = JSON.parse(await AsyncStorage.getItem(key(uid)) ?? "null");
    if (cached?.uid !== uid || !cached?.day || !cached.day.sessionCredits || typeof cached.date !== "string") cached = null;
  } catch { cached = null; }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const fresh = await Promise.race([
      (async (): Promise<FocusWidgetSnapshot> => {
        const db = getFirebaseFirestore();
        const control = await getDoc(doc(db, "users", uid, "studyLock", "current"));
        const session = (control.data()?.["session"] ?? null) as StudySession | null;
        const date = focusDayKey(Date.now(), session?.timeZone);
        const [dayDoc, profile] = await Promise.all([getDoc(doc(db, "users", uid, "studyFocusDays", date)), loadProfile()]);
        const value = dayDoc.data();
        const day = value ? { totalMilliseconds: Math.max(0, Number(value["totalMilliseconds"]) || 0), sessionCredits: value["sessionCredits"] ?? {} } : emptyFocusDay();
        const snapshot = { uid, date, day, session, accent: profile.accentColor ?? "#ffe000" };
        await saveFocusWidgetSnapshot(snapshot);
        return snapshot;
      })(),
      new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 3500); }),
    ]);
    if (fresh) cached = fresh;
  } catch { /* Use the account-scoped snapshot when offline. */ }
  finally { if (timeout) clearTimeout(timeout); }
  return focusTimerWidgetModel(cached, uid);
}
