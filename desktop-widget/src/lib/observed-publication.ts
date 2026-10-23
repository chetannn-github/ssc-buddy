/** Reuse only active, server-initialized listeners; never retain data after teardown. */
export function createObservedPublicationValue<T>() {
  const entries = new Map<string, { value?: T; observers: Map<symbol, boolean> }>();
  return {
    read(uid: string): T | undefined {
      const entry = entries.get(uid);
      return entry && [...entry.observers.values()].some(Boolean) ? entry.value : undefined;
    },
    observe(uid: string) {
      const entry = entries.get(uid) ?? { observers: new Map<symbol, boolean>() };
      entries.set(uid, entry);
      const token = Symbol();
      entry.observers.set(token, false);
      return {
        update(value: T, fromCache: boolean) {
          if (!entry.observers.has(token)) return;
          entry.observers.set(token, !fromCache);
          if (!fromCache) entry.value = value;
        },
        release() {
          entry.observers.delete(token);
          if (!entry.observers.size && entries.get(uid) === entry) entries.delete(uid);
        },
      };
    },
  };
}

export type TaskPublicationChange<T> = { type: "save"; task: T } | { type: "remove"; id: string };

export function createTaskPublicationReader<T extends { id: string }, P>(load: {
  tasks: (uid: string) => Promise<T[]>;
  profile: (uid: string) => Promise<P>;
}) {
  const tasks = createObservedPublicationValue<T[]>();
  const profiles = createObservedPublicationValue<P>();
  return {
    tasks,
    profiles,
    async read(uid: string, change: TaskPublicationChange<T>) {
      const observed = tasks.read(uid);
      const current = change.type === "save" ? observed?.find(task => task.id === change.task.id) : undefined;
      // A saved write normally reaches its listener before acknowledgement. If
      // that listener is missing/lagging, retain the previous full-read fallback.
      const matches = observed !== undefined && (change.type === "remove"
        ? !observed.some(task => task.id === change.id)
        : current !== undefined && Object.entries(change.task).every(([key, value]) => JSON.stringify(current[key as keyof T]) === JSON.stringify(value)));
      const [list, profile] = await Promise.all([
        matches ? observed : load.tasks(uid),
        profiles.read(uid) ?? load.profile(uid),
      ]);
      // getDocs originally used document-id order. Keep point allocation among
      // task rows identical even though the displayed list sorts by createdAt.
      return { tasks: [...list].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), profile };
    },
  };
}
