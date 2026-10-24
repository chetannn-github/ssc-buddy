# Practice session database audit

Date: 2026-10-24. Branch: `codex/practice-session-db-audit`, based on main `eb96ec5` in a separate managed worktree. Tasks/Habits fixes are isolated on `codex/tasks-habits-db-audit`; Focus changes are isolated on `codex/focus-db-load`.

The findings below describe the baseline audit; implementation progress is recorded at the end. Scope includes app/web practice setup, question bank, answering, submission, results/history, Quick Recall, and Android/Windows Recall widgets. Profile writes directly triggered by practice are included; a general profile audit remains separate. No production data or schema has been modified.

## Priority 1: Android Recall widget countdown repeatedly fetches the seed

`mobile-tasks/index.js` -> `refreshRecallCountdown` -> `getUnlockQuiz` in `mobile-tasks/src/domain/unlock-quiz.ts` -> `loadQuickRecallSeed` in `mobile-tasks/src/lib/firebase.ts`.

- During the ten-second wrong-answer correction lock, each intermediate one-second tick calls `getUnlockQuiz`.
- For an existing quiz, that helper fetches all practiceSubjects, all practiceAttempts, all practiceFavourites, and the questionLearning/current document before pruning deleted questions.
- The last countdown tick releases the correction lock locally; the intermediate ticks perform the repeated fetches.
- A deterministic diagnostic executing these actual functions with an instantaneous mocked network produced **27 collection-query calls + 9 learning-document reads** during ten seconds, with ten renders. Real network latency/Android scheduling may reduce tick count; this is not a production billing measurement. A collection-query call can return many documents.
- Separately, the Recall widget handler calls `getUnlockQuiz` at entry and again in its default refresh branch. A normal update can therefore load the same seed twice.

Proposed first fix: render countdown ticks from the already loaded local quiz and deadline; load/prune cloud-backed data once at an appropriate event boundary, retaining deletion checks before answer/next actions. Remove the default branch's duplicate seed load. Preserve correction lock duration, manual Next, current question, restoration and offline behavior.

## Priority 2: web startup performs repeated full collection reads

`src/routes/__root.tsx` starts `startPracticeSync(user, { includeSubjects: true })` on authentication even on Tasks/Profile routes. `src/lib/practice-sync.ts` then:

1. Reads subjects, attempts and favourites collections for migration checks. These happen even when the corresponding local arrays are empty.
2. Reads the practiceSettings collection to check initialization.
3. Fetches subjects, attempts, favourites and settings again for hydration.
4. Registers four live listeners for subjects, attempts, favourites and settings/current.

The diagnostic executing the actual `startPracticeSync` with existing remote documents and empty local arrays confirms **8 collection-query calls + 4 listener registrations**, with zero writes in that scenario. It counts calls, not billed reads, and does not invoke SDK initial snapshot delivery.

Comments claiming that practice has no live listeners and that the bank is only hydrated on a Practice route are outdated. The actual root call enables global bank hydration and the live listeners are present. The exported `hydratePracticeSubjects` helper has no current call site outside its declaration; it should not be counted as another active route fetch.

Proposed change: skip migration checks for empty local collections; use bounded existence checks otherwise; read settings/current directly and reuse that result; then consolidate initial hydration with the live source while keeping error/offline readiness behavior. Lazy-loading the bank is a separate decision because shared Quick Recall and other consumers require it. Do not silently remove live updates.

## Priority 3: Android Practice remount repeats migration and subscriptions

- `mobile-tasks/src/screens/PracticeScreen.tsx` restores local data then runs three collection migration queries, a settings document read, and subscribes to three collections plus settings/current.
- `migratePracticeEntities` in `mobile-tasks/src/lib/firebase.ts` reads the full collection before checking whether local entities exist.
- PracticeScreen is mounted conditionally by the app tab, so leaving/re-entering can repeat this initialization.
- Root App also subscribes to practiceAttempts for profile activity. The Practice screen and other screens can have separate consumers for the same query.
- The Practice effect checks `stopped` after migrations, but not again after awaiting the settings read. An unmount in that settings-read window can register listeners after cleanup has already run. This is a source-level lifecycle gap, not a reproduced on-device leak.

Proposed change: bounded/skipped migration checks, shared account-scoped sources, and cancellation checks around every asynchronous initialization boundary. Preserve local migration, fresh data on return, notification/widget consumers, account switching and retry behavior. Identical SDK queries may already share backend work, so duplicate React consumers do not establish doubled billing.

## Priority 4: Quick Recall setup refetches data already being observed

