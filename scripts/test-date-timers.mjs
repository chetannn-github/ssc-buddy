import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { parseTimerTarget, timerInputFields, makeDateTimer, normalizeDateTimer, dateCountdown, timerDial, timerReferenceDays } = await import(moduleUrl(compile(await readFile(new URL("../mobile-tasks/src/domain/date-timers.ts", import.meta.url), "utf8"))));

test("timer dates round-trip as local calendar dates, including leap day", () => {
  for (const date of ["2027-06-15", "2028-02-29", "2026-12-31"]) {
    const target = parseTimerTarget(date);
    assert.deepEqual(timerInputFields(target), { date });
    assert.equal(new Date(target).getHours(), 0);
    assert.equal(new Date(target).getMinutes(), 0);
  }
});

test("invalid calendar dates are rejected rather than rolling into another day", () => {
  for (const date of ["2027-02-29", "2026-04-31", "2026-13-01", "19/10/2026", ""]) assert.throws(() => parseTimerTarget(date));
});

test("multiple timers keep their identity and editing preserves creation time", () => {
  const first = makeDateTimer("first", " Exam ", "2027-06-15");
  const second = makeDateTimer("second", "Application deadline", "2027-04-01");
  assert.notEqual(first.id, second.id);
  assert.equal(first.title, "Exam");
  const edited = makeDateTimer(first.id, "Updated exam", "2027-06-20", first);
  assert.equal(edited.id, first.id);
  assert.equal(edited.createdAt, first.createdAt);
  assert.notEqual(edited.targetAt, first.targetAt);
  assert.equal(first.title, "Exam");
  assert.throws(() => makeDateTimer("id", "  ", "2027-06-15"));
});

test("countdowns count calendar days and ignore time on existing timers", () => {
  const now = new Date("2026-10-19T23:59:59").getTime();
  assert.deepEqual(dateCountdown(parseTimerTarget("2026-10-20"), now), { days: -1, reached: false });
  assert.deepEqual(dateCountdown(parseTimerTarget("2026-10-21"), now), { days: -2, reached: false });
  const morning = new Date("2026-10-19T00:00:00").getTime();
  assert.deepEqual(dateCountdown(new Date("2026-10-19T23:59:00").toISOString(), morning), { days: 0, reached: true });
  assert.deepEqual(dateCountdown(parseTimerTarget("2026-10-18"), now), { days: 1, reached: true });
  assert.deepEqual(dateCountdown("invalid", now), { days: 0, reached: true });
});

test("calendar countdown remains one day across daylight-saving transitions", () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    for (const [from, to] of [["2026-03-08", "2026-03-09"], ["2026-11-01", "2026-11-02"]]) {
      assert.deepEqual(dateCountdown(parseTimerTarget(to), new Date(from + "T12:00:00").getTime()), { days: -1, reached: false });
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test("malformed cloud timers are ignored and document ID is authoritative", () => {
  assert.equal(normalizeDateTimer("id", { title: "Exam", targetAt: "bad" }), null);
  assert.equal(normalizeDateTimer("id", null), null);
  assert.equal(normalizeDateTimer("id", { title: " ", targetAt: "2027-06-15T00:00:00Z" }), null);
  assert.equal(normalizeDateTimer("real-id", { id: "forged", title: "Exam", targetAt: "2027-06-15T00:00:00Z" }).id, "real-id");
});

const webProfile = await import(moduleUrl(compile(await readFile(new URL("../src/lib/profile.ts", import.meta.url), "utf8"))));
const mobileSource = compile(await readFile(new URL("../mobile-tasks/src/lib/profile-store.ts", import.meta.url), "utf8")).replace(/^import AsyncStorage[^\n]+\n/m, "const AsyncStorage = {};\n");
const mobileProfile = await import(moduleUrl(mobileSource));
test("Timers toggle survives web save/load and mobile normalization, including re-enabling", () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.window = { dispatchEvent: () => undefined };
  const base = { name: "Student", questionGoal: 100, practiceSessionEnabled: false, trackProgressEnabled: false };
  for (const enabled of [false, true]) {
    const profile = { ...base, timersEnabled: enabled };
    webProfile.savePracticeProfile(profile);
    const loaded = webProfile.loadPracticeProfile();
    assert.equal(loaded.timersEnabled !== false, enabled);
    assert.equal(mobileProfile.normalizeProfile(profile).timersEnabled, enabled);
    assert.equal(loaded.practiceSessionEnabled, false);
    assert.equal(loaded.trackProgressEnabled, false);
  }
});

test("timer dial shows minus for future dates, plus for past dates and zero today", () => {
  const timer = { id: "exam", title: "Exam", targetAt: parseTimerTarget("2026-10-20"), createdAt: parseTimerTarget("2026-10-10") };
  const before = timerDial(timer, Date.parse(parseTimerTarget("2026-10-15")));
  assert.equal(before.label, "−5");
  assert.equal(before.status, "DAYS LEFT");
  assert.equal(before.progress, 0.5);
  const after = timerDial(timer, Date.parse(parseTimerTarget("2026-10-23")));
  assert.equal(after.label, "+3");
  assert.equal(after.status, "DAYS AGO");
  assert.equal(after.progress, 0);
  const today = timerDial(timer, Date.parse(timer.targetAt));
  assert.equal(today.label, "0");
  assert.equal(today.status, "TODAY");
});

test("liquid drains in proportion to calendar days remaining and stays empty after the date", () => {
  const timer = { id: "exam", title: "Exam", targetAt: parseTimerTarget("2026-10-20"), createdAt: parseTimerTarget("2026-10-10") };
  for (const [date, expected] of [["2026-10-09", 1], ["2026-10-10", 1], ["2026-10-15", 0.5], ["2026-10-19", 0.1], ["2026-10-20", 0], ["2026-10-25", 0]]) {
    assert.equal(timerDial(timer, Date.parse(parseTimerTarget(date))).progress, expected);
  }
});

test("multiple timers compare remaining days against the longest remaining timer", () => {
  const now = Date.parse(parseTimerTarget("2026-10-10"));
  const make = (id, date) => ({ id, title: id, targetAt: parseTimerTarget(date), createdAt: parseTimerTarget("2026-10-01") });
  const long = make("long", "2026-10-30");
  const short = make("short", "2026-10-20");
  const past = make("past", "2026-10-05");
  const timers = [long, short, past];
  const reference = timerReferenceDays(timers, now);
  assert.equal(reference, 20);
  assert.equal(timerDial(long, now, reference).progress, 1);
  assert.equal(timerDial(short, now, reference).progress, 0.5);
  assert.equal(timerDial(past, now, reference).progress, 0);
  const later = Date.parse(parseTimerTarget("2026-10-15"));
  assert.equal(timerDial(short, later, timerReferenceDays(timers, later)).progress, 1 / 3);
  assert.equal(timerReferenceDays([short], now), undefined);
  assert.equal(timerDial(short, now, timerReferenceDays([short], now)).progress, 10 / 19);
  assert.equal(timerReferenceDays([], now), undefined);
  assert.equal(timerReferenceDays([past, make("older", "2026-10-02")], now), 0);
});
