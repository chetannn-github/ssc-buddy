# Focus Lock database load change

Branch: `codex/focus-db-load` (based on `47af925`). No merge into main or the Usage Access experiment.

## Before / after

| Surface | Before | After |
| --- | --- | --- |
| Web and Windows Focus Lock | Minute checkpoints credit focus; additional minute publication checks; profile/day updates can repeat the checks. | Timer and own elapsed total remain local. Credits are committed on a break/end, with successful duplicate settlement suppressed in memory. Start/break/resume still use the existing control transactions. |
| Android | DeviceFocusSync credits each minute; setup also republishes/checks the day each minute. | Native service and its local timer stay unchanged. DeviceFocusSync settles paused/ended segments, processes the existing durable overlay journal, and reconciles automatic resume once. No running-minute credit transaction. |
| Extension | Control REST GET + device acknowledgement on the ten-second loop and alarms; focus REST publication during those syncs. | One Firestore SDK listener on the same control document. Local ticks/alarms still enforce deadlines offline. No scheduled control GET or presence heartbeat. Acknowledgements occur when state changes; focus is saved at paused/ended boundaries. Explicit refresh/actions can still use REST. |
| Profile/task focus rows | Every focus-day snapshot scans and republishes historical days individually. | Shared in-memory repair check per database/account/totals; checks public and weekly projections in groups and repairs only missing/mismatched data using the existing private-day-verified transaction. |
| Hidden browser presence | Web/Windows subscribe even though connection info isn't displayed. | Those hidden subscriptions are skipped. |

The extension's new listener uses the existing Firebase app, account, document and permissions. REST conditional writes, redirect rules, website limits and the blocking page are retained. Cached listener packets do not override a local lock. Offline metadata updates the extension's connection indicator without a heartbeat write.

## Behavior and recovery

- Own countdown and focus totals continue moving locally, including seconds and hours.
- Start, manual break and resume still synchronize through the control document. A ten-minute break still unlocks restrictions; local automatic resume restores them even without a network.
- Public focus/leaderboard rewards update on committed break/end totals, rather than continually during focus. Task XP/ranking formulas and other feature sync are unchanged.
- Focus excludes break time. Existing segment IDs and max-per-session/day credits prevent duplicate rewards across clients.
- Expiry uses the original stored deadline. End totals can be recovered from the retained control document after reconnect/relaunch, or before a subsequent session replaces it.
- If every client is closed/offline at expiry, there is no new server scheduler: final database publication waits until a client returns. This change does not make restrictions depend on that publication.
- Extension pending credits and successful receipts are stored locally. Receipts are written only after publication succeeds; partial REST failures retry publication, including a day already saved privately.
- Caches contain successful operation signatures, not replacement profile/XP data. They are database/account scoped and bounded; failures are not cached as success. A cold client may read the already-finalized day but does not rewrite unchanged projections.
- History repair retains public-profile ownership validation, and also checks weekly projections so a missing leaderboard entry can be healed even if the public total already matches.

## Verification

All database-count tests use mocks, not the production account. Counts below are application operations in the indicated scenario, not a guarantee for the Firebase billing console.

Final checks passed: **73 automated regression tests**, three browser-based React regression scripts, web/app TypeScript checks, web production build, Windows frontend build, extension bundle, and Android Metro export. No production Firestore load test or on-phone APK test was performed.

1. Simulated seven-hour session with four web/app/Windows callers: **zero running-tick transactions, reads or writes**. Concurrent end calls on one controller: **one transaction, three reads, three writes** for a single day with an existing public profile. Repeat expired ticks: no further operations. Listener initialization/history repair costs are separate.
2. Two real React profile/task hooks run through seven hours: local elapsed text reaches `6h 59m`; one shared end commit; an additional hour of ticks does not reread/rewrite final credits. Public profiles never settle private focus. Cleanup verified.
3. Extension runs 2,520 simulated ten-second ticks: **zero polling reads, zero running credit calls, one start acknowledgement**. At end: one final credit call and one end acknowledgement. Restart does not republish an already-receipted segment.
4. Listener-driven break: rules removed on break; offline alarm restores rules after ten minutes; final credited segments are 30 + 90 minutes for a two-hour session. One acknowledgement per start/break/resume/end state.
5. Failure/reconnect, failed final credit retry, cold-client idempotency, profile setup after an initially ineligible publication, midnight/week splitting, preservation of task/profile fields, and ownership/account isolation tested.
6. 100 already-published historical days: one grouped check (`2 + number of weeks` reads), zero writes; simultaneous/repeated mounts reuse the successful check. A separately missing weekly projection is repaired.
7. Existing focus/controller/break/website/rule/widget/leaderboard/XP tests remain in the regression run. React logout and current-leaderboard-XP checks are also rerun.

Commands:

```powershell
node --test browser-extension/cloud.test.mjs browser-extension/controller.test.mjs browser-extension/breaks.test.mjs browser-extension/focus.test.mjs browser-extension/policy.test.mjs browser-extension/worker.test.mjs scripts/test-focus-db-load.mjs scripts/test-focus-timer-widget.mjs scripts/test-profile-settings.mjs scripts/test-leaderboard-period.mjs scripts/test-weekly-results.mjs scripts/test-xp-timeline.mjs scripts/test-web-workspace.mjs
node scripts/test-focus-db-react.mjs
node scripts/test-focus-logout.mjs
node scripts/test-leaderboard-current-xp.mjs
pnpm exec tsc --noEmit
pnpm run build
node browser-extension/build.mjs
# mobile-tasks/: pnpm exec tsc --noEmit; pnpm exec expo export --platform android --output-dir <temporary-path>
# desktop-widget/: pnpm run build
```

## Practical limits

Initial reads, control changes, reconnects, explicit refresh, repairs and actual lifecycle writes still use Firestore. Separate clients may each perform a final credit check; transaction idempotency prevents duplicate totals. Chrome can suspend/restart its worker, so a listener may need to reconnect. These counts do not mean zero billable reads across a whole account. See [Firestore listener billing](https://firebase.google.com/docs/firestore/pricing) and [extension worker lifetime](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

All four updated surfaces must be deployed/installed for the full benefit. An old running app/widget/extension can continue its previous periodic traffic. This branch does not alter Firestore rules, schemas, billing settings, tasks/practice sync, native overlay permissions, or the separate `codex/focus-usage-access` branch.
