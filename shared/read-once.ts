/** Share overlapping reads, then discard them so reopening/refreshing loads fresh data. */
const pendingReads = new WeakMap<object, Map<string, Promise<unknown>>>();
export function observeOnce<T>(scope: object, key: string, read: () => Promise<T>, next: (value: T) => void, failed: (error: Error) => void): () => void {
  let reads = pendingReads.get(scope);
  if (!reads) { reads = new Map(); pendingReads.set(scope, reads); }
  let pending = reads.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = Promise.resolve().then(read);
    reads.set(key, pending);
    const request = pending;
    void pending.finally(() => { if (reads.get(key) === request) reads.delete(key); }).catch(() => {});
  }
  let active = true;
  void pending.then(value => { if (active) next(value); }, error => { if (active) failed(error instanceof Error ? error : Error(String(error))); });
  return () => { active = false; };
}
