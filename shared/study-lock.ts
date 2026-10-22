import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { createStudyController } from "./study-controller.ts";
export * from "./study-controller.ts";
export const { watchStudyControl, watchStudyDevices, watchStudyFocusDay, recordStudyFocus, startStudySession, saveStudyWebsites } = createStudyController({ collection, doc, onSnapshot, runTransaction, serverTimestamp });
