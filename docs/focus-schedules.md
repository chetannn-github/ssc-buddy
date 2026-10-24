# Focus schedules

Implemented on `main` and integrated into `codex/focus-db-load`. This branch retains event-based focus settlement, grouped history repair, and the extension control listener without periodic control GETs or presence heartbeats.

## Setup and behavior

Open Focus Lock → Schedules → Add on web, Android, or the Windows widget. Choose Sleep, Morning detox, or Custom; a name, start/end time, selected weekdays, and 0–2 extra Android app slots. Defaults are no breaks and zero extra apps. Existing Phone/SSC Buddy exceptions remain unchanged. At most eight schedules are stored; each window lasts 1 minute to 12 hours.

Weekdays refer to the start day: Monday 22:00–06:00 ends Tuesday morning. Schedules use the timezone saved at creation. Overlapping schedules are rejected, including overnight spillovers; adjacent windows are allowed. Manual sessions that overlap an upcoming schedule are rejected. An already active manual session is never shortened or replaced by a scheduled start.

Existing schedules cannot be edited or deleted from one hour before their next start until that occurrence ends. An editor already open at the boundary becomes disabled; saving also rechecks the latest stored document in a transaction. For 22:00–06:00, editing locks at 21:00 and returns at 06:00. This is client enforcement, not a security-rule or server-time guarantee against modified clients or a changed device clock.

Scheduled sessions keep their original end time when a client wakes late. Fully missed windows are not replayed. A newly created schedule whose start already passed waits for its next selected weekday. Deterministic occurrence IDs and existing per-session accounting prevent duplicate starts/credits across clients. Focus uses the existing daily totals/reward paths.

## Platforms and offline behavior

- Web and Windows reuse the existing control document/listener plus local boundary timers. An open client activates a due schedule; opening during its window uses the remaining window. A fully closed browser/widget cannot execute JavaScript.
- The extension consumes the same schedules and caches them per account. A Chrome alarm starts cached schedules and restores blocking offline, preserving the original end. It also recovers after a worker restart. A completely closed browser cannot enforce until it runs again. It receives setup changes through the existing synchronization path; it does not have a second schedule editor.
- Android caches schedules locally and uses AlarmManager, boot/time-change receivers, and the existing Accessibility enforcement service. Setup requires the updated native build, Focus Lock accessibility permission, and Alarms & reminders permission. Completed native sessions remain in a local journal until focus credit uploads successfully. Network access is not required for a previously cached alarm. Cached devices cannot receive remote schedule edits while offline. Power-off and force-stop are not execution guarantees; recovery within a still-active window retains its original end.
- Android exact-alarm permission revocation falls back to an inexact alarm and is shown in setup; punctual starts require the permission. OEM battery restrictions and real-device behavior still need APK testing.

Schedules are embedded in `users/{uid}/studyLock/current.focusSchedules`. There is no new scheduler polling collection or per-second database write. On this branch scheduled focus is settled at lifecycle boundaries, just like manual focus. The extension publishes a locally started schedule once through the existing conditional control write; unsuccessful activation retries with backoff, while running timers do not poll the control document.

## Validation

- `node scripts/test-focus-schedules.mjs`: nine domain/controller regressions.
- `node scripts/test-focus-schedule-ui.mjs`: real React UI and runner in Edge, freeze while editing, start/end boundary, idempotence, cleanup.
- Extension/controller/break/policy/worker suites: cached offline scheduled start/end and existing blocking/break/accounting regressions.
- Native FocusSchedulePolicy tests cover weekday/overnight, freeze, late/missed windows and timezone/DST; existing native overlay/app/break/image policy tests remain in the run.
- Web/app TypeScript, web/widget/extension production builds, and Android Metro export checked separately. Metro export is not an APK/Gradle build or a physical-device alarm test.
