/** Share an active source within one JS runtime. Last unsubscribe discards its
 * value, so reopening after an account change cannot resurrect an old cache. */
export function createSharedLiveSource<T>() {
  type Observer = { value: (value: T) => void; error: () => void };
  type Entry = { observers: Set<Observer>; stop?: () => void; failed: boolean; hasValue: boolean; latest?: T; generation: number };
  const scopes = new WeakMap<object, Map<string, Entry>>();
  return (scope: object, key: string, start: (value: (value: T) => void, error: () => void) => () => void,
    onValue: (value: T) => void, onError: () => void) => {
    let sources = scopes.get(scope);
    if (!sources) { sources = new Map(); scopes.set(scope, sources); }
    let entry = sources.get(key);
    if (!entry) {
      entry = { observers: new Set(), failed: false, hasValue: false, generation: 0 };
      sources.set(key, entry);
    }
    const current = entry;
    const observer = { value: onValue, error: onError };
    current.observers.add(observer);
    if (current.hasValue && !current.failed) onValue(current.latest!);
    if (!current.stop || current.failed) {
      current.stop?.();
      current.failed = false;
      current.hasValue = false;
      const generation = ++current.generation;
      const valid = () => sources!.get(key) === current && current.generation === generation && !current.failed;
      const fail = () => {
        if (!valid()) return;
        current.failed = true;
        for (const item of [...current.observers]) item.error();
      };
      try {
        const stop = start(value => {
          if (!valid()) return;
          current.latest = value;
          current.hasValue = true;
          for (const item of [...current.observers]) item.value(value);
        }, fail);
        current.stop = stop;
      } catch { fail(); }
    }
    return () => {
      current.observers.delete(observer);
      if (!current.observers.size && sources!.get(key) === current) {
        sources!.delete(key);
        current.stop?.();
      }
    };
  };
}
