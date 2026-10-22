import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditFocusDay, emptyFocusDay, focusSlices, focusDayKey, todayFocusMilliseconds, formatFocusTime, rangeFocusMilliseconds } from '../shared/study-focus.ts';
const session = (start, end, id = 'session') => ({ id, startedAt: Date.parse(start), endsAt: Date.parse(end), timeZone: 'Asia/Kolkata' });

test('profile focus respects date filters, excludes breaks, and counts live credits only once', () => {
  const value = session('2026-10-22T23:45:00+05:30', '2026-10-23T00:15:00+05:30');
  const days = {
    '2026-10-21': creditFocusDay(emptyFocusDay(), 'previous', 3600000),
    '2026-10-22': creditFocusDay(emptyFocusDay(), value.id, 900000),
    '2026-10-23': creditFocusDay(emptyFocusDay(), value.id, 300000),
  };
  assert.equal(rangeFocusMilliseconds(days, value, date => date === '2026-10-23', value.endsAt), 900000);
  assert.equal(rangeFocusMilliseconds(days, value, () => true, value.endsAt), 5400000);
  assert.equal(rangeFocusMilliseconds(days, { ...value, paused: true, pausedAt: value.startedAt + 1200000 }, date => date === '2026-10-23', value.endsAt), 300000);
  assert.equal(rangeFocusMilliseconds(days, null, date => date === '2026-10-21'), 3600000);
  assert.equal(rangeFocusMilliseconds({}, null, () => true), 0);
});
test('paused sessions keep exact seconds and never count break time during later sync', () => {
  const value = session('2026-10-22T10:00:00+05:30', '2026-10-22T11:00:00+05:30');
  const paused = { ...value, paused: true, pausedAt: value.startedAt + 45000 };
  assert.deepEqual(focusSlices(paused, value.endsAt + 3600000, true), [{ date: '2026-10-22', milliseconds: 45000 }]);
});
test('daily focus counts elapsed time only and caps at the deadline', () => {
  const value = session('2026-10-22T10:00:00+05:30', '2026-10-22T11:00:00+05:30');
  assert.deepEqual(focusSlices(value, value.startedAt - 1), []);
  assert.deepEqual(focusSlices(value, value.startedAt + 125000, true), [{ date: '2026-10-22', milliseconds: 120000 }]);
  assert.deepEqual(focusSlices(value, value.endsAt + 3600000, true), [{ date: '2026-10-22', milliseconds: 3600000 }]);
  assert.equal(focusSlices({ ...value, endsAt: value.startedAt + 13 * 3600000 }).length, 0);
});
test('midnight splits one session between calendar days in its stored time zone', () => {
  const value = session('2026-10-22T23:45:00+05:30', '2026-10-23T00:15:00+05:30');
  assert.deepEqual(focusSlices(value, value.endsAt, true), [
    { date: '2026-10-22', milliseconds: 900000 }, { date: '2026-10-23', milliseconds: 900000 }
  ]);
  assert.equal(focusDayKey(value.startedAt, value.timeZone), '2026-10-22');
  assert.equal(focusDayKey(value.endsAt, value.timeZone), '2026-10-23');
});
test('day splitting handles daylight saving without inventing focus time', () => {
  const value = { ...session('2026-11-01T00:30:00-04:00', '2026-11-01T02:30:00-05:00'), timeZone: 'America/New_York' };
  assert.deepEqual(focusSlices(value, value.endsAt), [{ date: '2026-11-01', milliseconds: 3 * 3600000 }]);
});
test('retries, reconnects and multiple clients never double credit a session', () => {
  let day = creditFocusDay(emptyFocusDay(), 'one', 60000);
  day = creditFocusDay(day, 'one', 60000);
  day = creditFocusDay(day, 'one', 30000);
  assert.equal(day.totalMilliseconds, 60000);
  day = creditFocusDay(day, 'two', 120000);
  day = creditFocusDay(day, 'one', 90000);
  assert.equal(day.totalMilliseconds, 210000);
  const value = session('2026-10-22T10:00:00+05:30', '2026-10-22T11:00:00+05:30', 'one');
  assert.equal(todayFocusMilliseconds(day, value, value.startedAt + 120000), 240000);
  assert.equal(formatFocusTime(75 * 60000), '1h 15m');
});
