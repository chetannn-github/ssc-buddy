import { applyHabitPreview } from "../../../mobile-tasks/src/domain/optimistic-habits";
import { createSharedLiveSource } from "../../../mobile-tasks/src/domain/shared-live-source";
import { useEffect, useRef, useState } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  runTransaction,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./firebase";
import {
  habitDay,
  normalizeHabit,
  applyHabitAction,
  habitDayNeedsUpdate,
  type Habit,
  type HabitColor,
  type HabitSettings,
  type HabitDayAction,
} from "../../../mobile-tasks/src/domain/habits";

export function useHabitToday() {
  const [today, setToday] = useState(habitDay);
  useEffect(() => {
    const update = () => setToday(habitDay());
    const timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return today;
}
const subscribeHabits = createSharedLiveSource<Habit[]>();

export function useHabits(uid?: string, habitId?: string) {
  const [state, setState] = useState<{
    uid: string | undefined;
    habits: Habit[];
    loading: boolean;
    error: string;
  }>({ uid: undefined, habits: [], loading: true, error: "" });
  const current = useRef(state);
  current.current = state;
  const mutations = useRef(
    new Map<
      string,
      { base: Habit; actions: { day: string; action: HabitDayAction }[]; queue: Promise<void> }
    >(),
  );
  const owner = useRef(uid);
  owner.current = uid;
  const preview = (id: string) => {
    const pending = mutations.current.get(id);
    if (!pending) return;
    let next = pending.base;
    for (const item of pending.actions) {
      try {
        next = applyHabitPreview(next, item.day, item.action);
      } catch {}
    }
    current.current = {
      ...current.current,
      habits: current.current.habits.map((h) => (h.id === id ? next : h)),
    };
    setState(current.current);
  };
  const [revision, retry] = useState(0);
  useEffect(() => {
    mutations.current.clear();
    setState({ uid, habits: [], loading: !!uid, error: "" });
    if (!uid) return;
    let active = true;
    const database = getFirebaseFirestore();
    const stop = subscribeHabits(database, JSON.stringify([uid, habitId ?? null]), (next, failed) => {
      const deliver = (items: { id: string; data: () => Record<string, unknown> }[]) => next(items
        .map(item => normalizeHabit(item.id, item.data()))
        .filter((item): item is Habit => !!item)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
      return habitId
        ? onSnapshot(doc(database, "users", uid, "habits", habitId), snapshot => deliver(snapshot.exists() ? [snapshot] : []), failed)
        : onSnapshot(collection(database, "users", uid, "habits"), snapshot => deliver(snapshot.docs), failed);
    },
      (habits) => {
        if (active) {
          const visible = habits.map((h) =>
            mutations.current.has(h.id)
              ? (current.current.habits.find((old) => old.id === h.id) ?? h)
              : h,
          );
          current.current = { uid, habits: visible, loading: false, error: "" };
          setState(current.current);
        }
      },
      () => {
        if (active)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: "Could not load habits. Try again.",
          }));
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [uid, habitId, revision]);
  const ref = (id: string) => {
    if (!uid) throw new Error("Sign in to save habits.");
    return doc(getFirebaseFirestore(), "users", uid, "habits", id);
  };
  return {
    habits: state.uid === uid ? state.habits : [],
    loading: !!uid && (state.uid !== uid || state.loading),
    error: state.uid === uid ? state.error : "",
    retry: () => retry((value) => value + 1),
    save: async (
      details: {
        name: string;
        color: HabitColor;
        targetDays: number | null;
        settings?: HabitSettings;
      },
      habit?: Habit,
    ) => {
      if (habit) await updateDoc(ref(habit.id), details);
      else {
        if (!uid) throw new Error("Sign in to save habits.");
        const item = doc(collection(getFirebaseFirestore(), "users", uid, "habits"));
        await setDoc(item, { ...details, createdAt: new Date().toISOString(), completedDates: [] });
      }
    },
    updateDay: async (id: string, day: string, action: HabitDayAction) => {
      const reference = ref(id);
      const habit = current.current.habits.find((h) => h.id === id);
      if (!habit || current.current.uid !== uid) throw new Error("Habit no longer exists.");
      // Validate synchronously, then render immediately without waiting for Firestore.
      applyHabitPreview(habit, day, action);
      let pending = mutations.current.get(id);
      if (!pending) {
        pending = { base: habit, actions: [], queue: Promise.resolve() };
        mutations.current.set(id, pending);
      }
      const item = { day, action };
      pending.actions.push(item);
      preview(id);
      const group = pending;
      const work = group.queue
        .catch(() => undefined)
        .then(async () => {
          if (owner.current !== uid || mutations.current.get(id) !== group) return;
          try {
            const committed = await runTransaction(getFirebaseFirestore(), async (transaction) => {
              const snapshot = await transaction.get(reference);
              const latest = snapshot.exists()
                ? normalizeHabit(snapshot.id, snapshot.data())
                : null;
              if (!latest) throw new Error("Habit no longer exists.");
              const next = applyHabitPreview(latest, day, action);
              const result = applyHabitAction(latest, day, action);
              if (habitDayNeedsUpdate(latest, day, result)) transaction.update(reference, {
                ["entries." + day]: result.entry,
                completedDates: result.completed ? arrayUnion(day) : arrayRemove(day),
              });
              return next;
            });
            if (owner.current === uid && mutations.current.get(id) === group)
              group.base = committed;
          } finally {
            if (owner.current === uid && mutations.current.get(id) === group) {
              group.actions = group.actions.filter((op) => op !== item);
              preview(id);
              if (!group.actions.length) mutations.current.delete(id);
            }
          }
        });
      group.queue = work.catch(() => undefined);
      await work;
    },
    markToday: async (id: string, marked: boolean) => {
      const today = habitDay();
      await updateDoc(ref(id), { completedDates: marked ? arrayUnion(today) : arrayRemove(today) });
    },
    remove: async (id: string) => {
      await deleteDoc(ref(id));
    },
  };
}
