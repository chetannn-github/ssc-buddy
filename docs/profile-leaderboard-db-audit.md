# Profile and leaderboard database audit

Date: 2026-10-24. Branch `codex/profile-leaderboard-db-audit`, created directly from main `eb96ec5`. Syllabus changes were committed/pushed separately as `f593bf4` on `codex/syllabus-db-audit` before this branch was created. No other optimization branch was merged here. Findings below describe the baseline; subsequent authorized implementation is recorded at the end. No production data was changed.

## Scope

Own Profile tab, public profiles, period-filtered practice/tracker/task/focus stats, heatmap/streak, XP/level, weekly podium/medals, leaderboard list and member detail, edit profile/settings/username/avatar/accent, app root publication, web root/AppShell hydration, and Windows leaderboard. Extension has no matching profile-tab/leaderboard surface; Focus integration remains a separate branch concern.

## 1. Highest priority: historical medal counts attach one whole-board listener per week

Web `src/lib/weekly-results.ts` and Android `mobile-tasks/src/hooks/use-weekly-results.ts` use `completedLeaderboardWeeks` from the earliest surviving task date through the last completed week, including intervening weeks without tasks. `useWeeklyMedalCounts` opens a live collection listener for every week, calculates the entire ranking, then extracts this user's award. This happens on Profile render, before the medal card is opened. Public profiles use it too.

Diagnostics executing both hooks confirm that 52 completed weeks register 52 `leaderboards/{week}/entries` collection listeners. With no historical task dates the hook still observes the previous week. `usePreviousWeeklyAward`, mounted for the celebration, independently observes that same previous-week target. Hiding/acknowledging the celebration does not by itself remove its hook. Android's enabled flag controls presentation after the hook is called.

This scales with history and each board's membership, not just the owner's one entry. 52 registered listeners does not mean 52 billed document reads: each collection can return many entries; identical targets may be shared by the SDK. Cleanup exists and was checked. Do not call this a demonstrated listener leak.

First improvement: share account/runtime/week sources among medals, celebration and visible boards. Then evaluate one-time reads on opening Profile for completed weeks, with explicit refresh/revisit freshness and retry; old boards can still receive corrections, so do not cache them forever or silently make them immutable. Preserve every intermediate week and valid medal, including weeks whose original tasks have since disappeared. A tiny per-user medal summary would be a later architecture/backend change, not an immediate client-only rewrite. Reading just the user's entry or limiting to three documents cannot reproduce ranking unless the query/data model explicitly supports corrected ordering.

## 2. Leaderboard XP produces one public-profile listener per member

Shared `shared/create-use-leaderboard-xp.ts` powers web, Android and Windows. For every valid username in the supplied entries, it subscribes to `publicProfiles/{username}` to derive current task/focus XP. When viewing a historical week it also observes the entire current-week leaderboard. The visible list already observes the selected week's whole collection.

Diagnostic example with 20 valid members:

- Current list: selected-week collection plus 20 public-profile document targets.
- Historical list: selected-week collection plus current-week collection plus 20 public-profile targets.
- Web weekly member detail still passes **all entries**, so even one displayed member causes the whole membership's XP-profile subscriptions. Android and Windows keep their whole-board XP hook mounted when switching into detail too.

Each public document includes dashboard history and focus fields, so unrelated activity updates can deliver that document even if the visible requirement is only XP/level. Member identity changes recreate the profile effect's subscription set; unchanged ordering is normalized by its membership signature.

First improvement: on the web member-detail route request current XP only for the selected member while retaining the board read required to determine rank. Share active current-board and public-document sources; if adopting one-time reads, make refresh/re-entry semantics explicit. Avoid simply displaying historical xp/level: the product deliberately shows **current** XP on older weekly results. Keep owner validation and missing-data fallback. Lightweight public identity/XP documents or persisted current summaries require coordinated writers and separate schema work.

## 3. Profile Focus effect republishes all positive historical days

Baseline `shared/use-profile-focus.ts` subscribes to all private focus-day documents and study control for an own profile. Its publication effect loops over every positive historical day whenever the days object changes, not just the changed day. Read-only profiles instead observe the public profile's focus data.

Executing the actual hook with 30 positive days confirms 30 publication calls on that effect invocation. `publishStudyFocusDay` in `shared/study-controller.ts` reads the day, private profile, public profile, and week's leaderboard entry in its normal valid-owner transaction: four document gets per call. Thus 30 successful valid-owner checks can attempt 120 transaction reads, before retries or earlier effects being cancelled. This is a code-path calculation, not a measured production bill. Existing comparisons can skip unchanged writes but do not remove those reads. The one-second display interval itself does not run the publication effect because now is not in that effect's dependency list.

The separate `codex/focus-db-load` branch already modifies this path with repair/deduplication and lifecycle settlement logic. Reuse that implementation during integration rather than introducing a second independent focus repair cache here. Preserve offline recovery, cross-device updates, finished-session credits and historical XP.

