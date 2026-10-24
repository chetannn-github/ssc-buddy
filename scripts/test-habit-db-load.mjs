import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

// Execute the real hooks with deterministic state/effect lifecycles. Firestore
// and native storage are mocked; these are call-path tests, not emulator tests.
function fixture() {
  const database = {}, docs = new Map(), storage = new Map(), subscriptions = [], moduleCache = new Map();
  let activeHost, readCount = 0, writes = 0, directReads = 0, transactionFailure = false, cacheFailure = false, user = { uid: 'u' };
  const snapshot = (id, value) => ({ id, exists: () => !!value, data: () => structuredClone(value) });
  const emit = (subscription) => {
    const parts = subscription.ref.path.split('/');
    if (parts.length === 4) subscription.next(snapshot(parts[3], docs.get(subscription.ref.path)));
    else subscription.next({ docs: [...docs].filter(([key]) => key.startsWith(subscription.ref.path + '/')).map(([key, value]) => snapshot(key.split('/').at(-1), value)) });
  };
  const notify = key => subscriptions.filter(s => s.active && (s.ref.path === key || key.startsWith(s.ref.path + '/'))).forEach(emit);
  const firestore = {
    collection: (_db, ...parts) => ({ path: parts.join('/') }),
    doc: (base, ...parts) => ({ path: base.path ? `${base.path}/${parts.join('/') || 'new'}` : parts.join('/') }),
    onSnapshot: (ref, next, error) => {
      const sub = { ref, next, error, active: true }; subscriptions.push(sub); emit(sub);
      return () => { sub.active = false; };
    },
    arrayUnion: value => ({ op: 'union', value }), arrayRemove: value => ({ op: 'remove', value }),
    runTransaction: async (_db, work) => {
      if (transactionFailure) throw Error('offline');
      const updates = [];
      const result = await work({
        get: async ref => { readCount++; return snapshot(ref.path.split('/').at(-1), docs.get(ref.path)); },
        update: (ref, patch) => updates.push({ ref, patch }),
      });
      for (const { ref, patch } of updates) {
        writes++; const value = docs.get(ref.path);
        for (const [key, update] of Object.entries(patch)) {
          if (key.startsWith('entries.')) value.entries = { ...value.entries, [key.slice(8)]: structuredClone(update) };
          else if (key === 'completedDates') value.completedDates = update.op === 'union' ? [...new Set([...value.completedDates, update.value])] : value.completedDates.filter(day => day !== update.value);
        }
        notify(ref.path);
      }
      return result;
    },
    getDoc: async ref => { directReads++; return snapshot(ref.path.split('/').at(-1), docs.get(ref.path)); },
    setDoc: async (ref, value) => { docs.set(ref.path, structuredClone(value)); notify(ref.path); },
    deleteDoc: async ref => { docs.delete(ref.path); notify(ref.path); },
  };
  const react = {
    useState(initial) {
      const host = activeHost, slot = host.cursor++;
      if (!(slot in host.slots)) host.slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [host.slots[slot], value => { host.slots[slot] = typeof value === 'function' ? value(host.slots[slot]) : value; host.dirty = true; }];
    },
    useRef(initial) { const host = activeHost, slot = host.cursor++; return host.slots[slot] ??= { current: initial }; },
    useEffect(effect, deps) {
      const host = activeHost, slot = host.cursor++, old = host.slots[slot];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        host.effects.push(() => { old?.cleanup?.(); host.slots[slot] = { deps, cleanup: effect() }; });
      }
    },
  };
  const asyncStorage = {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { if (cacheFailure && key === 'ssc-buddy:habit-widget-cache:v1') throw Error('cache full'); storage.set(key, value); },
  };
  const nativeFirebase = { getFirebaseFirestore: () => database, getFirebaseAuth: () => ({ currentUser: user }) };
  function load(relative) {
    const filename = path.isAbsolute(relative) ? relative : path.join(root, relative);
    if (moduleCache.has(filename)) return moduleCache.get(filename);
    const exports = {}; moduleCache.set(filename, exports);
    vm.runInNewContext(compile(readFileSync(filename, 'utf8')), {
      exports, Date, console, setInterval, clearInterval, require(name) {
        if (name === 'react') return react;
        if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove() {} }) } };
        if (name === 'firebase/firestore') return firestore;
        if (name === '@react-native-async-storage/async-storage') return { default: asyncStorage, __esModule: true };
        if (name === 'expo-constants') return { default: { appOwnership: 'standalone' }, __esModule: true };
        if (name === '@/lib/firebase-sync' || name === '../lib/firebase' || name === './firebase') return nativeFirebase;
        if (name === './HabitWidget') return { renderHabitWidget: (habit, error, size, style) => ({ habit, error, size, style }) };
        if (name === 'react-native-android-widget') return { requestWidgetUpdate: async () => undefined };
        assert.ok(name.startsWith('.'), `Unexpected dependency ${name}`);
        const base = path.resolve(path.dirname(filename), name);
        return load([base + '.ts', base + '.tsx'].find(existsSync));
      },
    });
    return exports;
  }
  const domain = load('mobile-tasks/src/domain/habits.ts'), day = domain.habitDay();
  const add = (id = 'one', uid = 'u', settings = {}) => {
    const habit = { id, name: id, color: 'purple', createdAt: '2026-01-01T12:00:00', targetDays: null, completedDates: [], entries: {}, settings: domain.normalizeHabitSettings({ tracking: 'count', dailyGoal: 3, ...settings }) };
    docs.set(`users/${uid}/habits/${id}`, habit); return habit;
  };
  const mount = (file, uid = 'u', habitId) => {
    const hook = load(file).useHabits;
    const host = { slots: [], effects: [], cursor: 0, dirty: true, uid, habitId, api: null };
    host.flush = () => {
      let iterations = 0;
      do {
        assert.ok(++iterations < 20, 'hook must settle'); host.dirty = false; host.cursor = 0; activeHost = host;
        host.api = hook(host.uid, host.habitId); activeHost = null;
        host.effects.splice(0).forEach(effect => effect());
      } while (host.dirty);
      return host.api;
    };
    host.unmount = () => { host.slots.forEach(slot => slot?.cleanup?.()); };
    host.flush(); return host;
  };
  const widgetStore = () => load('mobile-tasks/src/widgets/habit-widget-store.ts');
  const widgetHandler = () => {
    let handler;
    const unused = new Proxy({}, { get: () => () => undefined });
    const modules = {
      expo: { registerRootComponent() {} }, 'expo-constants': { default: { appOwnership: 'standalone' }, __esModule: true },
      'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerComponent() {} } },
      '@react-native-async-storage/async-storage': { default: asyncStorage },
      'react-native-android-widget': { registerWidgetConfigurationScreen() {}, registerWidgetTaskHandler: value => { handler = value; } },
      './src/widgets/habit-widget-store': widgetStore(), './src/lib/firebase': nativeFirebase,
      './src/domain/daily-widget-score-sync': { createDailyWidgetScoreSync: () => async () => undefined },
    };
    vm.runInNewContext(compile(readFileSync(path.join(root, 'mobile-tasks/index.js'), 'utf8')), { exports: {}, require: name => modules[name] ?? unused, setTimeout, clearTimeout });
    return async action => {
      let rendered;
      await handler({ widgetInfo: { widgetName: 'HabitCompactWidget', widgetId: 1 }, widgetAction: 'WIDGET_CLICK', clickAction: action, renderWidget: value => { rendered = value; } });
      return rendered;
    };
  };
  return { load, domain, day, add, docs, storage, subscriptions, mount, notify, widgetStore, widgetHandler,
    get reads() { return readCount; }, get writes() { return writes; }, get directReads() { return directReads; },
    set transactionFailure(value) { transactionFailure = value; }, set cacheFailure(value) { cacheFailure = value; },
  };
}

