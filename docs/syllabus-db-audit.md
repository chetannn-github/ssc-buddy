# Syllabus Tracker database audit

Date: 2026-10-24. Branch: `codex/syllabus-db-audit`, created directly from main `eb96ec5`. This branch does not contain the Focus, Tasks/Habits or Practice optimizations. The findings describe the baseline; authorized implementation and verification are recorded below. No production writes, schema changes, or deployment were performed.

## Scope and architecture

Checked web Tracker provider, root hydration, syllabus/revision/targets/import/reorder controls, Android Track/Profile/Mock Analysis consumers, Windows streak consumer, and downstream public-profile publication.

Canonical data is `users/{uid}/tracker/{section}`. The six sections are `meta`, `subjects`, `revision`, `tests`, `activity`, and `pinned`, each with a `value`. All subjects/chapters share the subjects document; revision data and activity history similarly share their section documents. Tests stores targets and the full log together.

## Priority 1: redundant startup and remount reads

Web `src/routes/__root.tsx` explicitly calls migration, then hydration, then subscribes. `src/lib/tracker-sync.ts` migration fetches the entire collection merely to test existence; `readTrackerSections` reads the same collection again. This runs at authenticated root initialization, including when opening a different feature, not on every Tracker tab click. Its comments saying no live subscription is kept are incorrect: root uses `watchTrackerSections`, which calls `onSnapshot`.

Android `TrackScreen.tsx` waits for local storage, then invokes `migrateTrackerSections` before opening its collection listener. Migration always fetches the full collection, even with default/empty local data. TrackScreen mounts conditionally, so leaving and returning to Track repeats this initialization. The app root already has a tracker subscription.

Executing the actual sync helpers against a mocked six-document collection confirms:

| Path | Explicit getDocs calls | Fixture documents returned | Listener initial delivery modeled separately |
| --- | ---: | ---: | ---: |
| Web root migration + read + watch | 2 | 12 | 6 documents |
| Android Track migration + watch | 1 | 6 | 6 documents |

These counts exclude app root and other consumers. They are application calls and fixture deliveries, not billed reads; SDK caching and query sharing are not simulated. Both clients also initialize all six documents when remote collection is empty, even with default local data. That is first-use initialization, not a continuous write loop.

Recommended first optimization: use bounded existence checks and consolidate readiness/hydration with a current account-scoped source, preserving migration of local records, legitimate initial defaults, offline startup, errors and account switching. Do not blindly skip a migration just because subjects are empty: activity, tests, targets or metadata may still contain meaningful data.

## Priority 2: overlapping and overly broad Android subscriptions

- `mobile-tasks/App.tsx` watches the complete tracker collection for public dashboard/activity and separately watches `tracker/tests` for mock records.
- Opening Track adds another complete-collection subscription after migration.
- Opening `ProgressScreen.tsx` adds a complete-collection subscription solely to derive subject names, plus a tests-document listener, while root remains mounted.
- Profile normally receives `sharedTracker` from root. Its heatmap fallback subscribes only if that shared data is absent; do not count the fallback as an always-active extra listener.

Recommended: reuse root/account-scoped tracker readiness for Track and Profile; derive tests from the same current snapshot where practical. Mock Analysis can reuse that source or subscribe to the subjects document when no shared source exists. Preserve initial-loading/error distinctions and cleanup after switching users. Duplicate JS listeners do not prove duplicated billed reads: identical SDK targets can share backend work. A document target alongside a collection target still needs explicit runtime/billing observation.

## Priority 3: tracker snapshots trigger public-profile publication

Web `AppShell.tsx` reacts to tracker activity changes and publishes public dashboard data. Android root updates `publicTracker` on each tracker snapshot, and its publication effect depends on that object. The baseline public publisher writes with updatedAt without semantic comparison. Root's initial tracker and practice snapshots can trigger separate publications; tracker pending/local and server snapshots can also cause downstream work. Actual effect executions depend on React batching and SDK deliveries.

Recommendation: coordinate with the existing Practice branch's ordered public-profile publisher instead of introducing a competing implementation. That branch compares current server merge values, skips unchanged writes, and retains offline fallback. It adds comparison reads, so evaluate the read/write tradeoff instead of claiming all DB operations decline. Do not use a persistent last-success payload cache that could hide another device's change.

## Priority 4: whole-section payloads and immediate input saves

Current web/app writers already diff section values. They do not save the whole tracker on every action. Verified with actual helper execution:

| Action | Canonical section writes | Explicit reads inside sync helper |
| --- | ---: | ---: |
| Unchanged data | 0 | 0 |
| Pin/unpin | 1: pinned | 0 |
| Actual chapter reorder | 1: subjects | 0 |
| Lecture increment plus activity | 2: subjects, activity | 0 |
| Revision increment plus activity | 2: revision, activity | 0 |

Subjects is an array, so a one-chapter progress edit sends the full subject array. A new activity similarly sends the retained activity array. This affects bytes and subscriber delivery work, not a separate write for every chapter.

Web `tracker/src/components/tracker/ui.tsx` Num control commits on each input change; mock-target controls update the provider from it. Multiple edits can therefore cause multiple legitimate section writes; React batching may combine some. Any coalescing must preserve final save on blur/unmount, offline retry, and cross-client changes. Do not defer progress durability for an arbitrary long interval.

