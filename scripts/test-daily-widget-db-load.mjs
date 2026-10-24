import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const policyModule = { exports: {} };
vm.runInNewContext(compile(await readFile(new URL('../mobile-tasks/src/domain/daily-widget-score-sync.ts', import.meta.url), 'utf8')), { exports: policyModule.exports, module: policyModule });
const { createDailyWidgetScoreSync } = policyModule.exports;
const entry = compile(await readFile(new URL('../mobile-tasks/index.js', import.meta.url), 'utf8'));

function fixture() {
  const data = new Map();
  data.set('ssc-buddy:tasks:v2', JSON.stringify([{ id: 'task', completed: true }, { id: 'other', completed: true }]));
  const a = { uid: 'a' }, b = { uid: 'b' };
  let current = a, day = '2026-10-24', publications = 0, renders = 0, toggles = 0, failure = false, taskResult = true;
  const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } };
  const publish = async () => { publications++; if (failure) throw Error('offline'); };
  const options = { storage, today: () => day, isCurrentUser: user => current?.uid === user.uid, publish };
  let sync = createDailyWidgetScoreSync(options), handler;
  const optionsByWidget = new Map();
  const firebase = {
    getFirebaseAuth: () => ({ currentUser: current }),
    publishLeaderboardAfterWidgetTask: publish,
    toggleTaskFromWidget: async (_user, id) => { toggles++; if (!taskResult) return null; return { id, completed: false }; },
  };
  const unused = new Proxy({}, { get: () => () => undefined });
  const modules = {
    expo: { registerRootComponent() {} },
    'expo-constants': { default: { appOwnership: 'standalone' }, __esModule: true },
    'react-native': { AppRegistry: { registerComponent() {} }, Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': { default: storage },
    'react-native-android-widget': { registerWidgetConfigurationScreen() {}, registerWidgetTaskHandler: callback => { handler = callback; } },
    './src/domain/daily-widget-score-sync': { createDailyWidgetScoreSync },
    './src/domain/tasks': { dateKey: () => day },
    './src/lib/firebase': firebase,
    'firebase/auth': { onAuthStateChanged: (_auth, callback) => { queueMicrotask(() => callback(current)); return () => undefined; } },
    './src/lib/profile-store': { loadProfile: async () => ({ accentColor: '#f00' }) },
    './src/widgets/DailyTasksWidget': { renderDailyTasksWidget: (tasks, rank, accent, view) => ({ tasks, rank, accent, view }) },
    './src/widgets/daily-task-widget-store': {
      loadDailyTaskWidgetOptions: async (id, uid) => optionsByWidget.get(`${uid}:${id}`) ?? {},
      saveDailyTaskWidgetOptions: async (id, uid, value) => { optionsByWidget.set(`${uid}:${id}`, value); },
      removeDailyTaskWidgetOptions: async id => optionsByWidget.delete(`${current?.uid}:${id}`),
    },
  };
  const boot = () => vm.runInNewContext(entry, { require: name => modules[name] ?? unused, exports: {}, setTimeout, clearTimeout });
  boot();
  const event = (widgetAction, clickAction, extra = {}) => handler({ widgetInfo: { widgetName: 'DailyTasksWidget', widgetId: 1, height: 200, ...extra.widgetInfo }, widgetAction, clickAction, clickActionData: extra.clickActionData, renderWidget: result => { renders++; return result; } });
  return {
    a, b, data, event, optionsByWidget,
    sync: (user, reason) => sync(user, reason),
    restart: () => { sync = createDailyWidgetScoreSync(options); boot(); },
    set day(value) { day = value; }, set user(value) { current = value; }, set failure(value) { failure = value; }, set taskResult(value) { taskResult = value; },
    get publications() { return publications; }, get renders() { return renders; }, get toggles() { return toggles; },
  };
}

test('actual handler: date/filter clicks and resize render locally with zero score publications', async () => {
  const f = fixture();
  await f.event('WIDGET_CLICK', 'DAILY_FILTER_DUE');
  assert.equal(f.optionsByWidget.get('a:1').dueOnly, true);
  await f.event('WIDGET_CLICK', 'DAILY_DATE_2026-10-23');
  assert.equal(f.optionsByWidget.get('a:1').date, '2026-10-23');
  await f.event('WIDGET_CLICK', 'DAILY_FILTER_ALL');
  assert.equal(f.optionsByWidget.get('a:1').dueOnly, false);
  await f.event('WIDGET_RESIZED');
  assert.equal(f.publications, 0); assert.equal(f.renders, 4);
});

test('actual handler: successful mutation publishes once, subsequent same-day refresh skips', async () => {
  const f = fixture();
  await f.event('WIDGET_CLICK', 'TOGGLE_TASK', { clickActionData: { taskId: 'task' } });
  assert.equal(f.publications, 1); assert.equal(f.toggles, 1);
  await f.event('WIDGET_UPDATE'); assert.equal(f.publications, 1);
  const cached = JSON.parse(f.data.get('ssc-buddy:tasks:v2'));
  assert.equal(cached[0].completed, false); assert.equal(cached[1].completed, true);
});

