import { studyTimeZone } from "./study-focus.ts";

type PublishDay<Database> = (db: Database, uid: string, date: string, timeZone?: string) => Promise<void | boolean>;
type Publication = { total: number; pending?: Promise<void> };
// Memory only: opening a new app session still verifies/backfills saved history.
// Separate database instances and accounts never share publication state.
const publications = new WeakMap<object, Map<string, Publication>>();

export async function publishChangedFocusDay<Database extends object>(db: Database, uid: string, date: string, total: number, publish: PublishDay<Database>, timeZone = studyTimeZone()): Promise<void> {
  if (!uid || !Number.isFinite(total) || total <= 0) return;
  let cache = publications.get(db);
  if (!cache) { cache = new Map(); publications.set(db, cache); }
  const key = JSON.stringify([uid, date, timeZone]);
  const previous = cache.get(key);
  if (previous?.pending) {
    // A newer total arriving during publication must run after the older one.
    await previous.pending;
    return publishChangedFocusDay(db, uid, date, total, publish, timeZone);
  }
  if (previous?.total === total) return;
  const entry: Publication = { total };
  cache.set(key, entry);
  let confirmed = false;
  entry.pending = Promise.resolve().then(async () => { confirmed = await publish(db, uid, date, timeZone) !== false; });
  try {
    await entry.pending;
    // Missing username/public profile is a skipped publication, not a success.
    if (!confirmed) { if (cache.get(key) === entry) cache.delete(key); return; }
    delete entry.pending;
    // Bound history retained by long-running desktop windows.
    if (cache.size > 1024) for (const [oldKey, old] of cache) {
      if (cache.size <= 1024) break;
      if (!old.pending && oldKey !== key) cache.delete(oldKey);
    }
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    throw error; // Failed attempts are eligible for retry, never marked saved.
  }
}
