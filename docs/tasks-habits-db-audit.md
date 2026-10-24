# Tasks and Habits database audit

Date: 2026-10-24. Branch: `codex/tasks-habits-db-audit`, created from main `eb96ec5`.

Scope: web, Android app/home-screen widgets, Windows task/mini-task/habit widgets. This is a source-code audit, not a measurement of production traffic. Syllabus, practice and profile-specific audits are deferred; downstream writes caused by tasks are included here. The findings below describe the baseline. Implementation progress is recorded separately at the end.

## Confirmed call paths

### 1. Android home-screen task widget: unnecessary leaderboard rebuilds (highest priority)

- `mobile-tasks/index.js`, DailyTasksWidget handler: after rendering, calls `publishLeaderboardAfterWidgetTask` unconditionally for every non-deletion widget event. Date/filter clicks and scheduled refreshes therefore reach the cloud even though the task data did not change.
- Successful `TOGGLE_TASK` also awaits that same publisher inside the toggle branch, then reaches the unconditional publisher again. There are two publisher invocations for that path.
- `mobile-tasks/src/lib/firebase.ts`, `publishLeaderboardAfterWidgetTask`: each invocation requests the profile document and the entire tasks collection, then writes the weekly leaderboard entry if the profile has a username.
- `mobile-tasks/app.json`: scheduled widget update interval is 1,800,000 ms (30 minutes). Actual Android delivery frequency is OS-dependent, and user/widget events add further calls.
- App-driven widget refresh uses `requestWidgetUpdate` in `daily-task-widget-store.ts`; this must be distinguished from the background event handler when measuring traffic.

Proposed change: local-only rendering for date/filter/resize/ordinary refresh; publish once on a successful task mutation and once when the calendar day changes, with account/week/day-aware persisted success state. Preserve overdue penalties after midnight, retries after failure, and offline behavior. Do not simply remove the midnight synchronization.

### 2. Windows task edits: full history read after every mutation (high priority)

- `desktop-widget/src/lib/firebase.ts`, `saveTask` and `removeTask`: write/delete the individual task, then call `publishLeaderboardAfterTaskChange`.
- That publisher requests the profile document and `getDocs(tasksFor(user))` over the entire task history before writing the weekly leaderboard entry.
- `desktop-widget/src/main.tsx` already maintains the entire tasks collection through `watchTasks`. Main and pinned mini-task windows use this App component.
- This is not a rewrite of all tasks, but it is an explicit all-task read per task action.

Proposed change: reuse a confirmed account-scoped task/profile snapshot for score calculation and consolidate score publications. Preserve concurrent edits from other devices; an arbitrary stale UI array is not a safe replacement for the current server read. Test this before replacing the read.

### 3. Task startup reads (web and Android)

- Web `src/routes/__root.tsx`: `migrateTasksIfEmpty` -> `readTasks` -> `watchTasks`.
- `src/lib/task-sync.ts`: migration and hydration both use unrestricted collection `getDocs`; the listener also targets the entire collection.
- Android `mobile-tasks/App.tsx`: `migrateTasksIfEmpty` -> `watchTasks`, likewise unrestricted.
- Both migration functions read the collection even when the local tasks array is empty. The migration only needs to know whether remote data exists.
- `readTasks` has an outdated comment claiming the website has no live listener; the root actually starts one.

Proposed change: avoid the migration query when there is nothing to migrate; otherwise check existence with a bounded query. Use one initial task hydration/listener path instead of a separate full fetch followed by the same collection listener. Retain migration correctness and account isolation. Do not initially limit task history: XP, past-day task views and overdue calculations currently depend on it.

### 4. Task changes also publish derived documents (app and web)

- Android `persist` in `mobile-tasks/App.tsx`: writes changed task documents and publishes the weekly leaderboard. A separate effect depends on `tasks` and publishes the public profile dashboard/activity without a content-equality guard. Local optimistic updates and subsequent remote snapshots can each run this effect.
- Web `TasksWorkspace.persist`: writes changed task documents and publishes the weekly leaderboard. Its local task event also causes AppShell's activity refresh, which creates new records/tracker activity arrays; the public dashboard publishing effect can consequently run again.
- The weekly publishers and `savePublicProfileActivity` functions write `updatedAt: serverTimestamp()` on every call, even when the derived payload is unchanged.
- Receiving a remote snapshot does NOT call `syncTaskChanges` again in the inspected task listener paths. There is no demonstrated infinite task-write feedback loop here.

Proposed change: compare semantic payloads excluding timestamps, serialize/coalesce derived publications, record success only after the write succeeds, scope to account and leaderboard week, and retain retries. Task save/complete/delete must remain immediate. Do not globally disable profile synchronization to save task-related traffic.

### 5. Windows pinned habit widgets subscribe to all habits (high priority)