Web AppShell also observes focus days for global XP while Profile observes them for stats. Identical targets can share SDK backend work; account-scoped active-source reuse can still reduce JS subscriptions and repeated work. Do not infer duplicated billing solely from their two call sites.

## 4. Repeated public dashboard publication fans out into leaderboard readers

Web AppShell listens to local practice/task/tracker events, reconstructs public activity/dashboard, and calls savePublicProfileActivity. Android root similarly depends on profile, practice records, publicTracker and tasks. Baseline savePublicProfileActivity always writes merge payload plus updatedAt even when semantically unchanged. The diagnostic confirms two identical invocations produce two setDoc calls.

Besides the write, every active leaderboard XP reader watching that public document can receive the update. Current schema's dashboard holds records, task history and tracker, so payload size grows over time. One large document is still one document operation; bytes/size must be measured separately.

The Practice optimization branch already contains ordered server-comparison publication with offline fallback. Its comparison adds a read and can skip unchanged writes; do not claim it makes both counts decline. Syllabus and Practice source sharing also avoid some unnecessary downstream callbacks. These improvements are **not** present in this main-based audit branch yet and must not be counted as new fixes here.

## 5. Profile hydration and settings duplicate work

- Web root reads private profile and then watches it. AppShell separately reads and watches the same private profile. Re-entering/remounting an AppShell can repeat that work. Root and shell have distinct readiness roles that must be preserved before consolidating.
- Android root reads then watches profile once for its authenticated account effect. ProfileScreen normally consumes shared root data, so opening Profile does not automatically start new private task/practice/tracker subscriptions. Its heatmap has a fallback tracker listener only when shared data is absent.
- saveProfileWithUsername atomically maintains username claim, private profile and public profile. A normal same-username save executes two transaction gets and three sets in the diagnostic, excluding retries. Accent, feature toggles and avatar actions also use this full save path. Preserve atomic reservation/rename behavior and ownership checks; do not skip them based on an unverified UI cache.
- Web save actions also dispatch local profile updates that root can persist through patchCloudProfile. That creates a potential overlapping private publication depending on local snapshot/event timing; source inspection alone does not prove a guaranteed extra write on every Save.
- Username availability is already validated, requires touched input, and debounced for 360ms in Profile. Its cloud call reads a single username claim. Slow responses can still race newer input in paths without a request-generation guard; audit this when changing checks. This is not continuous polling while the user is idle.
- Public profile navigation makes a one-time getDoc, while public Focus adds a listener to the same document. Active XP hooks may already observe it as well. A shared current public source could avoid redundant initial reads without retaining stale data indefinitely.

Recommended: consolidate account-scoped private-profile readiness, share public sources with clear cleanup, then evaluate a narrowly scoped settings save path. Do not replace transaction safety or write retry delivery with permanent client fingerprints.

## 6. Current rank and leaderboard snapshots

Android root watches the current week's whole leaderboard to calculate widget rank; it also supplies the task-header rank and Profile rank, so it is not widget-only waste. The effect restarts on calendar-day changes, even within the same week. The open LeaderboardScreen separately observes the same current board; weekly celebration and medal sources may observe older boards. Sharing week-scoped ranking sources and keying rollover to week rather than every day are opportunities, with midnight penalties/re-ranking still derived correctly.

Web Leaderboard also republishes the viewer's leaderboard entry on entering the route/current-week effect, even if canonical task values are unchanged. Existing publisher writes updatedAt unconditionally. Normal task saves and date rollover legitimately republish elsewhere; changes from the Tasks/Habits branch must be reconciled rather than copied as a conflicting separate task optimization.

Windows selected-week listener is gated by leaderboardOpen, with cleanup when closed. It reuses the same shared XP hook, so the member-profile fanout applies there too. No continuously open hidden Windows leaderboard subscription was identified in the checked main effect. An exported watchLeaderboardRank function is not called by current main.tsx and should not be counted as an active target.

## What already costs no direct DB operation

- Profile Today/Week/Month filters, lecture/revision/mock counts, accuracy, task completion ratios, XP visualization, heatmap layout/selection and streak calculation are derived from hydrated local/shared data. Range changes do not directly query Firestore per tap.
- Theme/glow/slot animation/fireworks, media manifest fetches and AsyncStorage/localStorage reads are not Firestore calls. Saving a chosen accent/avatar is a legitimate separate cloud operation.
- useLeaderboardWeek's 30-second interval computes a date key locally. It does not poll Firestore every 30 seconds; dependencies change only when the calculated week changes.
- Public views use public dashboard data instead of querying someone else's private task collections. The public Focus listener verifies uid ownership before consuming fields.
- Ordinary listener cleanup is present in the inspected hooks; diagnostic cleanup assertions pass. No production listener leak was established.

## Validation and implementation order

