import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(
  new URL("../mobile-tasks/src/domain/habits.ts", import.meta.url),
  "utf8",
);
const catalogSource = await readFile(
  new URL("../mobile-tasks/src/domain/habit-icons.ts", import.meta.url),
  "utf8",
);
const paletteSource = await readFile(new URL("../mobile-tasks/src/domain/habit-colors.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(
  paletteSource + catalogSource + source.replace(/(?:import|export) \{ HABIT_COLORS \} from "\.\/habit-colors";/g, "").replace(/import \{ HABIT_ICON_CATALOG \} from "\.\/habit-icons";/, ""),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  },
).outputText;
const {
  habitDay,
  habitDetails,
  habitStats,
  normalizeHabit,
  habitCalendar,
  isHabitDay,
  normalizeHabitSettings,
  validateHabitSettings,
  applyHabitAction,
  habitIntensity,
  habitDue,
  habitScheduled,
  habitIsComplete,
  canEditHabitDay,
  periodCount,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const habit = (completedDates, targetDays = 70) => ({
  id: "habit",
  name: "Read",
  color: "purple",
  createdAt: "2025-01-01T12:00:00",
  targetDays,
  completedDates,
});
test("consecutive streak spans month and year boundaries", () => {
  assert.deepEqual(habitStats(habit(["2025-12-30", "2025-12-31", "2026-01-01"]), "2026-01-01"), {
    streak: 3,
    total: 3,
    markedToday: true,
    progress: 3 / 70,
  });
});
test("an unmarked today keeps yesterday's streak; a missed full day breaks it", () => {
  const value = habit(["2026-02-27", "2026-02-28"]);
  assert.equal(habitStats(value, "2026-03-01").streak, 2);
  assert.equal(habitStats(value, "2026-03-02").streak, 0);
});
test("challenge progress counts distinct completed days, not elapsed days or future marks", () => {
  const value = habit(["2026-01-01", "2026-01-01", "2026-01-03", "2027-01-01"], 2);
  assert.deepEqual(habitStats(value, "2026-01-03"), {
    streak: 1,
    total: 2,
    markedToday: true,
    progress: 1,
  });
  assert.equal(habitStats(habit(["2026-01-01"], null), "2026-01-01").progress, 0);
});
test("unmarking today reverses progress and restores yesterday's consecutive streak", () => {
  const days = ["2026-04-03", "2026-04-04", "2026-04-05"];
  assert.equal(habitStats(habit(days), "2026-04-05").streak, 3);
  assert.deepEqual(habitStats(habit(days.slice(0, -1)), "2026-04-05"), {
    streak: 2,
    total: 2,
    markedToday: false,
    progress: 2 / 70,
  });
});
test("targets accept optional and integer day goals and reject malformed values", () => {
  assert.deepEqual(habitDetails(" Read ", "pink", "70"), {
    name: "Read",
    color: "pink",
    targetDays: 70,
  });
  assert.equal(habitDetails("Read", "red", "").targetDays, null);
  for (const target of ["0", "-2", "1.5", "NaN", "Infinity", "10001"])
    assert.throws(() => habitDetails("Read", "red", target));
  assert.throws(() => habitDetails(" ", "red", "70"));
});
test("normalization drops invalid dates, deduplicates marks and handles unknown colors", () => {
  const value = normalizeHabit("id", {
    ...habit(["2026-02-29", "2024-02-29", "2024-02-29", null]),
    color: "not-a-color",
  });
  assert.equal(value.color, "purple");
  assert.deepEqual(value.completedDates, ["2024-02-29"]);
  assert.equal(isHabitDay("2026-02-30"), false);
  assert.equal(isHabitDay("2024-02-29"), true);
  assert.equal(normalizeHabit("id", {}), null);
});
test("calendar uses complete Sunday-first columns and does not reset rows at month changes", () => {
  const cells = habitCalendar("2026-10-20");
  assert.equal(cells.length % 7, 0);
  assert.equal(cells[0].row, 0);
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    assert.equal(cell.row, index % 7);
    assert.equal(cell.column, Math.floor(index / 7));
    assert.equal(new Date(cell.key + "T12:00:00").getDay(), cell.row);
    if (index) {
      const next = new Date(cells[index - 1].key + "T12:00:00");
      next.setDate(next.getDate() + 1);
      assert.equal(cell.key, habitDay(next));
    }
  }
  assert.equal(cells.find((cell) => cell.key === "2026-10-01").row, 4);
});

