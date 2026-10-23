import { useFocusScheduleRunner } from "../../shared/use-focus-schedule-runner";
import * as reader from "../../shared/study-lock";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
export function FocusScheduleRunner({uid}:{uid:string|undefined}) {
  useFocusScheduleRunner(uid,getFirebaseFirestore,reader);
  return null;
}
