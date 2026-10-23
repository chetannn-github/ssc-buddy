import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { createStudyController } from "./study-controller.ts";
export * from "./study-controller.ts";
export const { saveFocusSchedule, activateDueFocusSchedule, repairStudyFocusDays, settleStudyFocus, reconcileStudySession, watchStudyControl, watchStudyDevices, watchStudyFocusDay, watchStudyFocusDays, watchPublicStudyFocus, publishStudyFocusDay, recordStudyFocus, startStudySession, saveStudyWebsites, pauseStudySession, resumeStudySession } = createStudyController({ collection, doc, onSnapshot, runTransaction, serverTimestamp });