const configured = (settings, completedDates = [], entries = {}) => ({
  ...habit(completedDates),
  settings: { ...normalizeHabitSettings(), ...settings },
  entries,
});
const apply = (value, day, action) => {
  const { entry, completed } = applyHabitAction(value, day, action, day);
  return {
    ...value,
    entries: { ...value.entries, [day]: entry },
    completedDates: completed
      ? [...new Set([...value.completedDates, day])]
      : value.completedDates.filter((key) => key !== day),
  };
};
test("count increments, partial heatmaps, threshold completion and correction are consistent", () => {
  let value = configured({ tracking: "count", dailyGoal: 3, step: 1 });
  value = apply(value, "2026-01-01", { type: "increment", amount: 1 });
  assert.equal(habitIntensity(value, "2026-01-01"), 1 / 3);
  assert.equal(value.completedDates.length, 0);
  value = apply(value, "2026-01-01", { type: "increment", amount: 2 });
  assert.deepEqual(value.completedDates, ["2026-01-01"]);
  value = apply(value, "2026-01-01", { type: "count", value: 1 });
  assert.equal(value.completedDates.length, 0);
  assert.throws(() => apply(value, "2026-01-01", { type: "count", value: NaN }));
  assert.throws(() => apply(value, "2026-01-01", { type: "count", value: -1 }));
});
test("checklists require every valid item and unchecking reverses completion", () => {
  let value = configured({
    tracking: "checklist",
    checklist: [
      { id: "a", title: "Read" },
      { id: "b", title: "Review" },
    ],
  });
  value = apply(value, "2026-01-01", { type: "check", id: "a" });
  assert.equal(habitIntensity(value, "2026-01-01"), 0.5);
  value = apply(value, "2026-01-01", { type: "check", id: "b" });
  assert.equal(value.completedDates.length, 1);
  value = apply(value, "2026-01-01", { type: "check", id: "b" });
  assert.equal(value.completedDates.length, 0);
  assert.throws(() => apply(value, "2026-01-01", { type: "check", id: "deleted" }));
});
test("notes preserve completion and count/checklist progress", () => {
  let value = configured({ tracking: "count", dailyGoal: 2 }, [], {
    "2026-01-01": { count: 2, checks: [], note: "" },
  });
  value.completedDates = ["2026-01-01"];
  value = apply(value, "2026-01-01", { type: "note", note: "felt good" });
  assert.deepEqual(value.completedDates, ["2026-01-01"]);
  assert.equal(value.entries["2026-01-01"].count, 2);
  assert.equal(value.entries["2026-01-01"].note, "felt good");
});
test("weekend rest days do not break a weekday streak; missed scheduled days do", () => {
  const value = configured({ frequency: "weekdays", weekdays: [1, 2, 3, 4, 5] }, [
    "2026-01-08",
    "2026-01-09",
    "2026-01-12",
  ]);
  assert.equal(habitStats(value, "2026-01-12").streak, 3);
  assert.equal(habitStats(value, "2026-01-13").streak, 3);
  assert.equal(habitStats(value, "2026-01-14").streak, 0);
  assert.equal(habitScheduled(value, "2026-01-10"), false);
});
test("specific month days handle months without a 31st", () => {
  const value = configured({ frequency: "monthdays", monthdays: [31] }, [
    "2026-01-31",
    "2026-03-31",
  ]);
  assert.equal(habitStats(value, "2026-03-31").streak, 2);
  assert.equal(habitDue(value, "2026-02-28"), false);
});
test("weekly quota controls Due and consecutive successful periods", () => {
  const value = configured({ frequency: "period", period: "week", perPeriod: 2 }, [
    "2026-01-05",
    "2026-01-07",
    "2026-01-12",
    "2026-01-14",
  ]);
  assert.equal(periodCount(value, "2026-01-14"), 2);
  assert.equal(habitDue(value, "2026-01-15"), false);
  assert.equal(habitStats(value, "2026-01-14").streak, 2);
  assert.equal(habitStats(value, "2026-01-19").streak, 2);
  assert.equal(habitStats(value, "2026-01-26").streak, 0);
});
test("future, pre-creation and rest-day tracking are rejected", () => {
  const value = configured({ frequency: "weekdays", weekdays: [1] });
  assert.throws(() => apply(value, "2030-01-01", { type: "toggle" }));
  assert.throws(() => apply(value, "2024-01-01", { type: "toggle" }));
  assert.throws(() => apply(value, "2026-01-10", { type: "toggle" }));
});
test("quit habits are clean by default; marking a slip resets streak and can be undone", () => {
  let value = configured({ type: "quit", tracking: "tick" });
  assert.equal(habitIsComplete(value, "2026-01-01"), true);
  value = apply(value, "2026-01-01", { type: "toggle" });
  assert.equal(habitIsComplete(value, "2026-01-01"), false);
  assert.equal(habitStats(value, "2026-01-01").streak, 0);
  value = apply(value, "2026-01-01", { type: "toggle" });
  assert.equal(habitIsComplete(value, "2026-01-01"), true);
});
test("only today and yesterday can be changed, including month/year boundaries", () => {
  assert.equal(canEditHabitDay("2025-12-31", "2026-01-01"), true);
  assert.equal(canEditHabitDay("2026-01-01", "2026-01-01"), true);
  assert.equal(canEditHabitDay("2025-12-30", "2026-01-01"), false);
  assert.equal(canEditHabitDay("2026-01-02", "2026-01-01"), false);
  assert.throws(() =>
    applyHabitAction(configured({}), "2025-12-30", { type: "toggle" }, "2026-01-01"),
  );
});
test("quit count allows its daily limit and treats exceeding it as a slip", () => {
  let value = configured({ type: "quit", tracking: "count", dailyGoal: 1 });
  value = apply(value, "2026-01-01", { type: "increment", amount: 1 });
  assert.equal(habitIsComplete(value, "2026-01-01"), true);
  value = apply(value, "2026-01-01", { type: "increment", amount: 1 });
  assert.equal(habitIsComplete(value, "2026-01-01"), false);
});