for (const [platform, file] of [
  ['web', 'src/lib/habits.ts'], ['Android', 'mobile-tasks/src/hooks/use-habits.ts'], ['Windows', 'desktop-widget/src/lib/habits.ts'],
]) {
  test(`${platform}: two consumers share one listener, cleanup and reopening get fresh data`, () => {
    const f = fixture(); f.add(); const a = f.mount(file), b = f.mount(file);
    assert.equal(f.subscriptions.length, 1); assert.equal(a.api.habits.length, 1); assert.equal(b.api.habits.length, 1);
    a.unmount(); assert.equal(f.subscriptions[0].active, true);
    f.docs.get('users/u/habits/one').name = 'Remote'; f.notify('users/u/habits/one'); b.flush();
    assert.equal(b.api.habits[0].name, 'Remote');
    b.unmount(); assert.equal(f.subscriptions[0].active, false);
    f.docs.delete('users/u/habits/one'); const reopened = f.mount(file);
    assert.equal(f.subscriptions.length, 2); assert.equal(reopened.api.habits.length, 0); reopened.unmount();
  });
  test(`${platform}: failed listener retry restarts once and recovers both consumers`, () => {
    const f = fixture(); f.add(); const a = f.mount(file), b = f.mount(file);
    f.subscriptions[0].error(); a.flush(); b.flush(); assert.ok(a.api.error); assert.ok(b.api.error);
    a.api.retry(); a.flush(); b.flush();
    assert.equal(f.subscriptions.length, 2); assert.equal(f.subscriptions[0].active, false);
    assert.equal(a.api.error, ''); assert.equal(b.api.error, '');
    // Even a badly behaved stopped SDK callback cannot replace fresh values.
    f.subscriptions[0].next({ docs: [] }); a.flush(); b.flush(); assert.equal(b.api.habits.length, 1);
    a.unmount(); b.unmount();
  });
  test(`${platform}: account switch isolates habits and detaches the old stream`, () => {
    const f = fixture(); f.add('old'); f.add('new', 'other'); const host = f.mount(file);
    host.uid = 'other'; host.flush(); assert.equal(host.api.habits[0].id, 'new');
    assert.equal(f.subscriptions[0].active, false); host.uid = undefined; host.flush(); assert.equal(host.api.habits.length, 0); host.unmount();
  });
  test(`${platform}: zero minus/same note skip writes, but fresh server state and rapid taps are respected`, async () => {
    const f = fixture(); f.add(); const host = f.mount(file);
    await host.api.updateDay('one', f.day, { type: 'increment', amount: -1 }); host.flush();
    await host.api.updateDay('one', f.day, { type: 'note', note: '' }); host.flush();
    assert.equal(f.reads, 2); assert.equal(f.writes, 0);
    // UI still sees zero: the transaction must not skip an action based on it.
    f.docs.get('users/u/habits/one').entries[f.day] = { count: 2, checks: [], note: '' };
    await host.api.updateDay('one', f.day, { type: 'increment', amount: -1 }); host.flush();
    assert.equal(f.writes, 1); assert.equal(f.docs.get('users/u/habits/one').entries[f.day].count, 1);
    await Promise.all([host.api.updateDay('one', f.day, { type: 'increment', amount: 1 }), host.api.updateDay('one', f.day, { type: 'increment', amount: 1 })]); host.flush();
    assert.equal(f.docs.get('users/u/habits/one').entries[f.day].count, 3); assert.equal(f.writes, 3);
    assert.ok(f.docs.get('users/u/habits/one').completedDates.includes(f.day)); host.unmount();
  });
  test(`${platform}: offline transaction rolls back optimistic preview and later retries work`, async () => {
    const f = fixture(); f.add(); const host = f.mount(file); f.transactionFailure = true;
    await assert.rejects(host.api.updateDay('one', f.day, { type: 'increment', amount: 1 }), /offline/); host.flush();
    assert.equal(f.domain.habitEntry(host.api.habits[0], f.day).count, 0);
    f.transactionFailure = false; await host.api.updateDay('one', f.day, { type: 'increment', amount: 1 }); host.flush();
    assert.equal(f.domain.habitEntry(host.api.habits[0], f.day).count, 1); host.unmount();
  });
}