- `desktop-widget/src/components/PinnedHabitWindow.tsx` calls collection-based `useHabits(uid)` then finds `pin.habitId` locally.
- `desktop-widget/src/lib/habits.ts` subscribes to the entire `users/{uid}/habits` collection.
- Each pinned window needs only one habit, but its requested query covers all habits, including changes unrelated to that pin.
- Windows uses `persistentLocalCache` with `persistentMultipleTabManager`; shared cache/SDK target reuse may reduce actual server requests. Do not equate number of windows with guaranteed multiplied billable reads without runtime measurement.

Proposed change: pinned habit windows watch their specific habit document; the main habit dashboard retains its collection subscription. Preserve normalization, optimistic transactions, deletion behavior and widget authentication.

### 6. Duplicate habit hook consumers and inactive feature subscriptions

- Web: AppShell uses `useHabits` for reminders; TasksWorkspace separately calls it, including while showing Tasks.
- Android: root `useHabitReminders` internally calls `useHabits`; HabitsScreen creates another hook instance when mounted. The root subscription still exists if reminders are disabled because the enabled flag is applied after calling the hook.
- Windows App starts a habits collection subscription regardless of whether Tasks/Habits is selected; pinned recall also renders this App component.
- Cleanup is present when these hooks unmount; this audit did not find a missing unsubscribe in `useHabits`.
- Identical queries within one Firestore instance can share underlying work. Duplicate hooks are confirmed; doubled billing from them is not established.

Proposed change: one account-scoped habit source per client runtime, reused by UI/reminders/widget cache. Gate subscriptions for windows that cannot display/use habits. Keep reminder and Android widget data available where required; disabling a feature must not delete its data.

### 7. Habit actions: one transaction per tap

- All three `useHabits` implementations queue `updateDay` actions and run a transaction containing one habit read and update for each action. Rapid + taps and checklist taps are serialized, not coalesced.
- A transaction may retry on contention. Updating a count/checklist also notifies active listeners.
- `markToday` uses a single direct update, but current day-entry actions use the transactional path. Do not count both as if every UI action called both.
- Unchanged or clamped count actions are not skipped before the transaction update.

Proposed change: first skip semantically unchanged mutations safely inside the transaction. Later consider batching rapid count deltas only, with careful failure/concurrency tests. Do not replace all transactions with blind updates: completion, count limits and checklist consistency depend on current data.

### 8. Android habit widget reads after actions

- `actOnHabitWidget` reads and updates the habit transactionally, then updates local widget cache.
- The background handler subsequently calls `habitWidgetView(..., true)`, which explicitly reads the same habit document again. It also does this on other non-deletion habit-widget events.
- `cacheWidgetHabits` refreshes widget renderers with `fetchCloud=false`; those cache renders themselves do not read Firestore.

Proposed change: render successful mutations from the committed result/cache, and reserve cloud fetches for events requiring freshness. Preserve offline fallback and remote deletion handling.

## What is already efficient / not a DB timer

- Web/Android task sync diffs task IDs and content, writing only changed documents, not every task on each action.
- The 30-second date checks in habit hooks and Windows App calculate dates locally. They do not issue database calls.
- Heatmap calculations, animated numbers, glow and drag animations do not themselves read/write Firestore.
- Habit updates write one habit document; the history map increasing in size affects payload/storage, not one write per historical day.
- Routine local Android widget rendering/cache persistence is not a Firestore write.

## Verification before implementation

1. Add isolated mocked Firestore call-count checks for widget event paths: date/filter/resize -> no cloud publication; successful mutation -> one; failed/invalid mutation -> none; midnight -> one successful refresh with retry on failure.
2. Test task startup with empty local/remote, existing remote, local migration, account switch and unmount during hydration.
3. Verify create/edit/complete/reopen/delete/carry task, overdue penalties at midnight and week rollover, weekly score, XP and public profile freshness.
4. Verify pinned habit target scope, deleted habit, checklist/count/toggle, rapid taps, two-device contention, offline/reconnect and auth switch.
5. Instrument request attempts locally without writing telemetry back to Firestore. Separate application call counts from actual billed server reads and SDK cache events.

No quota-saving percentage or exact production read total can be inferred from source inspection alone. Firestore listeners charge for relevant returned/changed documents and reconnect behavior; they do not read the entire collection on every animation frame or every local render. See https://firebase.google.com/docs/firestore/pricing#listening_to_query_results.

Recommended first fix: Android task widget's unconditional/duplicate leaderboard rebuilds, then Windows task mutation reads and task startup duplication, then habit query scope and semantic write deduplication. Keep each change reviewable and test it independently.

## First fix implemented: Android task widget publication policy