test("schedule and tracking validation reject empty and invalid inputs", () => {
  for (const settings of [
    { frequency: "weekdays", weekdays: [] },
    { frequency: "monthdays", monthdays: [] },
    { tracking: "checklist", checklist: [] },
    { tracking: "count", dailyGoal: 0 },
    { reminder: "25:10" },
  ])
    assert.throws(() => validateHabitSettings({ ...normalizeHabitSettings(), ...settings }));
});
import vm from "node:vm";
const notificationSource = await readFile(
  new URL("../mobile-tasks/src/lib/native-notifications.ts", import.meta.url),
  "utf8",
);
const notificationJS = ts.transpileModule(notificationSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function notifications(available, fail = false, expoGo = false) {
  const imports = [];
  const exports = {};
  vm.runInNewContext(notificationJS, {
    exports,
    require(name) {
      if (name === "expo-constants")
        return { __esModule: true, default: { appOwnership: expoGo ? "expo" : "standalone" } };
      if (name === "expo") return { requireOptionalNativeModule: () => (available ? {} : null) };
      if (name === "react-native") return { Platform: { OS: "android" } };
      imports.push(name);
      if (name === "expo-notifications" || name.includes("topic"))
        throw new Error("Unexpected push topic import");
      if (fail) throw new Error("Native API missing");
      return { setNotificationHandler() {} };
    },
  });
  return { api: exports.getNativeNotifications(), imports };
}
test("old builds without notification natives keep the app usable", () => {
  const result = notifications(false);
  assert.equal(result.api, null);
  assert.equal(result.imports.length, 0);
});
test("local reminders load without importing the missing push topic module", () => {
  const result = notifications(true);
  assert.ok(result.api);
  assert.ok(result.imports.length > 0);
  assert.equal(
    result.imports.some((name) => name === "expo-notifications" || /topic/i.test(name)),
    false,
  );
});
test("incompatible notification API fails gracefully", () =>
  assert.equal(notifications(true, true).api, null));
const sharedDomain = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const widgetLayoutApi = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL("../mobile-tasks/src/domain/habit-widget-layout.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: widgetLayoutApi, Date, require: () => sharedDomain });
const widgetSource = await readFile(
  new URL("../mobile-tasks/src/widgets/habit-widget-store.ts", import.meta.url),
  "utf8",
);
const widgetJS = ts.transpileModule(widgetSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function widgetHarness() {
  const memory = new Map(),
    writes = [],
    documents = new Map(),
    renderCalls = [];
  let currentUid = "alice";
  const storage = {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => {
      memory.set(key, value);
    },
    removeItem: async (key) => {
      memory.delete(key);
    },
  };
  const exports = {};
  vm.runInNewContext(widgetJS, {
    exports,
    Date,
    require(name) {
      if (name === "@react-native-async-storage/async-storage")
        return { __esModule: true, default: storage };
      if (name === "expo-constants")
        return { __esModule: true, default: { appOwnership: "standalone" } };
      if (name === "react-native") return { Platform: { OS: "android" } };
      if (name === "../domain/habits") return sharedDomain;
      if (name === "../domain/habit-widget-layout") return widgetLayoutApi;
      if (name === "../lib/firebase")
        return {
          getFirebaseFirestore: () => ({}),
          getFirebaseAuth: () => ({ currentUser: { uid: currentUid } }),
        };
      if (name === "./HabitWidget") return { renderHabitWidget: (...args) => { renderCalls.push(args); return args[0] ?? null; } };
      if (name === "react-native-android-widget")
        return { requestWidgetUpdate: async () => {}, requestPinWidget: async () => true };
      if (name === "firebase/firestore")
        return {
          doc: (_db, _users, uid, _habits, id) => ({ uid, id }),
          arrayUnion: (value) => ({ union: value }),
          arrayRemove: (value) => ({ remove: value }),
          getDoc: async (ref) => ({
            id: ref.id,
            exists: () => documents.has(ref.id),
            data: () => documents.get(ref.id),
          }),
          runTransaction: async (_db, work) =>
            work({
              get: async (ref) => ({
                id: ref.id,
                exists: () => documents.has(ref.id),
                data: () => documents.get(ref.id),
              }),
              update: (ref, patch) => writes.push({ ref, patch }),
            }),
        };
      throw new Error("Unexpected widget dependency: " + name);
    },
  });
  return {
    api: exports,
    memory,
    writes,
    documents,
    renderCalls,
    asUser: (uid) => {
      currentUid = uid;
    },
  };
}
test("each widget keeps its habit binding and does not reveal another account's cache", async () => {
  const { api } = widgetHarness();
  const today = habitDay();
  const a = { ...configured({}), id: "a", name: "Read" },
    b = { ...configured({}), id: "b", name: "Walk" };
  await api.cacheWidgetHabits("alice", [a, b]);
  await api.bindHabitWidget(1, "alice", "a");
  await api.bindHabitWidget(2, "alice", "b");
  assert.equal((await api.habitWidgetView(1, "alice", "", false)).id, "a");
  assert.equal((await api.habitWidgetView(2, "alice", "", false)).id, "b");
  assert.equal(await api.habitWidgetView(1, "bob", "", false), null);
  await api.removeHabitWidget(1);
  assert.equal(await api.habitWidgetView(1, "alice", "", false), null);
  assert.equal((await api.habitWidgetView(2, "alice", "", false)).id, "b");
});
test("widget completion targets today's bound habit and rejects account changes", async () => {
  const { api, writes, documents, asUser } = widgetHarness();
  const a = { ...configured({}), id: "a" };
  documents.set("a", a);
  await api.cacheWidgetHabits("alice", [a]);
  await api.bindHabitWidget(1, "alice", "a");
  await api.actOnHabitWidget(1, "alice", "HABIT_TOGGLE");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ref.id, "a");
  assert.equal(writes[0].patch.completedDates.union, habitDay());
  assert.equal(writes[0].patch["entries." + habitDay()].count, 1);
  asUser("bob");
  await assert.rejects(() => api.actOnHabitWidget(1, "alice", "HABIT_TOGGLE"));
  assert.equal(writes.length, 1);
});
test("widget caches discard malformed data", async () => {
  const { api, memory } = widgetHarness();
  memory.set("ssc-buddy:habit-widget-cache:v1", "bad json");
  assert.equal((await api.readWidgetHabits("alice")).length, 0);
});

const clockSource = await readFile(
  new URL("../mobile-tasks/src/domain/clock-hand.ts", import.meta.url),
  "utf8",
);
const clockJS = ts.transpileModule(clockSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { clockValueFromPoint } = await import(
  `data:text/javascript;base64,${Buffer.from(clockJS).toString("base64")}`
);
test("clock dragging maps all cardinal directions clockwise", () => {
  for (const [x, y, h, m] of [
    [110, 23, 12, 0],
    [197, 110, 3, 15],
    [110, 197, 6, 30],
    [23, 110, 9, 45],
  ]) {
    assert.equal(clockValueFromPoint(x, y, "hour"), h);
    assert.equal(clockValueFromPoint(x, y, "minute"), m);
  }
});
test("minute dragging selects exact minutes between five-minute labels and wraps at twelve", () => {
  for (const minute of [0, 1, 4, 7, 14, 29, 31, 44, 58, 59]) {
    const a = (minute / 60) * 2 * Math.PI - Math.PI / 2;
    assert.equal(
      clockValueFromPoint(110 + Math.cos(a) * 87, 110 + Math.sin(a) * 87, "minute"),
      minute,
    );
  }
  const a = (59.9 / 60) * 2 * Math.PI - Math.PI / 2;
  assert.equal(clockValueFromPoint(110 + Math.cos(a) * 87, 110 + Math.sin(a) * 87, "minute"), 0);
});
test("clock dragging ignores an ambiguous center grab and invalid coordinates", () => {
  assert.equal(clockValueFromPoint(110, 110, "hour"), null);
  assert.equal(clockValueFromPoint(115, 110, "minute"), null);
  assert.equal(clockValueFromPoint(NaN, 20, "hour"), null);
  assert.equal(clockValueFromPoint(Infinity, 20, "minute"), null);
  assert.equal(clockValueFromPoint(110, -50, "minute"), 0);
});

test("Expo Go never calls the incompatible native notification channel APIs", () => {
  const result = notifications(true, false, true);
  assert.equal(result.api, null);
  assert.equal(result.imports.length, 0);
});
test("Save stays disabled until every required habit field is valid", () => {
  const fields = ["Read", "purple", "", normalizeHabitSettings(), "1", "1"];
  assert.equal(sharedDomain.canSaveHabit(...fields), true);
  assert.equal(sharedDomain.canSaveHabit("  ", ...fields.slice(1)), false);
  assert.equal(sharedDomain.canSaveHabit("Read", "purple", "bad", ...fields.slice(3)), false);
  for (const tracking of ["weekdays", "monthdays"])
    assert.equal(
      sharedDomain.canSaveHabit(
        "Read",
        "purple",
        "",
        { ...normalizeHabitSettings(), frequency: tracking, weekdays: [], monthdays: [] },
        "1",
        "1",
      ),
      false,
    );
  assert.equal(
    sharedDomain.canSaveHabit(
      "Read",
      "purple",
      "",
      { ...normalizeHabitSettings(), tracking: "checklist", checklist: [] },
      "1",
      "1",
    ),
    false,
  );
  for (const [goal, amount] of [
    ["", "1"],
    ["1", ""],
    ["1", "0"],
    ["NaN", "1"],
  ])
    assert.equal(
      sharedDomain.canSaveHabit(
        "Read",
        "purple",
        "",
        { ...normalizeHabitSettings(), tracking: "count" },
        goal,
        amount,
      ),
      false,
    );
  assert.equal(
    sharedDomain.canSaveHabit(
      "Read",
      "purple",
      "",
      { ...normalizeHabitSettings(), type: "quit", tracking: "count" },
      "0",
      "1",
    ),
    true,
  );
  assert.equal(
    sharedDomain.canSaveHabit(
      "Read",
      "purple",
      "",
      { ...normalizeHabitSettings(), type: "quit", tracking: "count" },
      "",
      "1",
    ),
    false,
  );
});
const previewSource = await readFile(
  new URL("../mobile-tasks/src/domain/optimistic-habits.ts", import.meta.url),
  "utf8",
);
const previewExports = {};
vm.runInNewContext(
  ts.transpileModule(previewSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: previewExports, require: () => sharedDomain },
);
function optimisticHarness() {
  const slots = [];
  let index = 0;
  const effects = [];
  let receive;
  const waiting = [];
  let cloud = { ...configured({ tracking: "count", dailyGoal: 8 }), id: "a" };
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === "function" ? value(slots[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!(i in slots) || deps.some((v, j) => v !== slots[i]?.[j])) {
        slots[i] = deps;
        effects.push(fn);
      }
    },
  };
  const exports = {};
  const source = fsHookSource;
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === "react") return react;
        if (name === "react-native") return { AppState: {} };
        if (name.includes("optimistic-habits")) return previewExports;
        if (name.includes("domain/habits")) return sharedDomain;
        if (name.includes("lib/firebase")) return { getFirebaseFirestore: () => ({}) };
        if (name === "firebase/firestore")
          return {
            collection: () => ({}),
            doc: () => ({}),
            onSnapshot(_r, cb) {
              receive = cb;
              cb({ docs: [{ id: cloud.id, data: () => cloud }] });
              return () => {};
            },
            arrayUnion: (x) => ({ union: x }),
            arrayRemove: (x) => ({ remove: x }),
            runTransaction: async (_db, fn) => {
              await new Promise((resolve, reject) => waiting.push({ resolve, reject }));
              let patch;
              const next = await fn({
                get: async () => ({ id: cloud.id, exists: () => true, data: () => cloud }),
                update: (_r, value) => {
                  patch = value;
                },
              });
              cloud = {
                ...cloud,
                entries: { ...cloud.entries, [habitDay()]: patch["entries." + habitDay()] },
                completedDates: patch.completedDates.union ? [habitDay()] : [],
              };
              receive({ docs: [{ id: cloud.id, data: () => cloud }] });
              return next;
            },
          };
        throw new Error(name);
      },
    },
  );
  const render = () => {
    index = 0;
    const result = exports.useHabits("alice");
    while (effects.length) effects.shift()();
    return result;
  };
  render();
  return {
    render,
    waiting,
    cloudSnapshot() {
      receive({ docs: [{ id: cloud.id, data: () => cloud }] });
    },
  };
}
const fsHookSource = await readFile(
  new URL("../mobile-tasks/src/hooks/use-habits.ts", import.meta.url),
  "utf8",
);
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
test("habit marking is immediate and queued rapid increments survive old snapshots", async () => {
  const h = optimisticHarness();
  let hook = h.render();
  const first = hook.updateDay("a", habitDay(), { type: "increment", amount: 1 });
  assert.equal(h.render().habits[0].entries[habitDay()].count, 1);
  const second = h.render().updateDay("a", habitDay(), { type: "increment", amount: 1 });
  assert.equal(h.render().habits[0].entries[habitDay()].count, 2);
  h.cloudSnapshot();
  assert.equal(h.render().habits[0].entries[habitDay()].count, 2);
  await flush();
  assert.equal(h.waiting.length, 1);
  h.waiting.shift().resolve();
  await first;
  await flush();
  assert.equal(h.render().habits[0].entries[habitDay()].count, 2);
  h.waiting.shift().resolve();
  await second;
  assert.equal(h.render().habits[0].entries[habitDay()].count, 2);
});
test("failed background marking rolls back without leaving a pending change", async () => {
  const h = optimisticHarness();
  const work = h.render().updateDay("a", habitDay(), { type: "increment", amount: 1 });
  assert.equal(h.render().habits[0].entries[habitDay()].count, 1);
  await flush();
  const rejected = assert.rejects(work);
  h.waiting.shift().reject(new Error("offline"));
  await rejected;
  assert.equal(sharedDomain.habitEntry(h.render().habits[0], habitDay()).count, 0);
});