test('Windows pinned listener targets one document, deletion clears it, and dashboard keeps the collection', () => {
  const f = fixture(); f.add('one'); f.add('two');
  const pin = f.mount('desktop-widget/src/lib/habits.ts', 'u', 'one');
  assert.equal(f.subscriptions[0].ref.path, 'users/u/habits/one'); assert.equal(pin.api.habits.length, 1);
  const all = f.mount('desktop-widget/src/lib/habits.ts'); assert.equal(all.api.habits.length, 2);
  f.docs.delete('users/u/habits/one'); f.notify('users/u/habits/one'); pin.flush(); all.flush();
  assert.equal(pin.api.habits.length, 0); assert.equal(all.api.habits.length, 1); pin.unmount(); all.unmount();
});

test('quit habit completion consistency is retained even if count stays zero', () => {
  const f = fixture(); const habit = f.add('quit', 'u', { type: 'quit' });
  const result = f.domain.applyHabitAction(habit, f.day, { type: 'increment', amount: -1 });
  assert.equal(f.domain.habitDayNeedsUpdate(habit, f.day, result), true);
  habit.completedDates = [f.day]; assert.equal(f.domain.habitDayNeedsUpdate(habit, f.day, result), false);
});

for (const cacheFailure of [false, true]) {
  test(`Android actual widget handler renders committed habit without extra getDoc (cache failure=${cacheFailure})`, async () => {
    const f = fixture(); f.add(); f.storage.set('ssc-buddy:habit-widget:1', JSON.stringify({ uid: 'u', habitId: 'one', style: 'compact' }));
    f.cacheFailure = cacheFailure;
    const rendered = await f.widgetHandler()('HABIT_PLUS');
    assert.equal(f.reads, 1); assert.equal(f.writes, 1); assert.equal(f.directReads, 0);
    assert.equal(rendered.habit.entries[f.day].count, 1); assert.equal(rendered.error, '');
  });
}

