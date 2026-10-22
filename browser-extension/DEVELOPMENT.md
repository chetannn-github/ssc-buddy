# Study Lock development

The extension uses Firebase Auth and account-scoped Firestore REST documents. The desktop widget uses its existing Firebase SDK. Shared domain validation lives in shared/study-selection.ts and desktop controllers in shared/study-lock.ts.

users/{uid}/studyLock/current holds version, revision, allowedDomains and session (id, startedAt, endsAt, domains). Device acknowledgements live in users/{uid}/studyLockDevices. Update preconditions protect concurrent extension edits. Active sessions preserve their deadline and selected domains, with at most three total domains.

Dynamic declarativeNetRequest rules redirect top-level HTTP(S) navigation except allowed domains to blocked.html. Rule IDs 1?3 are cleared on changes for migration from older builds. Legacy per-tab session rules are removed on startup. YouTube is a normal domain. No channel crawling or content script is installed.

The popup reuses desktop-widget/src/components/StudyDurationPicker.tsx. Build with node browser-extension/build.mjs. The build reads existing Firebase web configuration from project environment files; these identify the project and do not grant administrative access.

Tests: node --test browser-extension/policy.test.mjs browser-extension/worker.test.mjs browser-extension/controller.test.mjs. browser-check.mjs launches an isolated Edge profile and intercepts authentication and Firestore traffic; no production writes are performed.
