# Focus Lock development

The extension uses Firebase Auth and account-scoped Firestore REST documents. The desktop widget uses its existing Firebase SDK. Shared domain validation lives in shared/study-selection.ts and desktop controllers in shared/study-lock.ts.

users/{uid}/studyLock/current holds version, revision, allowedDomains and session (id, startedAt, endsAt, domains). Device acknowledgements live in users/{uid}/studyLockDevices. Update preconditions protect concurrent extension edits. Active sessions preserve their deadline and selected domains, with at most three total domains.

Dynamic declarativeNetRequest rules redirect top-level HTTP(S) navigation except allowed domains to blocked.html. Rule IDs 1?3 are cleared on changes for migration from older builds. Legacy per-tab session rules are removed on startup. YouTube is a normal domain. No channel crawling or content script is installed.

The popup reuses desktop-widget/src/components/StudyDurationPicker.tsx. Build with node browser-extension/build.mjs. The build reads existing Firebase web configuration from project environment files; these identify the project and do not grant administrative access.

Tests: node --test browser-extension/policy.test.mjs browser-extension/worker.test.mjs browser-extension/controller.test.mjs. browser-check.mjs launches an isolated Edge profile and intercepts authentication and Firestore traffic; no production writes are performed.

Daily focus totals are private documents under users/{uid}/studyFocusDays/{YYYY-MM-DD}. totalMilliseconds and sessionCredits store elapsed credits per session ID. Client transactions and REST update-time preconditions prevent duplicate credits from retries or multiple devices. Session timeZone fixes midnight boundaries; completed sessions are credited before replacement. The extension persists pending credits across offline expiry and retries after reconnect. Active totals write minute checkpoints and an exact final duration; the widget adds uncredited live elapsed time for display. Test these with node --test browser-extension/focus.test.mjs browser-extension/controller.test.mjs; browser-check.mjs also checks offline completion persistence.
