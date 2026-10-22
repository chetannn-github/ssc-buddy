import { StudyLockControl } from "../../../shared/StudyLockControl";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import "../../../shared/study-lock.css";
import "./study-lock.css";

export function ProfileStudyLock({ uid }: { uid: string }) {
  return <StudyLockControl uid={uid} profile getDatabase={getFirebaseFirestore} source="web" />;
}
