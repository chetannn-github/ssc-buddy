# Habits

Habits are private, independent trackers available in app navigation and /habits on the web. Edit Profile → Settings → Habits hides the section without deleting its data. This preference syncs with the existing account profile.

Add Habit opens the complete reference form directly. Choose a color from the two-row palette and an icon from the searchable category sheet. Daily marks are independent of study tasks, XP and leaderboard points.

- Tick marks successful days. Quit habits are clean by default: tap to record a slip; count tracking stays clean up to the daily limit. Quit frequency is everyday.
- Count increments by the configured tap amount; reaching the daily goal completes the day. Long press the app action or right click the web count action to correct its value.
- Checklist requires all items. Partial checklist/count progress shades the heatmap.
- Heatmap taps have no action and show no detail text or completion dialog. Marking and corrections are allowed for today and yesterday; earlier days are read-only. Note controls are removed; existing stored notes are preserved.
- Date progress rings and Habit Score animate when data changes. All/Due uses a sliding highlight. The app status bar stays hidden against a black background.
- Current streak is always shown at the upper right. Description, category, and streak visibility controls are removed from Add Habit. Scheduled rest days do not break it. Period-frequency habits count consecutive successful weeks/months, with weeks starting Monday.
- Optional target days count distinct completed days, so a 70-day challenge shows 12/70 independently of its consecutive streak.
- All/Due filters apply to the selected date. Week arrows review previous dates.
- App long press / web right click opens Edit/Delete; deletion requires confirmation.

## Data

Owner-only Firestore documents: users/{uid}/habits/{id}. Metadata edits use updateDoc and preserve tracking history. Daily mutations use a transaction against the latest habit, so concurrent count increments/checklist edits do not overwrite each other. Each day stores count, checked item IDs and note, plus an atomic completed-date membership update. Existing simple habits without settings migrate through normalization.

## Reminders

Expo Notifications schedules local habit and checklist-item reminders on the signed-in phone. Only this feature's alarms are replaced; signing out/changing account/disabling Habits cancels them. Up to 60 upcoming alarms across 30 days are rebuilt when data changes or the app returns to the foreground. Open the app periodically to refresh the horizon. Timing is subject to Android battery/notification settings. The adapter loads only local notification APIs, avoiding the optional ExpoTopicSubscriptionModule import. Builds without native notification support keep Habits usable and explain that reminders need an updated APK. Device delivery is not verified by a JavaScript export.

Browser reminders require notification permission and an open app tab. They are deduplicated per account/item/day. No push server is configured, so a closed browser does not deliver reminders.

## Checks

Run pnpm test:habits, root/mobile pnpm exec tsc --noEmit, the Vercel web build and Expo Android export. The isolated UI fixture uses real UI components plus an in-memory store: node scripts/preview-habits.mjs. It never writes to Firebase. Native notification delivery still needs an APK/device check.

## Android habit widgets

Long press a habit → Add to widget, or add SSC Buddy Habit from the home-screen widget menu and choose a habit. Each widget binds its own habit ID and account. Tick toggles today, Count provides decrement/increment, and Checklist exposes the first three items (tap the title to open the app for the rest). A compact heatmap, streak and optional challenge count remain visible. Actions use a Firestore transaction against the current account and today's date. Account changes clear the cache and prevent old bindings from exposing another user's data. App changes refresh widgets; Android periodic refresh updates them while closed, subject to launcher scheduling.

The app reminder time control opens a dark clock dialog with hour/minute selection, AM/PM and keyboard entry. Checklist reminders are removed from the Add Checklist dialog. Heatmap cells are 13px, matching the Profile heatmap, with horizontal scrolling to retain history.

A fresh Android APK is required for the new Habit widget provider. Native launcher pinning, widget rendering/taps, time picker and animation need a device check; TypeScript checks and Android JS export do not perform a native device test.

The clock hand supports continuous dragging: hours snap to 1–12, minutes to every exact minute (including between the five-minute labels). Releasing an hour selection advances to minutes. The clock center ignores ambiguous touches. Preview changes remain local until OK.

Save displays a spinner and Saving… from permission checks through persistence, with an immediate duplicate-submit lock. Habit tick/count marking shows a spinner on the affected card; checklist marking shows a spinner on its item. Pending mutations disable repeat taps, and loading resets on failure.

Expo Go saves reminder preferences without loading or calling native notification/channel APIs. It shows that delivery needs the installed Android app. Required field validation disables Save until the title, schedule, count/checklist fields and optional target/reminder values are valid. Tracking, reminder and challenge controls share one compact card.

Habit marking now uses optimistic updates without a loader or message. Tick buttons briefly scale up; date rings, score and streak respond immediately. Per-habit queues serialize backend transactions, preserve rapid count/toggle operations, and quietly roll back failed writes. Save/Edit dialogs retain their save spinner. Heatmaps keep a fixed width inside a horizontally scrollable viewport with a visible scrollbar; scrolling history is not reset after normal updates.

Checklist tracking uses a compact bottom sheet: habit icon/title/date and count pill, numbered rows, accent check circles, tinted checked rows and strike-through titles. Tap outside (or use Android Back/Escape) to dismiss; there is no Close button. The flame and animated streak number sit below each habit name.