test('actual handler: rejected/missing task does not publish; deletion does not publish or render', async () => {
  const f = fixture(); f.taskResult = false;
  await f.event('WIDGET_CLICK', 'TOGGLE_TASK', { clickActionData: { taskId: 'removed' } });
  await f.event('WIDGET_CLICK', 'TOGGLE_TASK');
  assert.equal(f.publications, 0); assert.equal(f.toggles, 1);
  await f.event('WIDGET_DELETED'); assert.equal(f.renders, 2); assert.equal(f.publications, 0);
});

test('actual handler: initial refresh once per account/day across widgets and process restart', async () => {
  const f = fixture();
  await Promise.all([f.event('WIDGET_ADDED'), f.event('WIDGET_UPDATE', undefined, { widgetInfo: { widgetId: 2 } })]);
  assert.equal(f.publications, 1);
  f.restart(); await f.event('WIDGET_UPDATE'); assert.equal(f.publications, 1);
  f.day = '2026-10-25'; await f.event('WIDGET_UPDATE'); await f.event('WIDGET_UPDATE');
  assert.equal(f.publications, 2);
  f.user = f.b; await f.event('WIDGET_UPDATE'); assert.equal(f.publications, 3);
  f.user = f.a; await f.event('WIDGET_UPDATE'); assert.equal(f.publications, 3);
});

test('actual handler: offline mutation stays pending across restart and retries on refresh', async () => {
  const f = fixture(); await f.event('WIDGET_UPDATE');
  f.failure = true;
  await f.event('WIDGET_CLICK', 'TOGGLE_TASK', { clickActionData: { taskId: 'task' } });
  assert.equal(f.publications, 2);
  assert.equal(JSON.parse(f.data.get('ssc-buddy:daily-widget-score:v1:a')).pending, true);
  f.restart(); f.failure = false;
  await f.event('WIDGET_UPDATE'); await f.event('WIDGET_UPDATE');
  assert.equal(f.publications, 3);
  assert.equal(JSON.parse(f.data.get('ssc-buddy:daily-widget-score:v1:a')).pending, false);
});

test('failed midnight refresh retries; week rollover does not require task interaction', async () => {
  const f = fixture(); await f.event('WIDGET_UPDATE');
  f.day = '2026-10-26'; f.failure = true; await f.event('WIDGET_UPDATE');
  assert.equal(JSON.parse(f.data.get('ssc-buddy:daily-widget-score:v1:a')).day, '2026-10-24');
  f.failure = false; await f.event('WIDGET_UPDATE'); await f.event('WIDGET_UPDATE');
  assert.equal(f.publications, 3);
  assert.equal(JSON.parse(f.data.get('ssc-buddy:daily-widget-score:v1:a')).day, '2026-10-26');
});

test('signed-out handler does not publish, stale account queued work is ignored', async () => {
  const f = fixture(); f.user = null;
  await f.event('WIDGET_UPDATE'); await f.sync(f.a, 'mutation');
  assert.equal(f.publications, 0);
});

test('corrupt persisted state recovers and separate mutations are not suppressed', async () => {
  const f = fixture(); f.data.set('ssc-buddy:daily-widget-score:v1:a', '{broken');
  await f.sync(f.a, 'refresh');
  await Promise.all([f.sync(f.a, 'mutation'), f.sync(f.a, 'mutation')]);
  assert.equal(f.publications, 3);
  await f.sync(f.a, 'refresh'); assert.equal(f.publications, 3);
});

test('storage write failure does not block publishing; an unsaved success is retried safely', async () => {
  const user = { uid: 'storage-failure' };
  let calls = 0, broken = true, saved = null;
  const sync = createDailyWidgetScoreSync({
    storage: { getItem: async () => saved, setItem: async (_key, value) => { if (broken) throw Error('disk unavailable'); saved = value; } },
    today: () => '2026-10-24', isCurrentUser: () => true, publish: async () => { calls++; },
  });
  await assert.rejects(sync(user, 'mutation'), /disk unavailable/);
  assert.equal(calls, 1);
  broken = false; await sync(user, 'refresh'); await sync(user, 'refresh');
  assert.equal(calls, 2); assert.equal(JSON.parse(saved).pending, false);
});

test('account changed during local storage IO cannot publish the previous account', async () => {
  const user = { uid: 'old' }; let active = true, calls = 0;
  const sync = createDailyWidgetScoreSync({
    storage: { getItem: async () => null, setItem: async () => { active = false; } },
    today: () => '2026-10-24', isCurrentUser: () => active, publish: async () => { calls++; },
  });
  await sync(user, 'refresh'); assert.equal(calls, 0);
});
