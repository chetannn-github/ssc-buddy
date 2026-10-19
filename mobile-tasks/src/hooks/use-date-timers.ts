import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getFirebaseFirestore } from "../lib/firebase";
import { cacheWidgetTimers } from "../widgets/timer-widget-store";
import { normalizeDateTimer, type DateTimer } from "../domain/date-timers";

export function useDateTimers(uid?: string) {
  const [state, setState] = useState<{ uid: string; timers: DateTimer[]; loading: boolean; error: string }>({ uid: "", timers: [], loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!uid) { void cacheWidgetTimers(undefined, []).catch(() => undefined); return; }
    if (state.uid === uid && !state.loading && !state.error) void cacheWidgetTimers(uid, state.timers).catch(() => undefined);
  }, [uid, state]);
  useEffect(() => {
    setState({ uid: uid ?? "", timers: [], loading: Boolean(uid), error: "" });
    if (!uid) return;
    let active = true;
    const stop = onSnapshot(collection(getFirebaseFirestore(), "users", uid, "dateTimers"), (snapshot) => {
      const timers = snapshot.docs.map((item) => normalizeDateTimer(item.id, item.data())).filter((timer): timer is DateTimer => timer !== null).sort((a, b) => a.targetAt.localeCompare(b.targetAt));
      if (active) setState({ uid, timers, loading: false, error: "" });
    }, () => { if (active) setState((previous) => ({ ...previous, loading: false, error: "Could not load timers. Try again." })); });
    return () => { active = false; stop(); };
  }, [uid, retry]);
  return {
    timers: state.uid === uid ? state.timers : [], loading: Boolean(uid) && (state.uid !== uid || state.loading), error: state.uid === uid ? state.error : "",
    retry: () => setRetry((value) => value + 1),
    save: async (timer: DateTimer) => { if (!uid) throw new Error("Sign in to save timers."); await setDoc(doc(getFirebaseFirestore(), "users", uid, "dateTimers", timer.id), timer); },
    remove: async (id: string) => { if (!uid) throw new Error("Sign in to delete timers."); await deleteDoc(doc(getFirebaseFirestore(), "users", uid, "dateTimers", id)); },
  };
}
