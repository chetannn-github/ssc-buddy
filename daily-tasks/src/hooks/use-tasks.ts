import { useCallback, useEffect, useState } from "react";
import type { Task, TaskType } from "@/lib/tasks";
import { todayKey } from "@/lib/tasks";
import type { Subject } from "@/lib/syllabus";

const STORAGE_KEY = "ssc-buddy:tasks:v1";

function dayKeyOffset(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return todayKey(d);
}

/** Sample data shown the first time the app is opened (until cleared by the user). */
function demoTasks(): Task[] {
  const rows: [number, string, Subject, TaskType, number | null][] = [
    // [daysAgo, name, subject, type, minutes (null = pending)]
    [0, "Lecture 5 of Polity", "Polity", "Lecture", 80],
    [0, "Number System Practice", "Maths", "Practice Session", 120],
    [0, "Current Affairs Revision", "Current Affairs", "Revision", 30],
    [0, "Geography Lecture 6", "Geography", "Lecture", null],
    [1, "Mock Test 4 (Full Length)", "Other", "Mock", 180],
    [1, "Reading Comprehension Drill", "English", "Practice Session", 60],
    [1, "Polity Revision — Fundamental Rights", "Polity", "Revision", 45],
    [2, "Lecture 4 of Polity", "Polity", "Lecture", 75],
    [2, "Time, Speed & Distance Practice", "Maths", "Practice Session", 90],
    [2, "Syllogism Practice Set", "Reasoning", "Practice Session", 50],
    [3, "Economy Lecture 3 — Inflation", "Economy", "Lecture", 70],
    [3, "Vocabulary + Idioms Revision", "English", "Revision", 35],
    [4, "Ancient History Lecture 2", "History", "Lecture", 85],
    [4, "Seating Arrangement Practice", "Reasoning", "Practice Session", 65],
    [5, "Physics Revision — Motion", "Science", "Revision", 40],
    [5, "Percentage Practice", "Maths", "Practice Session", 55],
    [7, "Mock Test 3 (Sectional)", "Other", "Mock", 60],
    [7, "Geography Revision — Rivers", "Geography", "Revision", 30],
    [8, "GS Static Revision — Schemes", "GS", "Revision", 45],
  ];
  const now = new Date();
  return rows.map(([daysAgo, name, subject, type, minutes], i) => {
    const date = dayKeyOffset(daysAgo);
    const createdAt = new Date(`${date}T09:00:00`).toISOString();
    const completedAt =
      minutes === null ? null : new Date(`${date}T18:30:00`).toISOString();
    return {
      id: `demo-${i}`,
      name,
      subject,
      type,
      createdAt,
      date,
      completed: minutes !== null,
      completedAt,
      minutesSpent: minutes,
    };
  });
}

function read(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Task[]) : [];
  } catch {
    return [];
  }
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === null) {
      const demo = demoTasks();
      setTasks(demo);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      } catch {
        /* storage unavailable */
      }
    } else {
      setTasks(read());
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Task[]) => {
    setTasks(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const addTask = useCallback(
    (input: Pick<Task, "name" | "subject" | "type">) => {
      const now = new Date();
      const task: Task = {
        id: crypto.randomUUID(),
        ...input,
        createdAt: now.toISOString(),
        date: todayKey(now),
        completed: false,
        completedAt: null,
        minutesSpent: null,
      };
      persist([task, ...read()]);
    },
    [persist],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      persist(read().map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [persist],
  );

  const completeTask = useCallback(
    (id: string, minutes: number) => {
      persist(
        read().map((t) =>
          t.id === id
            ? {
                ...t,
                completed: true,
                completedAt: new Date().toISOString(),
                minutesSpent: minutes,
              }
            : t,
        ),
      );
    },
    [persist],
  );

  const reopenTask = useCallback(
    (id: string) => {
      persist(
        read().map((t) =>
          t.id === id ? { ...t, completed: false, completedAt: null, minutesSpent: null } : t,
        ),
      );
    },
    [persist],
  );

  const deleteTask = useCallback(
    (id: string) => persist(read().filter((t) => t.id !== id)),
    [persist],
  );

  return { tasks, hydrated, addTask, updateTask, completeTask, reopenTask, deleteTask };
}