test("habit widget style persists per instance, including compact pins and legacy heatmaps", async () => {
  const { api, renderCalls, memory } = widgetHarness();
  const item = { ...configured({}), id: "style-habit", name: "Read" };
  await api.cacheWidgetHabits("alice", [item]);
  await api.bindHabitWidget(90, "alice", item.id, "compact");
  await api.bindHabitWidget(91, "alice", item.id);
  await api.habitWidgetView(90, "alice", "", false);
  assert.equal(renderCalls.at(-1)[3], "compact");
  await api.habitWidgetView(91, "alice", "", false);
  assert.equal(renderCalls.at(-1)[3], "heatmap");
  memory.set("ssc-buddy:habit-widget:92", JSON.stringify({ uid: "alice", habitId: item.id }));
  await api.habitWidgetView(92, "alice", "", false);
  assert.equal(renderCalls.at(-1)[3], "heatmap");
  await api.pinHabitWidget("alice", item.id, "compact");
  await api.bindPendingHabitWidget(93, "alice");
  await api.habitWidgetView(93, "alice", "", false);
  assert.equal(renderCalls.at(-1)[3], "compact");
});


const reminderPlanExports = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL("../mobile-tasks/src/domain/habit-reminder-plan.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: reminderPlanExports, Date, require: () => sharedDomain });
const schedulerExports = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL("../mobile-tasks/src/lib/habit-reminder-scheduler.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: schedulerExports, Date, Set, Map, require: () => ({ HABIT_NOTIFICATION_CHANNEL: "habits" }) });
const reminderNow = new Date("2026-10-21T08:00:00");
const reminderHabit = (id, time = "09:00") => ({ id, name: id, color: "purple", createdAt: "2026-01-01T00:00:00Z", completedDates: [], settings: sharedDomain.normalizeHabitSettings({ reminder: time }) });
function schedulerHarness() {
  const alarms = new Map(), writes = [], cancelled = [];
  let fail = false;
  const notifications = {
    SchedulableTriggerInputTypes: { DATE: "date" },
    getAllScheduledNotificationsAsync: async () => [...alarms.values()],
    scheduleNotificationAsync: async alarm => { if (fail) throw new Error("Alarm failed"); writes.push(alarm.identifier); alarms.set(alarm.identifier, alarm); },
    cancelScheduledNotificationAsync: async id => { cancelled.push(id); alarms.delete(id); },
  };
  return { notifications, alarms, writes, cancelled, fail: () => { fail = true; } };
}
test("reminder alarms are chronological, account-scoped and stable across habit snapshots", () => {
  const habits = [reminderHabit("late", "21:00"), reminderHabit("early")];
  const plan = reminderPlanExports.habitReminderPlan(habits, "alice", reminderNow);
  assert.equal(plan.length, 60);
  assert.equal(plan[0].habitId, "early");
  assert.ok(plan.every((alarm, i) => !i || alarm.at >= plan[i - 1].at));
  assert.equal(plan[0].identifier, reminderPlanExports.habitReminderPlan([...habits].reverse(), "alice", reminderNow)[0].identifier);
  assert.notEqual(plan[0].identifier, reminderPlanExports.habitReminderPlan(habits, "bob", reminderNow)[0].identifier);
});
test("habit completion removes today's reminder without disturbing future alarms", () => {
  const habit = reminderHabit("read");
  habit.completedDates = ["2026-10-21"];
  const plan = reminderPlanExports.habitReminderPlan([habit], "alice", reminderNow);
  assert.equal(new Date(plan[0].at).getDate(), 22);
});
test("unchanged reminder snapshots preserve alarms without cancellation or rescheduling", async () => {
  const h = schedulerHarness();
  const plan = reminderPlanExports.habitReminderPlan([reminderHabit("read")], "alice", reminderNow);
  await schedulerExports.reconcileHabitReminders(h.notifications, plan, "alice");
  const writes = h.writes.length;
  await schedulerExports.reconcileHabitReminders(h.notifications, plan, "alice");
  assert.equal(h.writes.length, writes);
  assert.equal(h.cancelled.length, 0);
});
test("failed replacement keeps working alarms; obsolete reminders and other notifications stay isolated", async () => {
  const h = schedulerHarness();
  const old = reminderPlanExports.habitReminderPlan([reminderHabit("read")], "alice", reminderNow);
  await schedulerExports.reconcileHabitReminders(h.notifications, old, "alice");
  h.alarms.set("music", { identifier: "music", content: { data: { source: "music" } } });
  h.fail();
  const next = reminderPlanExports.habitReminderPlan([reminderHabit("read", "10:00")], "alice", reminderNow);
  await assert.rejects(schedulerExports.reconcileHabitReminders(h.notifications, next, "alice"), /Alarm failed/);
  assert.equal(h.cancelled.length, 0);
  assert.ok(h.alarms.has(old[0].identifier));
  await schedulerExports.reconcileHabitReminders(h.notifications, [], "alice");
  assert.ok(h.alarms.has("music"));
  assert.equal(h.alarms.size, 1);
});


test("Quit habits receive today's reminder even though they start completed by default", () => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const habit = reminderHabit("quit");
  habit.settings = sharedDomain.normalizeHabitSettings({ type: "quit", reminder: "23:59" });
  const plan = reminderPlanExports.habitReminderPlan([habit], "alice", now);
  assert.ok(plan.length > 0);
  assert.equal(sharedDomain.habitDay(new Date(plan[0].at)), sharedDomain.habitDay(now));
});
test("late Android alarms are retained while still valid instead of cancelled on resume", async () => {
  const h = schedulerHarness();
  const old = reminderPlanExports.habitReminderPlan([reminderHabit("read")], "alice", reminderNow);
  await schedulerExports.reconcileHabitReminders(h.notifications, old, "alice");
  const preserve = new Set([old[0].identifier]);
  await schedulerExports.reconcileHabitReminders(h.notifications, old.slice(1), "alice", () => true, preserve);
  assert.ok(h.alarms.has(old[0].identifier));
  assert.equal(h.cancelled.length, 0);
});
test("editing one habit replaces only its own alarms and preserves other habit reminders", async () => {
  const h = schedulerHarness();
  const initial = reminderPlanExports.habitReminderPlan([reminderHabit("read"), reminderHabit("exercise")], "alice", reminderNow);
  await schedulerExports.reconcileHabitReminders(h.notifications, initial, "alice");
  const otherIds = initial.filter(alarm => alarm.habitId === "exercise").map(alarm => alarm.identifier);
  const edited = reminderPlanExports.habitReminderPlan([reminderHabit("read", "10:00")], "alice", reminderNow);
  await schedulerExports.reconcileHabitReminders(h.notifications, edited, "alice", () => true, new Set(), "read");
  assert.ok(otherIds.every(id => h.alarms.has(id)));
  assert.ok(edited.every(alarm => h.alarms.has(alarm.identifier)));
  assert.ok(initial.filter(alarm => alarm.habitId === "read").every(alarm => !h.alarms.has(alarm.identifier)));
});
