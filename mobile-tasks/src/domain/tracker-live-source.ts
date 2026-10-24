import { createSharedLiveSource } from "./shared-live-source";

type TrackerSnapshot = {
  docs: Array<{ id: string; data: () => Record<string, any> }>;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};
const share = createSharedLiveSource<TrackerSnapshot>();
const confirmed = new WeakMap<object, Map<string, TrackerSnapshot | undefined>>();

export function hasActiveTrackerSource(scope: object, uid: string) {
  return confirmed.get(scope)?.has(uid) ?? false;
}

/** Only an active, server-confirmed nonempty collection can replace an existence
 * query. Pending/cache/empty snapshots must take the ordinary migration path. */
export function hasConfirmedTracker(scope: object, uid: string) {
  const snapshot = confirmed.get(scope)?.get(uid);
  return !!snapshot && !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && snapshot.docs.length > 0;
}

export function watchTrackerSource(scope: object, uid: string,
  start: (value: (snapshot: TrackerSnapshot) => void, error: () => void) => () => void,
  callback: (snapshot: TrackerSnapshot) => void) {
  return share(scope, uid, (value, error) => {
    let active = true;
    let values = confirmed.get(scope);
    if (!values) { values = new Map(); confirmed.set(scope, values); }
    values.set(uid, undefined);
    const clear = () => values!.delete(uid);
    try {
      const stop = start(snapshot => {
        if (!active) return;
        values!.set(uid, snapshot); value(snapshot);
      }, () => { if (active) { active = false; clear(); error(); } });
      return () => { active = false; clear(); stop(); };
    } catch (cause) { active = false; clear(); throw cause; }
  }, callback, () => {});
}
