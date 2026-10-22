import { invoke, isTauri } from "@tauri-apps/api/core";
import { StudyLockControl } from "../../../shared/StudyLockControl";
import { getFirebaseFirestore } from "../lib/firebase";
import { pinDesktopStudy } from "../lib/desktop-habit-widgets";
const resize = (expanded: boolean) => isTauri() ? invoke<void>("resize_study_widget", { expanded }) : Promise.resolve();
export function BrowserStudyLock({ uid, desktop = false }: { uid: string; desktop?: boolean }) {
  return <StudyLockControl uid={uid} desktop={desktop} getDatabase={getFirebaseFirestore} onResize={resize} {...(!window.__SSC_HABIT_WIDGET__ ? { onPin: () => pinDesktopStudy(uid) } : {})} />;
}
