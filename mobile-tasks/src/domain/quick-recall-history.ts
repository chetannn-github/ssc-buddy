type RecallHistoryRecord = { id: string; testMode?: string; subject: string; date: string };

export function isQuickRecallRecord(record: RecallHistoryRecord) {
  return (
    record.testMode === "quick-recall" ||
    record.subject === "Quick Recall" ||
    record.id?.startsWith("quick-recall:") === true
  );
}

export function quickRecallHistoryKey(record: RecallHistoryRecord) {
  if (!isQuickRecallRecord(record)) return null;
  // Canonical Quick Recall documents already accumulate all answers for a day.
  // Keep days separate even when their question counts and scores match.
  const day = /^quick-recall:(\d{4}-\d{2}-\d{2})$/.exec(record.id)?.[1] ?? record.date.slice(0, 10);
  return `quick-recall:${day}`;
}