- `mobile-tasks/index.js` now publishes once after a successful task toggle. Date/filter/resize/deletion events do not publish.
- `WIDGET_ADDED`/`WIDGET_UPDATE` check the local calendar marker; the first lifecycle refresh for an account/day publishes, subsequent same-day refreshes skip. The next calendar day (including a new leaderboard week) publishes again. This runs when Android delivers an event, not at an exact midnight alarm.
- `mobile-tasks/src/domain/daily-widget-score-sync.ts` serializes calls across widget instances within the JS runtime and stores account-scoped day/pending markers in AsyncStorage, not Firestore. A successful mutation also satisfies that day's refresh.
- Failed cloud publications remain pending and retry on the next lifecycle refresh, including after process restart. Local storage write failure does not prevent attempting a committed task's cloud publication; if storage remains unavailable, a marker cannot survive process death.
- Publication is awaited before the background handler returns. Account identity is checked before publishing and before acknowledging success locally.
- Changes to tasks, score calculation, XP, leaderboard payload, and the existing Firestore publisher are deliberately unchanged. Web, Windows and Habits findings are not fixed by this first step.
- `node --test scripts/test-daily-widget-db-load.mjs`: 10 tests exercise the actual registered entry-point handler with mocked native/Firebase dependencies plus the real coordination policy. Cases cover local interactions, successful/rejected task mutations, multiple widgets, process restart, account switch, midnight/week rollover, failed publication, corrupt markers, and storage failure. These measure publisher invocations, not production billed reads.

## Second fix implemented: Windows mutation reads and bounded migration

- `desktop-widget/src/lib/firebase.ts`: the existing tasks listener keeps its latest query snapshot in an account-scoped, runtime-only map. After a committed task save/delete, the score publisher reuses this snapshot only when it is server-backed, has no pending writes, and reflects the specific committed task change.
- If the listener is absent, stopped, failed, cache-only, pending, has not delivered the write acknowledgement, or contains a superseding edit, the publisher falls back to its original full-query read. This deliberately favors correctness over eliminating every read.
- The profile read remains unchanged so a stale name/username/avatar cache is not introduced. Task CRUD writes and leaderboard payload/calculations are unchanged. The raw query document order is preserved for per-task time bonuses; the UI's separately sorted task array is not used to compute them.
- Web and Android `migrateTasksIfEmpty`: an empty local list returns without a read; otherwise the remote-existence check uses `query(..., limit(1))`. Existing remote data is not overwritten; an empty remote collection still receives all local tasks in the existing batch.
- The web's subsequent full hydration and live task listener are intentionally retained in this step. No claim is made that all startup duplication has been removed.
- `node --test scripts/test-task-db-load.mjs`: 14 tests execute the actual Windows Firebase module with mocked SDK operations and the actual web/Android migration functions. They cover CRUD publication, complete payload parity between cache-reuse and fallback, query order versus UI order, all conservative fallback cases, another task's concurrent update, account/listener isolation, empty local migration, existing remote data, and initial local migration.
- Combined with the first fix, 24 call-path tests pass. They assert application-level reads/publications, not actual Firestore billing or timing on a Windows device.

## Third fix implemented: Habits

- Windows pinned habit windows pass their habit ID to `useHabits`. The hook subscribes to that single document; the main dashboard continues to subscribe to the collection. A deleted pinned document produces an empty habit state as before.
- `mobile-tasks/src/domain/shared-live-source.ts` shares active subscriptions per Firestore instance and account/query key within a JS runtime. All three platform habit hooks use it. Reminders and the app/web habit UI retain their separate optimistic state but consume one live collection source. Last unsubscribe stops the stream and discards the cached value. Error retries restart the stream for all remaining consumers; old callbacks cannot replace a restarted source's data. This is not a persistent offline cache or cross-window synchronization layer.
- The hook transaction paths on app/web/Windows compare the latest server-read entry and completion flag before calling `transaction.update`. Unchanged counts/notes skip the write. The transaction read remains intentional: skipping based on a stale UI count could lose a valid concurrent decrement. Existing increment/checklist transaction queues and Firestore conflict/retry behavior remain in place; rapid taps are not combined or delayed.
- `habitDayNeedsUpdate` also checks completion membership, preserving quit-habit completion consistency even when its count is unchanged.
- Android habit widget actions return the transaction's committed habit. The event handler renders it without a second `getDoc`; cache persistence is best effort after commit. Failed/unknown actions retain the existing cloud-fetch fallback. If the widget has been rebound to a different habit during the action, it fetches the new binding instead of rendering the previous habit.
- Routine widget refresh still fetches for freshness. No reminder interval, notification scheduling, habit schema, streak/heatmap calculation, or daily editing restriction was changed.
- `scripts/test-habit-db-load.mjs` has 22 tests exercising the actual three hook implementations, shared source and Android handler/store with mocked SDK/native dependencies: sharing/refcounts, cleanup, error recovery, stale callbacks, auth switch, rapid taps, server state differing from the UI, no-op writes, offline rollback, pinned document deletion, quit completion, committed-result rendering, cache failure and widget rebinding.
- Existing optimistic habit tests load the new source helper. The Windows SSR test loader now supports explicit `.ts` imports and CSS, stubs the database boundary, and checks the current panel's rank/read-only markup; no task panel UI was changed.
- Production DB billing and physical-device network timing are not measured by these tests. Identical pre-existing SDK queries might already have shared server work; reduced hook subscriptions should not be reported as guaranteed doubled-read savings.
