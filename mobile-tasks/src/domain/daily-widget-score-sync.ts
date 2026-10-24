type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};

/** Local coordination only. No telemetry or synchronization markers in Firestore. */
export function createDailyWidgetScoreSync<User extends { uid: string }>({
  storage, today, isCurrentUser, publish,
}: {
  storage: Storage;
  today: () => string;
  isCurrentUser: (user: User) => boolean;
  publish: (user: User) => Promise<void>;
}) {
  let queue: Promise<unknown> = Promise.resolve();
  const pendingAccounts = new Set<string>();
  return (user: User, reason: "mutation" | "refresh") => {
    const work = queue.catch(() => undefined).then(async () => {
      if (!isCurrentUser(user)) return;
      const key = `ssc-buddy:daily-widget-score:v1:${user.uid}`;
      let state: { day?: string; pending?: boolean } | null = null;
      try { state = JSON.parse((await storage.getItem(key)) ?? "null"); } catch { /* Retry cloud refresh if local state cannot be read. */ }
      const day = today();
      if (reason === "refresh" && !pendingAccounts.has(user.uid) && state?.day === day && state.pending === false) return;
      // Persist before publishing so an offline failure/process restart retries
      // even when this account already had a successful refresh earlier today.
      pendingAccounts.add(user.uid);
      try { await storage.setItem(key, JSON.stringify({ day: state?.day, pending: true })); } catch { /* Local storage failure must not block a committed task's cloud update. */ }
      if (!isCurrentUser(user)) return;
      await publish(user);
      if (!isCurrentUser(user)) return;
      await storage.setItem(key, JSON.stringify({ day, pending: false }));
      pendingAccounts.delete(user.uid);
    });
    queue = work;
    return work;
  };
}
