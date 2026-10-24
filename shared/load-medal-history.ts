/** Bound first-load work. Cancellation stops scheduling further weeks; failed
 * reads stay retryable on the next refresh instead of becoming cached awards. */
export async function loadMedalHistory<T>(weeks: string[], read: (week: string) => Promise<T>, emit: (week: string, entries: T) => void, active: () => boolean) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, weeks.length) }, async () => {
    while (active() && cursor < weeks.length) {
      const week = weeks[cursor++]!;
      try { const entries = await read(week); if (active()) emit(week, entries); }
      catch { /* A future refresh/reopen retries; no persistent failure cache. */ }
    }
  }));
}
