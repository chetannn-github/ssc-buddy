import { StudyLockControl } from "../../../shared/StudyLockControl";
import { useEffect, useState } from "react";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import "../../../shared/study-lock.css";
import "./study-lock.css";

export function ProfileStudyLock({ uid }: { uid: string }) {
  const [image, setImage] = useState("/avatars/1.jpg");
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/avatars/manifest.json", { signal: abort.signal }).then(response => response.json()).then((files: unknown) => {
      if (!Array.isArray(files)) return;
      const images = files.filter((file): file is string => typeof file === "string" && /\.(jpe?g|png|webp)$/i.test(file));
      const selected = images[Math.floor(Math.random() * images.length)];
      if (selected && !abort.signal.aborted) setImage(`/avatars/${encodeURIComponent(selected)}`);
    }).catch(() => {});
    return () => abort.abort();
  }, []);
  return <StudyLockControl uid={uid} profile getDatabase={getFirebaseFirestore} source="web" lockedImage={image} />;
}