- Web `src/routes/quick-recall.tsx` starts `loadQuickRecallSeed` plus `watchQuickRecallSeed`. The seed reads three collections and a learning document; the watcher subscribes to those same four sources. Global practice sync already observes three of them.
- Windows `desktop-widget/src/main.tsx` loads the seed in `openQuickRecall` and in the effect triggered by `quickRecallOpen`. Opening from closed can invoke both. A separate question-bank listener remains for deletion updates.
- Android QuickRecallScreen loads a seed on mount; starting a run via `startUnlockQuiz` loads another seed. A bank listener also remains active.

Proposed change: a single account-scoped seed/readiness source per runtime; refresh explicitly when required, retaining live deletion updates and the rule that a cloud update must not swap an in-progress question sprint unexpectedly. No cross-device or cross-window cache assumptions.

## Priority 5: one Recall answer writes learning and daily history; some learning writes overlap

- Web/Windows answers use a transaction to update the learning document, then another transaction for the daily Quick Recall attempt. These are two distinct necessary data products, not automatically a bug.
- Android QuickRecallScreen writes learning immediately; root App's five-second `syncLearning` observes the local quiz and can submit the same updated learning stats again. `writeQuestionLearning` merges counters but unconditionally sets the document with updatedAt, even if the merged semantic data is unchanged.
- The five-second interval does **not** inherently write every five seconds: its fingerprint suppresses unchanged local payloads. There can still be overlap with the direct answer writer or an initial write of already synchronized data.
- Quick Recall's history transaction already checks recorded run IDs and skips duplicate recorded answers. Keep this idempotency.

Proposed change: compare the merged latest server values before writing; centralize/serialize overlapping publications and acknowledge success only after commit. Keep concurrent-device counter merging, run IDs, retries and per-answer durability; do not simply defer every answer until run end.

## Priority 6: full-history queries and large document payloads

- History time/subject filters in web and app operate locally over the full loaded attempt history. Selecting Today does not limit the Firestore query to today's attempts.
- Question banks store an entire subject with nested chapters/exercises/questions in one document. An edit/deletion runs a transaction for that subject and writes its merged document.
- Saved normal attempts preserve immutable question/answer-key snapshots for reattempts and View solution. Public profile publishing strips much of that question content but can still be retriggered by practice history updates.
- Daily Quick Recall documents append answers, question IDs, run IDs, keys and retained question snapshots throughout the day.

Distinguish document counts from bytes: one large subject/attempt is still one document read/write, while its size increases transfer, serialization and storage. This audit did not measure actual document sizes or demonstrate an exceeded limit.

Proposed later work: measure payload sizes locally, separate lightweight history summaries from detailed paper fetches if justified, and consider bounded/lazy historical reads with explicit loading. Do not truncate or delete history, remove saved question snapshots, or change the schema as an initial optimization; reattempt, history filters, recall selection and public statistics depend on them.

## What is already efficient / is not continuous Firestore traffic

- Normal practice's per-second countdown and answer/navigation checkpoints persist to localStorage or AsyncStorage (`src/lib/active-test.ts`, `mobile-tasks/src/lib/active-test.ts`). They do not save an attempt to Firestore every second or on every normal answer.
- Normal submission persists its history record; collection synchronization diffs IDs/content and writes changed documents, not all historical attempts every time.
- Marking settings have change checks on normal edit paths; selecting a question or a history filter is local UI work.
- Delete/favourite operations target the relevant canonical document or changed subject. Existing subject deletion tombstones/transaction merging protect removed questions from resurrection and must remain.
- Countdown-only rendering in app/web Recall is local; the repeated seed-fetch problem identified above is specifically in the Android home-screen widget's helper call path.
- A two-second legacy local-backup sync helper exists in firebase-sync.ts, but no active call site was found under src. Do not attribute its interval to production practice traffic merely because the function is defined.
- Existing cleanup functions are present for ordinary practice listeners. The asynchronous Android initialization gap is a specific separate concern.

## Validation and implementation order

The original two baseline diagnostics passed before implementation. `scripts/audit-practice-db-load.mjs` now checks the corresponding optimized paths, retaining the measured baseline numbers for comparison. It uses actual function/module bodies and mocked dependencies, with no network or account calls.

Recommended sequence:

1. Android widget correction countdown and duplicate event seed load. Test ten-second lock, wrong/correct answers, Next, deletion during countdown, offline restore and zero per-tick seed calls.
2. Bounded practice migrations and settings read reuse on app/web; test empty/local/remote data and account switching.
3. Android initialization cancellation and shared practice sources without removing live sync.
4. Consolidated seed loading and semantic learning-write deduplication; test concurrent devices, retries and duplicate event IDs.
5. Only after measurement, evaluate large-bank/history loading or schema changes separately.

