import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../mobile-tasks/src/domain/focus-timer-widget.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replaceAll('"../../../shared/study-focus"', JSON.stringify(new URL('../shared/study-focus.ts', import.meta.url).href)).replaceAll('"../../../shared/study-breaks"', JSON.stringify(new URL('../shared/study-breaks.ts', import.meta.url).href));
const { focusTimerWidgetModel: model, FOCUS_WIDGET_URI } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now = Date.parse('2026-10-22T10:30:00+05:30');
const session = { id: 'focus', startedAt: now - 30 * 60000, endsAt: now + 30 * 60000, timeZone: 'Asia/Kolkata' };
const snapshot = { uid: 'student', date: '2026-10-22', day: { totalMilliseconds: 60 * 60000, sessionCredits: { focus: 20 * 60000 } }, session, accent: '#ff8fbd' };

test('compact focus widget includes live uncredited focus once and uses whole minutes', () => {
  const value = model(snapshot, 'student', now + 30000);
  assert.equal(value.minutes, 70);
  assert.equal(value.label, '1h 10m');
  assert.equal(value.hint, 'Focusing');
});

test('breaks freeze today total, expired sessions cap elapsed time', () => {
  const paused = { ...session, paused: true, pausedAt: now };
  assert.equal(model({ ...snapshot, session: paused }, 'student', now + 3600000).minutes, 70);
  assert.equal(model({ ...snapshot, session: paused }, 'student', now + 3600000).hint, 'Paused');
  assert.equal(model(snapshot, 'student', session.endsAt + 3600000).minutes, 100);
});

test('midnight resets cached totals and credits only the new-day portion of a running session', () => {
  const nextDay = Date.parse('2026-10-23T00:05:00+05:30');
  assert.equal(model(snapshot, 'student', nextDay).label, '0m');
  const midnightSession = { ...session, startedAt: nextDay - 15 * 60000, endsAt: nextDay + 15 * 60000 };
  assert.equal(model({ ...snapshot, session: midnightSession }, 'student', nextDay).label, '5m');
});

test('sign-out and account switches never display another account focus total', () => {
  assert.equal(model(snapshot, undefined, now).label, '0m');
  assert.equal(model(snapshot, 'someone-else', now).label, '0m');
  assert.equal(model(null, 'student', now).hint, 'Start focus');
  assert.equal(FOCUS_WIDGET_URI, 'sscbuddy://focus-lock');
});

test('widget registration and tap destination open the focus setup, including a cold launch', async () => {
  const config = JSON.parse(await readFile(new URL('../mobile-tasks/app.json', import.meta.url), 'utf8'));
  const widgets = config.expo.plugins.find(item => Array.isArray(item) && item[0] === 'react-native-android-widget')[1].widgets;
  const focus = widgets.find(widget => widget.name === 'FocusTimerWidget');
  assert.equal(focus.targetCellWidth, 2);
  assert.equal(focus.targetCellHeight, 2);
  const app = await readFile(new URL('../mobile-tasks/App.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes('focus-lock(?:[/?#]|$)'));
  assert.ok(app.includes('openRequest={focusSetupRequest}'));
  const entry = await readFile(new URL('../mobile-tasks/index.js', import.meta.url), 'utf8');
  assert.ok(entry.includes('widgetInfo.widgetName === "FocusTimerWidget"'));
});
