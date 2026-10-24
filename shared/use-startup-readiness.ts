import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Firestore } from "firebase/firestore";
import { EMPTY_PROFILE_FOCUS, profileFocusSnapshot, watchProfileFocus, type ProfileFocusReader } from "./profile-focus-source";

/** Warm the same active source used by Profile, including while splash is visible.
 * This replaces the root keepalive component; it does not create another query. */
export function useStartupProfileFocus(uid: string | undefined, getDatabase: () => Firestore, reader: ProfileFocusReader) {
  const source = useMemo(() => {
    let db: Firestore | null = null;
    if (uid) { try { db = getDatabase(); } catch { /* Bounded startup fallback below. */ } }
    return {
      get: () => db && uid ? profileFocusSnapshot(db, reader, uid) : EMPTY_PROFILE_FOCUS,
      subscribe: (notify: () => void) => db && uid ? watchProfileFocus(db, reader, uid, undefined, false, notify) : () => {},
    };
  }, [uid, getDatabase, reader]);
  const snapshot = useSyncExternalStore(source.subscribe, source.get, () => EMPTY_PROFILE_FOCUS);
  return snapshot.days !== null && snapshot.controlReady;
}

export const STARTUP_WAIT_MS = 12_000;
type StartupData = { profile: boolean; tasks: boolean; focus: boolean; activity: boolean };

/** Gate only initial account hydration. Later updates never reopen the splash. */
export function useStartupReadiness(uid: string | undefined, data: StartupData, waitMs = STARTUP_WAIT_MS) {
  const complete = data.profile && data.tasks && data.focus && data.activity;
  const owner = useRef({ uid, scope: 0 });
  if (owner.current.uid !== uid) owner.current = { uid, scope: owner.current.scope + 1 };
  const scope = owner.current.scope;
  const [settled, setSettled] = useState<{ scope?: number; timedOut: boolean }>({ timedOut: false });
  const [slowScope, setSlowScope] = useState<number>();
  useEffect(() => {
    if (!uid) { setSettled({ timedOut: false }); setSlowScope(undefined); return; }
    const slow = setTimeout(() => setSlowScope(scope), Math.min(4_000, waitMs / 2));
    const timeout = setTimeout(() => setSettled(previous => previous.scope === scope ? previous : { scope, timedOut: true }), waitMs);
    return () => { clearTimeout(slow); clearTimeout(timeout); };
  }, [uid, scope, waitMs]);
  useEffect(() => {
    if (uid && complete) setSettled(previous => previous.scope === scope ? previous : { scope, timedOut: false });
  }, [uid, scope, complete]);
  const stage = !data.profile ? "Getting your profile ready…"
    : !data.tasks ? "Gathering your tasks…"
    : !data.focus ? "Restoring your focus time…"
    : !data.activity ? "Putting your stats together…" : "Your workspace is ready";
  return {
    ready: !uid || complete || settled.scope === scope,
    timedOut: !!uid && settled.scope === scope && settled.timedOut,
    message: !!uid && slowScope === scope && !complete ? "A little longer—syncing your latest progress…" : stage,
  };
}