test('Android widget failed mutation retains error and cloud-fetch fallback', async () => {
  const f = fixture(); f.add(); f.storage.set('ssc-buddy:habit-widget:1', JSON.stringify({ uid: 'u', habitId: 'one' }));
  f.transactionFailure = true; const rendered = await f.widgetHandler()('HABIT_PLUS');
  assert.equal(f.writes, 0); assert.equal(f.directReads, 1); assert.match(rendered.error, /Could not save/);
});

test('Android widget zero minus still reads transactionally but skips its write and extra fetch', async () => {
  const f = fixture(); f.add(); f.storage.set('ssc-buddy:habit-widget:1', JSON.stringify({ uid: 'u', habitId: 'one' }));
  const rendered = await f.widgetHandler()('HABIT_MINUS');
  assert.equal(f.reads, 1); assert.equal(f.writes, 0); assert.equal(f.directReads, 0);
  assert.equal(f.domain.habitEntry(rendered.habit, f.day).count, 0);
});

test('Android widget rebound during an action fetches its new habit instead of using the old committed result', async () => {
  const f = fixture(); const previous = f.add('one'); f.add('two');
  f.storage.set('ssc-buddy:habit-widget:1', JSON.stringify({ uid: 'u', habitId: 'two' }));
  const rendered = await f.widgetStore().habitWidgetView(1, 'u', '', false, undefined, previous);
  assert.equal(f.directReads, 1); assert.equal(rendered.habit.id, 'two');
});
