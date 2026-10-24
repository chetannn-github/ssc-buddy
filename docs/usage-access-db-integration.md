# Combined DB optimizations on the Usage Access branch

2026-10-24. Target: `codex/focus-usage-access`, previously `44c818e` (Usage Access migration plus delayed usage-event fix). Source: `codex/combined-db-optimizations` at `619642e`.

Combined branch `619642e` was pushed separately on the user's explicit request before finishing this merge. This target merge is local until separately requested. Main and the combined branch's Accessibility implementation are unchanged by target-specific resolution.

## Included

All five DB optimization sets (Focus, Tasks/Habits, Practice/Recall, Syllabus, Profile/Leaderboard), current main UI, latest live-profile XP readiness, AM/PM schedule labels, mobile website setup input, Question Bank back-icon change and Settings exemption fix.

## Native conflict resolution

Four conflicts: BuddyFocusService, BuddyMusicModule, DeviceFocusSetup, native-focus-lock. Preserved Usage Access foreground service, 400ms native usage-event scans, delayed-event overlap/reducer, application overlay type, permission flow, foreground notification and service restore. No Accessibility service is registered in the merged manifest.

Retained latest schedules and exact-alarm access status, image behavior, Settings rejection/selection filtering, and timer/break/foreground guards. Restored the Settings-package set alongside usage tracking, included scheduleAlarmAccess alongside usage/overlay access in the native bridge, and carried both fields in the TS bridge. Restored app-switch evidence from a change in the scanned foreground before calling the newer passive-refresh guard: actual app changes may show a block, while passive image/timer work cannot repeatedly summon it. The manifest declares Settings intent visibility for OEM Settings resolution.

Native scan timers are local; these are not Firestore polling intervals. The DB lifecycle optimizations remain intact.

## Verification

- 320 combined Node tests pass across all five DB feature areas and extension policies.
- Web and Android TypeScript pass.
- Real React regressions pass for profile first-load readiness/tab-return live XP/account/error cleanup, mobile allowed websites, and seven-hour Focus lifecycle.
- Kotlin compiler successfully compiles BuddyFocusService and its actual policy/schedule/protection/image dependencies against Android 14 API classes (Robolectric android-all used as compile classpath). Existing Android API deprecation warnings remain. This is not a full Expo/Gradle APK build or Android runtime execution.
- 29 JUnit tests pass for app allow/block policy, foreground/window policy, break timing, Usage Access foreground reducer/delayed replay, schedules, Settings blocking and calls.
- Web production build and Android Metro export pass.

No physical phone test, signed APK installation, force-stop/OS killing test or production billing measurement was performed. Usage Access/overlay restrictions remain dependent on Android/OEM delivery and enabled permissions; compilation and policy tests do not establish bypass resistance.