`node --test scripts/audit-profile-db-load.mjs`: ten baseline diagnostics pass using actual hook/helper bodies with mocked React/SDK boundaries. Includes 52-week scaling on app/web, empty-history/celebration overlap, current/historical member XP fanout, detail-wide membership, repeated public writes, profile save transaction count and focus historical-day publication. It makes no network calls and is not an end-to-end React lifecycle, physical-device or Firebase billing test. No runtime code changed, so new builds were not required for this audit.

Recommended first implementation: historical medal loading/source sharing, followed by selected-member XP in detail and shared active leaderboard/profile sources. Preserve current XP on old weeks, ranking/ties/Sunday corrections, account switching, explicit freshness, failed-load retry, and accurate medal history. Integrate the already-tested Focus/Practice/Syllabus fixes separately; do not redo them or claim this branch contains them. Measure actual console reads/writes and real document sizes after controlled usage before restructuring public data.

## Implemented after approval

- Medal counts on app/web fetch completed weeks once per hook scope/open, with four reads at most in flight per history loader. They refresh on browser focus/app foreground, remount, account/date-range-of-history changes or new week. Ordinary rerenders do not refetch. No medal-history live listeners remain; celebration/visible boards still use live sources. Initial history still reads whole weekly boards and scales with weeks and membership. First load is not claimed to be cheaper in document reads; the main reduction is ongoing listeners. Last verified same-scope awards survive a failed refresh; failed weeks retry next refresh/open. Switching users scopes results immediately, and cancellation stops scheduling more weeks and ignores late results.
- Shared profile-data-source uses SDK-injected Firestore functions, a Firestore-instance scope, exact document paths and week keys. It shares active board/public/private-profile subscriptions and replays only the currently active source. Final unsubscribe discards values. A new subscriber after terminal error restarts the source; late stopped-generation callbacks are ignored. Concurrent document/week reads coalesce, with no settled success/failure cache. Private paths include uid, and historical read coalescing keys include account. The generic live helper is identical to Tasks/Habits, Syllabus and Practice branches for later integration.
- Web member detail observes current XP only for the selected member. Android/Windows switch from full visible-list XP targets to selected-person targets in detail, restoring the full list on back. Historical weekly board is still available for rank/points/results; current-week fallback and selected current public data remain live. Ownership validation, latest-focus XP and missing/error fallback remain. A 20-row list still needs 20 current public targets with this schema; its one-person detail needs one. No historical xp/level fallback was introduced.
- Web board API, Android rank/leaderboard/celebration and Windows leaderboard reuse the board source; private profile watchers and public XP readers reuse matching active document targets. Private/public profile getDoc wrappers share concurrent reads only; later separate getDoc calls remain fresh and can still duplicate an initial listener delivery. Public profile navigation remains a one-time dashboard fetch. Focus's public watcher and Focus-days streams remain separate because their existing optimization belongs to the Focus branch.
- Android root rank source is keyed to calculated leaderboard week, not every calendar day. Existing task/day rollover publication remains unchanged; live ranking still observes changes at midnight.
- App/web saveProfileWithUsername retains the original transaction ownership reads and rename/signup checks. An already owned, correctly named claim skips rewriting its timestamp. Unchanged private fields skip that private write; nested nonidentical objects conservatively still write. Public profile identity is still published on Save so a missing/outdated public mirror repairs. Normal changed same-username settings: two transaction gets and two writes instead of three. Identical primitive profile: two gets and one public repair write. Missing/corrupt own claims, first signup and rename still create required documents. This avoids an extra comparison read or unsafe claim-check bypass.

Not duplicated here: Focus historical-day repair (Focus branch), unchanged public activity/dashboard publication (Practice branch), tracker collection sharing (Syllabus branch), and task publication/widget changes (Tasks/Habits branch). Integration is still required to combine them. No leaderboard identity schema split, permanent history cache, altered scoring, or private-data permission broadening was introduced.

Verification: 48 Node tests pass across the updated diagnostic, weekly results, leaderboard periods, profile settings and XP timeline. New checks cover source cleanup/replay/failure/retry/isolation, in-flight reads and fresh subsequent reads, bounded/cancelled history, same-name saves, first claims, claim repair, rename cleanup, rejected claims and failed save retry. A real React browser fixture verifies live current XP/level on old weeks, owner checks, missing/error data, all-time Focus XP, unchanged historical points, 20-to-1 detail/list switching, source sharing, and final cleanup. It also verifies medal initial load, no ordinary rerender fetch, focus-refresh corrections, retained verified values on failure, retry and account switching. SDK boundaries are mocked; physical devices and production billing were not tested. TypeScript/build outcomes are recorded in the completion report.

Web, Android and Windows TypeScript checks pass. Web production build, Android Metro export and Windows frontend build pass. No installable native APK/Windows installer was built for this verification.

Changes are local on this branch; it has not been pushed. Main and other branches remain unchanged.