Measure real payload sizes before proposing subject splitting, activity subcollections or lightweight summaries. Schema restructuring is a later, behavior-sensitive project, not the first fix.

## Existing efficient behavior to preserve

- Web TrackerProvider ignores semantic no-op updates and prevents remote hydration snapshots from echoing into canonical CRUD writes.
- Both sync helpers write only changed sections. Filters, opening a chapter/subject, switching Syllabus/Revision tabs and visual animations have no direct tracker DB write.
- Web chapter drag mutates data on drop, not dragover. Android ChapterReorderList calls onMove after a completed changed-position settlement, not each pointer frame. Its scroll/placeholder animation interval is UI work, not Firestore polling.
- Normalization/AsyncStorage/localStorage work is local. A mounted listener does not by itself imply a read every second.
- Tracker root and screen listeners have cleanup. Android Track checks cancellation after migration before subscribing; this audit did not find the Practice screen's asynchronous cancellation gap here.
- Windows main actively observes `tracker/activity` for streaks and does not write syllabus progress. Its `watchTrackerSubjects` export has no current call site in active app source; do not count it as an active subscription. No active syllabus-tracker DB path was found in the extension or Android widget source checked.

## Correctness boundaries for later implementation

The shared section writers use direct merge setDoc with full array values, not per-chapter conflict transactions. Concurrent clients can replace the same subjects/activity array from different snapshots. Do not introduce aggressive stale snapshot reuse, claim this architecture already merges concurrent edits, or silently change it during a read optimization. This is a source-level concurrency concern, not a reproduced production incident.

Web TrackerProvider advances lastSynced before its asynchronous sync settles, and Android save invokes sync without an application retry queue. Firestore accepted offline writes have SDK behavior; rejected writes and app lifecycle failures are a separate concern. Any new dedup marker must not mark a failed save as delivered. No retry behavior was changed in this audit.

## Verification and proposed sequence

`node scripts/audit-syllabus-db-load.mjs` passed baseline cases for both actual web and Android helper implementations: initialized startup, unchanged, pin, reorder, lecture, revision and empty-remote initialization (14 scenarios). This runs with mocked SDK boundaries and no network/account calls. It does not exercise native screen lifecycle, production caching, billing, or physical devices.

1. Migration/readiness deduplication and account-scoped source reuse; preserve live updates.
2. Remove overly broad/redundant Android consumers without losing profile/analysis readiness.
3. Reuse the Practice branch's public-profile optimization at integration, avoiding duplicate conflicting implementations.
4. Measure section payload sizes and input bursts before making further loading/schema changes.

## Implemented after audit

- Web root now calls initializeTrackerSections: one full read both checks existence and hydrates an existing tracker. The modeled six-document case changes from two explicit queries returning 12 documents to one query returning six, plus the same live listener. Empty remote initialization still writes the six sections and reads back after commit. Partial existing trackers are hydrated with defaults for missing fields, without overwriting existing remote data. Standalone migration uses limit(1).
- Android tracker collection observers share one active source per Firestore instance/account. Root, Track, Profile fallback and Mock Analysis keep their existing callbacks and normalization. Test observers reuse that active source rather than opening an overlapping document listener. A standalone test-only observer retains its original single-document target, avoiding an increase to a six-document initial query. If such an observer starts before the collection source, it retains its document listener until cleanup; this is intentionally not a claim that every possible subscription ordering is consolidated.
- Android migration skips the explicit query only when a live source currently holds a nonempty server-confirmed snapshot without pending writes. Otherwise it uses limit(1), reducing the modeled existing-remote fallback from six returned documents to one. Empty data still migrates normally; no persistent migration-success marker is introduced. When root is confirmed, reopening Track adds zero migration queries and shares the source's current data.
- includeMetadataChanges updates the internal confirmation state, while unchanged section payloads do not emit duplicate consumer callbacks. Test callbacks also compare normalized logs so an unrelated chapter/target change does not republish the same mock records.
- Last unsubscribe removes the source and confirmation. Failed sources invalidate confirmation and restart when another consumer subscribes. Late callbacks after cleanup or terminal failure cannot repopulate confirmation or deliver stale values. Account and Firestore-instance scopes are isolated. The generic shared-live-source helper is identical to the implementation on the Tasks/Habits and Practice branches, simplifying later integration.
- Canonical writes, progress/activity durability, first-use migration payloads, storage schema, live synchronization and offline SDK paths remain. No debounce, history truncation, or subject splitting was introduced. Public-profile deduplication remains on the Practice branch; it was not duplicated here. Windows and extension code remain unchanged because no redundant active syllabus write path was identified there.

Verification: the executable diagnostic now checks optimized paths while retaining baseline measurements in this report. Fourteen startup/action scenarios plus eleven regression tests cover partial/empty migration, retries, shared listeners/live progress and tests, cache/pending/empty fallback, metadata-only confirmation, account/runtime isolation, terminal-error recovery, stale callbacks, cleanup and standalone test-only scope. Combined with existing profile/settings/weekly-result suites, 27 Node tests pass. Web and Android TypeScript checks pass; web production build and Android Metro export pass. Browser regression scripts for chapter drag/reorder and Mock Analysis time filtering pass at 320/430px. No production billing comparison or physical-device testing was performed; application call savings are not exact billed-read estimates.

Changes remain local on this branch. No push requested or performed.
