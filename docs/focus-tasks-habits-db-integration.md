# Focus and Tasks/Habits DB integration

Date: 2026-10-24. Branch: `codex/focus-tasks-habits-db-integration`.

Combined branches:

- `codex/tasks-habits-db-audit` at `b4565b5`, based on main `eb96ec5`.
- `codex/focus-db-load` at `088f67d`, with separately synchronized UI history.

This is a normal merge on a new integration branch, without rewriting either source branch or main. Practice was subsequently added as described below. Syllabus and Profile/Leaderboard optimization branches are not included.

## Conflict resolution

Focus has divergent/cherry-picked UI history relative to main, which generated conflicts in extension files, Focus schedules documentation and Focus controller/components. Comparing each branch's net changes against main established that their changed path sets do not overlap: Focus changes 18 paths and Tasks/Habits changes 18 different paths.

Resolved Focus paths to their exact tested Focus-branch blobs, preserving Tasks/Habits paths exactly from that branch. Verified the staged tree against both source path sets and verified that the combined changes versus main contain exactly their union, with no unrelated runtime changes. No optimization was dropped or reimplemented during conflict resolution.

## Verification

- 169 automated tests covering extension cloud/controller/break/rule/worker behavior, Focus DB lifecycle/credits, task widget publication and account/day retries, task mutation read-reuse/fallback, habit transactions/subscriptions/widgets, leaderboard periods, weekly results, XP and workspace rules.
- 30 additional tests for Focus schedules, habit widget layout/actions and habit notifications.
- Three real React browser regressions: seven-hour Focus lifecycle and one final shared commit; logout visibility through focus/break/resume/account changes; current live XP/level on historical weekly results with unchanged weekly scores and listener cleanup.
- Web and Android TypeScript checks pass.
- Web production build, Windows frontend build, extension bundle and Android Metro export pass. Windows build includes a nonblocking chunk-size warning.

Tests mock Firebase/native boundaries. No production billing measurement, physical-device APK test or installable Windows installer build was performed. Builds alone do not establish device/network timing guarantees.

The initial merge was committed as `18c9788` and later pushed on explicit user request. Existing source branches and main remain unchanged.

## Practice/Quick Recall integration

Subsequently merged `codex/practice-session-db-audit` at `d15107f` into this same integration branch, starting from `18c9788`, with a normal merge. No runtime merge conflicts occurred. Git automatically combined Tasks/Habits and Practice changes in Windows Firebase helpers, Android Firebase helpers and the Android widget entry point. The shared-live-source helper was already identical and remained shared.

The combined suite initially exposed a test fixture compatibility issue: the isolated Windows task mock loader returned an empty module for Practice's newly imported createInFlightLoader helper. Updated that fixture to evaluate the real dependency instead of bypassing its implementation. No application logic was altered to satisfy the fixture.

Final verification for the three-feature combination:

- 285 automated tests pass across Focus/extension, Tasks/Habits, Practice/Recall, question deletion, immutable snapshots, active-session recovery, exercises, public-profile publication ordering/failure, weekly scoring and XP suites.
- Five browser regression scripts pass: Focus lifecycle, logout, historical-board current XP, Practice pre-submit confirmation, and Practice history/results/viewer/solutions. Practice viewport coverage includes 390/1024/1280/1920px as applicable.
- Web, Android and Windows TypeScript checks pass. Web production, Windows frontend and Android Metro export pass. Extension runtime sources were unchanged by this second merge; its tests pass in the combined suite and its previous integration bundle verification remains applicable.

No native-device/production-billing test was performed. This additional merge is local until separately pushed on user request. No Syllabus or Profile/Leaderboard branch has been merged.
