import { attemptKey, type TestRecord } from "@/lib/exam";

export type TimeRange = "all" | "today" | "7d" | "30d";

export type RecordMetrics = {
  total: number;
  attempted: number;
  unattempted: number;
  correct: number;
  wrong: number;
  evaluated: number;
  accuracy: number | null;
  maxMarks: number;
  isEvaluated: boolean;
};

export type AggregateMetrics = RecordMetrics & {
  tests: number;
  unevaluatedTests: number;
  totalScore: number;
  scoredTests: number;
  studySeconds: number;
  averageScore: number | null;
  secondsPerAttempt: number | null;
  attemptRate: number;
};

export type PerformanceGroup = AggregateMetrics & {
  key: string;
  subject: string;
  chapter: string;
  exercise: string;
  records: TestRecord[];
  latest: TestRecord;
};

export function metricsForRecord(record: TestRecord): RecordMetrics {
  const total = record.answers.length;
  const attempted = record.answers.filter(Boolean).length;
  const correct = record.correct ?? 0;
  const wrong = record.wrong ?? 0;
  const evaluated = correct + wrong;
  const isEvaluated = record.correct !== null || record.wrong !== null;

  return {
    total,
    attempted,
    unattempted: total - attempted,
    correct,
    wrong,
    evaluated,
    accuracy: evaluated > 0 ? (correct / evaluated) * 100 : null,
    maxMarks: total * record.marking.positive,
    isEvaluated,
  };
}

export function aggregateRecords(records: TestRecord[]): AggregateMetrics {
  const result = records.reduce(
    (sum, record) => {
      const metrics = metricsForRecord(record);
      sum.total += metrics.total;
      sum.attempted += metrics.attempted;
      sum.unattempted += metrics.unattempted;
      sum.correct += metrics.correct;
      sum.wrong += metrics.wrong;
      sum.evaluated += metrics.evaluated;
      sum.maxMarks += metrics.maxMarks;
      sum.studySeconds += record.timeTakenSeconds;
      if (!metrics.isEvaluated) sum.unevaluatedTests += 1;
      if (record.score !== null) {
        sum.totalScore += record.score;
        sum.scoredTests += 1;
      }
      return sum;
    },
    {
      total: 0,
      attempted: 0,
      unattempted: 0,
      correct: 0,
      wrong: 0,
      evaluated: 0,
      maxMarks: 0,
      studySeconds: 0,
      unevaluatedTests: 0,
      totalScore: 0,
      scoredTests: 0,
    },
  );

  return {
    ...result,
    tests: records.length,
    accuracy: result.evaluated > 0 ? (result.correct / result.evaluated) * 100 : null,
    isEvaluated: result.evaluated > 0,
    averageScore: result.scoredTests > 0 ? result.totalScore / result.scoredTests : null,
    secondsPerAttempt: result.attempted > 0 ? result.studySeconds / result.attempted : null,
    attemptRate: result.total > 0 ? (result.attempted / result.total) * 100 : 0,
  };
}

export function filterByTime(records: TestRecord[], range: TimeRange, now = new Date()) {
  if (range === "all") return records;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "7d") start.setDate(start.getDate() - 6);
  if (range === "30d") start.setDate(start.getDate() - 29);
  return records.filter((record) => new Date(record.date).getTime() >= start.getTime());
}

export function groupPerformance(records: TestRecord[]): PerformanceGroup[] {
  const groups = new Map<string, TestRecord[]>();
  records.forEach((record) => {
    const exercise = record.exercise ?? "Exercise 1";
    const key = `${record.subject}||${record.chapter}||${exercise}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const sorted = [...group].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      const latest = sorted[0] as TestRecord;
      return {
        key,
        subject: latest.subject,
        chapter: latest.chapter,
        exercise: latest.exercise ?? "Exercise 1",
        records: sorted,
        latest,
        ...aggregateRecords(sorted),
      };
    })
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date));
}

export type Improvement = {
  key: string;
  subject: string;
  chapter: string;
  exercise: string;
  attempts: number;
  first: TestRecord;
  latest: TestRecord;
  scoreChange: number | null;
  accuracyChange: number | null;
};

export function getImprovements(records: TestRecord[]): Improvement[] {
  const groups = new Map<string, TestRecord[]>();
  records.forEach((record) => {
    const key = attemptKey(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });

  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const sorted = [...group].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const first = sorted[0] as TestRecord;
      const latest = sorted[sorted.length - 1] as TestRecord;
      const firstAccuracy = metricsForRecord(first).accuracy;
      const latestAccuracy = metricsForRecord(latest).accuracy;
      return {
        key,
        subject: latest.subject,
        chapter: latest.chapter,
        exercise: latest.exercise ?? "Exercise 1",
        attempts: sorted.length,
        first,
        latest,
        scoreChange:
          first.score !== null && latest.score !== null ? latest.score - first.score : null,
        accuracyChange:
          firstAccuracy !== null && latestAccuracy !== null ? latestAccuracy - firstAccuracy : null,
      };
    })
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date));
}

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getStreaks(records: Array<Pick<TestRecord, "date">>, now = new Date()) {
  const days = new Set(records.map((record) => localDayKey(new Date(record.date))));
  let current = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(localDayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const ordered = Array.from(days).sort();
  let longest = 0;
  let run = 0;
  let previous: Date | null = null;
  ordered.forEach((day) => {
    const date = new Date(`${day}T00:00:00`);
    run = previous && date.getTime() - previous.getTime() === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  });

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const activeLast30 = Array.from(days).filter(
    (day) => new Date(`${day}T00:00:00`).getTime() >= thirtyDaysAgo.getTime(),
  ).length;

  return { current, longest, activeLast30 };
}

export type DailyActivity = {
  day: string;
  label: string;
  tests: number;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number | null;
};

export function getDailyActivity(records: TestRecord[], days = 7, now = new Date()) {
  const activity: DailyActivity[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const day = localDayKey(date);
    const daily = records.filter((record) => localDayKey(new Date(record.date)) === day);
    const totals = aggregateRecords(daily);
    activity.push({
      day,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      tests: totals.tests,
      attempted: totals.attempted,
      correct: totals.correct,
      wrong: totals.wrong,
      accuracy: totals.accuracy,
    });
  }
  return activity;
}
