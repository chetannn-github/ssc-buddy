# SSC Buddy project inspection

Inspected 17 October 2026. This is an architecture and source audit with local compilation, build, lint, and HTTP checks. No production data or deployed Firebase configuration was modified or tested. Findings below distinguish definite code behavior from risks requiring integration testing.

## Project map

| Area | Implementation | Purpose |
| --- | --- | --- |
| Main web app | `src/`, React 19, TypeScript, TanStack Start/Router, Vite, Tailwind, Radix | Integrated study workspace |
| Android/mobile | `mobile-tasks/`, Expo, React Native, AsyncStorage | Tasks, tracker, practice, progress, profile, media, Android widgets |
| Windows widget | `desktop-widget/`, Tauri 2, React, Rust | Floating tasks, weekly leaderboard, Quick Recall, tray/startup behavior |
| Windows full app | `desktop-web-app/`, Tauri | Shell opening the deployed website |
| Tracker module | `tracker/` | Syllabus, chapters, revision, mock tests; directly imported into the main web app |
| Standalone tasks module | `daily-tasks/` | Separate tasks implementation alongside the integrated web route |

The root is not a formally configured shared-package monorepo. It has separate package manifests and lockfiles, with direct relative imports into `tracker/`. Domain and Firebase logic are duplicated across web, mobile, and widget clients.

## Implemented product flows

- Email/password and Google authentication, profile onboarding, username reservation, avatars, exam goals and feature visibility settings.
- Daily tasks: today/tomorrow scheduling, types and subjects, completion with study duration, editing, deletion, history and analytics.
- Study tracking: syllabus and lecture progress, revisions, mock-test targets/logs, activity and pinned chapters.
- Practice: subjects, chapters, exercises, question banks, answer keys, timed CBT/OMR sessions, standard/random modes, results, history, solutions and favourites.
- Quick Recall: short subject-scoped sessions prioritizing favourites/mistakes, correction review, learning stats and attempt records; mobile and Windows widget surfaces.
- Profiles/progress: activity heatmaps, study totals, streaks, XP/levels, public usernames, weekly leaderboard and per-user weekly task details.
- Motivational music/videos, playlists/likes, manifestation prompts, backup export/import and older backup/snapshot compatibility code.

These flows have substantial implementations. Their presence does not establish that every interaction works on a real Android or Windows installation.

## Data architecture

Firebase Auth supplies the uid. Private Firestore records are under `users/{uid}`:

- `tasks/{taskId}`
- `practiceSubjects/{subjectId}` (nested chapter/exercise/question arrays)
- `practiceAttempts/{attemptId}` and `practiceFavourites/{questionId}`
- `practiceSettings/current`
- `tracker/{meta,subjects,revision,tests,activity,pinned}`
- `profile/current`, `preferences/current`, `sharedData/{key}`
- `questionLearning/current`; legacy `appData` snapshots/chunks also remain supported

Global records include `usernames/{username}`, `publicProfiles/{username}` and `leaderboards/{week}/entries/{uid}`.

Web uses localStorage; mobile uses AsyncStorage. Both hydrate caches from Firestore and subscribe to multiple live collections. The Windows widget explicitly configures persistent Firestore caching. Several web comments still claim that reads are one-shot and question banks are loaded lazily, while current root startup loads the bank and attaches live listeners.

## Prioritized findings

### 1. Profile synchronization drops identity/settings fields — high confidence

`src/routes/__root.tsx:383–425` normalizes a remote profile to only `name`, `questionGoal`, `examName`, `manifestation` and `avatar`, then replaces the local profile JSON. It omits `username`, `practiceSessionEnabled` and `trackProgressEnabled`.

`src/components/layout/AppShell.tsx:84` has a separate profile normalizer/listener that preserves those fields. These two writers disagree about the same local record. Root hydration or later profile snapshots can erase the username and settings locally, making routing/onboarding and toggle behavior depend on listener timing. Use one complete profile normalization/sync path.

### 2. Cloud restore deletes live data before securing the replacement — high-risk code path

`src/lib/backup.ts:326–370` restores into the local cache, deletes canonical cloud collections in multiple commits, then reads the local cache to construct the replacement writes. Existing live listeners are not suspended during this operation. Delete snapshots can consequently overwrite restored caches before those caches are read. A failure midway through deletion/upload also leaves a partially restored cloud account.

Capture and validate an immutable replacement payload before cloud mutation; suspend reconciliation during restore and design a recoverable staging/switch mechanism. This interleaving was identified from code, not reproduced against a live account.

### 3. Public profiles publish detailed study records — confirmed payload exposure

`src/components/layout/AppShell.tsx:1247–1259` publishes the complete tracker object and daily task list. Practice answers are masked and question bodies/keys are removed on this web path, but task names, dates, minutes, tracker details and mock logs still enter a globally readable document. Mobile publishes dashboard data at `mobile-tasks/App.tsx:599` as well.