These diagnostics do not identify how much of a historical Firebase console total came from practice, and do not predict exact quota savings. Initial snapshots, reconnects, SDK caches and actual collection document counts require runtime observation.

## Implemented and verified

- Android Recall countdown reads local quiz state, preserving the ten-second correction lock and manual Next. It performs no per-tick seed fetches. Stale countdowns stop if the run/question changes. Answer/Next event initialization still refreshes/prunes deleted questions before interaction. Normal refresh loads the seed once, new-run actions only load their own seed, and deleted widgets do not initialize a quiz.
- The countdown diagnostic changed from 27 collection-query calls plus 9 learning reads to zero of either during the countdown, with ten renders retained. An event's initial freshness fetch and actual answer writes are separate.
- Web/Android migration checks skip empty local arrays; non-empty migration checks use `limit(1)`. First migration still uploads every local entity if the remote collection is empty. The web reads settings/current once and reuses it for hydration; its four live sources remain. In the measured empty-local/existing-remote startup, explicit collection-query calls decreased from 8 to 3 plus one settings-document read, before listener initialization.
- Android Practice initialization checks cancellation after the settings read and after an initialization settings write, preventing post-unmount listener attachment in those asynchronous windows.
- `practice-live-source.ts` shares active collection snapshots by Firestore instance/account/collection. Web global practice and Recall reuse subjects/attempts/favourites subscriptions; Android root/Practice/Recall consumers reuse identical collection queries. Each consumer retains its original normalization/deletion merging. Last unsubscribe discards the snapshot and stops the underlying stream. Error/remount recovery and generation guards reject stopped-source callbacks. The generic helper is identical to the one on the separate Tasks/Habits branch; no unrelated Tasks/Habits functionality is imported.
- Concurrent seed fetches are deduplicated within each web/app/Windows runtime by account. Only in-flight work is shared; settled values and failures are not cached. A later open/refresh therefore fetches fresh data. Sequential freshness reads remain intentionally; this does not make every setup load a zero-read operation.
- Web/Android learning writers still read/merge the latest transaction data, preserving max counters and newer timestamps/outcomes. They skip `set` only if the merged semantic payload is unchanged. Failure is not cached as success, and changed stats/subject fields still write. The per-answer Recall history transaction and its run-ID deduplication remain unchanged.
- Web/Android public-profile activity publication compares its merge payload with the current server document in a transaction. Unchanged data skips the write and leaves updatedAt unchanged; changed activity, name and settings still publish. Unrelated Focus fields are preserved. There is no persistent successful-payload cache, so another client's change is checked on the next publication. Publications for the same account/username are ordered, with adjacent identical pending payloads coalesced; rapid A → B → A updates retain their order. A failed transaction falls back to the original merge setDoc path, retaining SDK offline write delivery; failed delivery is not remembered as success.
- Public-profile comparison still costs a transaction read on each separate publication. This optimization targets redundant writes and does not promise lower reads. Concurrent identical pending publications share the check. Tests cover merge semantics, account isolation, external changes, failures/retries and ordering.
- History queries, immutable attempt snapshots, scoring/marking rules, reattempt behavior and the database schema remain unchanged. Full hydration followed by listeners is retained; no blanket claim is made that every initial read was eliminated. Large bank/history restructuring remains separate work.

Verification completed:

- 105 Node tests across the new DB/cancellation/widget/public-profile checks and existing question deletion, Recall selection, immutable snapshots, exercise selection, active-session recovery, profile settings, weekly results and XP timeline suites.
- Two browser regression scripts: web/native pre-submit flow at 390/1280px, and history/results/question viewer/solutions at 390/1024/1920px.
- Web, Android and Windows TypeScript checks; web production build; Windows frontend build; Android Metro export.
- No production Firestore load test or physical-device APK test. The tests mock SDK/native boundaries; their counters describe application calls, not billed reads.

Commands: `node --test scripts/test-practice-db-load.mjs scripts/test-recall-widget-db-load.mjs scripts/test-question-deletion.mjs scripts/test-quick-recall.mjs scripts/test-active-test-session.mjs scripts/test-practice-exercises.mjs scripts/test-profile-settings.mjs scripts/test-weekly-results.mjs scripts/test-xp-timeline.mjs`, `node scripts/audit-practice-db-load.mjs`, `node scripts/test-practice-submit-summary.mjs`, `node scripts/test-practice-history-ui.mjs`.
