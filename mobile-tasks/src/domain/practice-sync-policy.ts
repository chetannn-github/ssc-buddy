/** Coalesce concurrent requests only; keep no settled data cache. A later open
 * still fetches fresh data, and failures never poison the next attempt. */
export function createInFlightLoader<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const work = Promise.resolve().then(load).finally(() => {
      if (pending.get(key) === work) pending.delete(key);
    });
    pending.set(key, work);
    return work;
  };
}

/** Preserve local write order. Only adjacent identical pending publications
 * can share work: A -> B -> A must end at A, not accidentally collapse to B. */
export function createOrderedPublisher() {
  const pending = new Map<string, { signature: string; work: Promise<void> }>();
  return (key: string, signature: string, publish: () => Promise<void>): Promise<void> => {
    const previous = pending.get(key);
    if (previous?.signature === signature) return previous.work;
    const work = (previous?.work ?? Promise.resolve()).catch(() => undefined).then(publish).finally(() => {
      if (pending.get(key)?.work === work) pending.delete(key);
    });
    pending.set(key, { signature, work });
    return work;
  };
}

function plainMap(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype?.constructor?.name === "Object";
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (!Array.isArray(left) && (!plainMap(left) || !plainMap(right))) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]));
}

/** Called inside the transaction after counters have been merged with the
 * latest server state. Ignore timestamps, never skip based on a UI cache. */
export function learningPatchUnchanged(remote: Record<string, unknown>, incoming: Record<string, unknown>, mergedStats: Record<string, unknown>) {
  return Object.entries({ ...incoming, stats: mergedStats }).every(([key, value]) => key === "updatedAt" || sameValue(remote[key], value));
}

/** Match set(..., {merge:true}): nonempty maps patch their leaves, arrays are
 * replaced, and an explicitly empty map replaces the existing map. Extra
 * server fields (for example focusDays) are not part of this publication. */
export function mergePatchUnchanged(remote: unknown, patch: unknown): boolean {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return sameValue(remote, patch);
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) return false;
  if (!plainMap(patch) || !plainMap(remote)) return false;
  const keys = Object.keys(patch);
  if (!keys.length) return Object.keys(remote).length === 0;
  const before = remote as Record<string, unknown>, next = patch as Record<string, unknown>;
  return keys.every(key => Object.prototype.hasOwnProperty.call(before, key) && mergePatchUnchanged(before[key], next[key]));
}