`firestore.rules:26` allows unauthenticated reads. Comments saying only aggregated heatmap counts are published are inaccurate. Treat this as the actual visibility contract; if detailed sharing is not intended, enforce an explicit public-field allowlist. Hiding a UI section does not remove already published fields.

### 4. Public profile links require login in the web app — confirmed routing conflict

`src/routes/__root.tsx:224` redirects every signed-out path except `/auth` to authentication. That includes `/@username` and `/weekly-stats/username`, despite the public routes and publicly readable Firestore records. Exempt public routes if links should be viewable by visitors.

### 5. Leaderboard integrity is entirely client-trusted — confirmed rules limitation

`firestore.rules:33–36` checks entry ownership/uid, but does not validate points, XP, level, task totals or profile identity against authoritative records. A signed-in user can submit arbitrary values for their own leaderboard entry. Normal UI scoring does not prevent that. Compute/validate ranking values in a trusted backend if competitive integrity matters.

### 6. Windows Quick Recall cache survives account changes — high confidence

`desktop-widget/src/main.tsx:29,101–110,160–162` stores/restores the current recall session using one global localStorage key. Auth changes do not clear or scope that session by uid. Signing out of account A and into B can retain A's questions/session; subsequent answer callbacks use the new user. Scope sessions/progress by uid and reset them on auth changes.

### 7. Concurrent mock-test appends can overwrite each other — confirmed race

`mobile-tasks/src/lib/firebase.ts:412–421` reads the current mock-test log, appends locally and writes the entire array using `setDoc`. Two clients reading the same starting log can each replace it with their own append, losing one test. Deletion already uses a transaction. Use a transaction for append too, or individual documents per test.

### 8. Exam countdown depends on timer ticks — confirmed mechanism, device impact untested

`src/components/exam/TestScreen.tsx:69` decrements remaining time once per interval callback rather than calculating from a deadline. Background-tab throttling, sleep or a blocked main thread can make an exam last longer than configured and under-report elapsed time. Derive remaining time from an absolute deadline and test background/resume behavior.

## Reliability and maintenance concerns

- Practice sync launches writes without awaiting/catching them and advances its in-memory baselines immediately (`src/lib/practice-sync.ts`). Rejected writes have no explicit retry/status flow in that layer. Similar fire-and-forget paths occur elsewhere.
- Main web startup waits for practice, tasks and tracker hydration, including the complete question bank. Large data or a stalled request can delay the entire workspace. There is no timeout in this hydration gate.
- Whole subjects, tracker sections and public dashboards grow inside single documents. Those shapes need size/bandwidth testing with representative large accounts.
- Task/practice migration helpers put every item in one batch, unlike restore code which explicitly chunks writes. Large migrations deserve boundary testing.
- Several critical modules are large and combine UI, persistence and domain logic. Root profile sync and AppShell profile sync already demonstrate the maintenance cost of overlapping ownership.
- Root README is generic; mobile README says Firebase sync is not yet added, contradicting implemented cloud sync. Media instructions also differ from the script, which uses `public/media` as its shared source.
- No dedicated automated test suite or CI workflow was found in the searched repository files. Existing `test.tsx` is a product route, not a test suite.

## Verification completed

| Check | Result |
| --- | --- |
| Main web `tsc --noEmit --pretty false` | Passed |
| Mobile `tsc --noEmit --pretty false` | Passed |
| Main web `pnpm run build` | Passed, client/SSR/worker output generated |
| Widget `pnpm run build` | Passed, TypeScript and frontend bundle |
| ESLint on web/tracker/mobile/widget source | Failed; 21,827 formatting diagnostics plus type/style/hook warnings/errors |
| Local HTTP smoke: `/auth`, `/tasks`, `/test`, `/track`, `/profile`, `/@audit-nonexistent` | All returned HTTP 200 HTML |

Lint diagnostics are not equivalent to runtime bugs. In particular, React Native's static asset `require()` calls conflict with the current broad lint rules and need platform-appropriate configuration.

Build warnings include large JavaScript chunks: the web Firebase bundle is about 593 kB minified and the widget entry about 914 kB minified, before gzip. Some SSR dependency directives and a redundant tsconfig-paths plugin also produce warnings.

HTTP smoke checks establish local server rendering only. They do not verify hydrated browser interactions, authentication providers, deployed Firestore rules, offline reconciliation, Android widget behavior, or native Rust/installer builds. No sign-ins, cloud writes, deployments, pushes or source fixes were performed during this inspection. The build-generated tracked media manifest change was reverted.

## Recommended order

1. Consolidate profile synchronization and fix public-route auth behavior.
2. Make backup restore recoverable and isolate live listeners during replacement.
3. Decide and enforce the exact public profile payload and leaderboard trust model.
4. Scope desktop recall state by account; make mock-log appends transactional.
5. Test cross-device edits, failed writes, offline/reconnect and account switching with emulator/test accounts.
6. Add focused regression coverage, split platform lint configs and update documentation.
