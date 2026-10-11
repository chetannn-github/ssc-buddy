# SSC Buddy Windows Widget

A separate Tauri 2 + React + TypeScript desktop companion for the existing SSC Buddy project. It intentionally uses the existing Firebase contract rather than a new desktop-specific backend.

## Shared backend contract

- Authentication uses the same Firebase Web App configuration and Firebase Auth account as the Vite site.
- Tasks are read and written as individual documents at `users/{uid}/tasks/{taskId}`.
- Every document uses the existing `DailyTask` shape only:
  `id`, `name`, `subject`, `type`, `createdAt`, `date`, `completed`, `completedAt`, and `minutesSpent`.
- Existing Firestore rules already restrict every `users/{uid}/…` path to its authenticated owner, so no rules change is required.
- Document-level `setDoc` / `deleteDoc` calls match the website and Expo app. The listener de-duplicates by document ID, so reconnects and repeated snapshots do not create duplicate task/session entries.

## Setup

1. Copy `desktop-widget/.env.example` to `desktop-widget/.env`.
2. Copy the same `VITE_FIREBASE_*` values from the website's private `.env.local`.
3. From this folder run `pnpm install`.
4. Install the [Rust stable toolchain](https://www.rust-lang.org/tools/install) and Microsoft C++ Build Tools if they are not already available.

For Google sign-in, ensure the Firebase Auth authorised domains include the desktop webview flow used by your Firebase project. Email/password uses the same enabled Firebase provider without additional configuration.

## Commands

```powershell
cd E:\ssc-buddy\desktop-widget
pnpm dev
pnpm build
pnpm bundle:windows
```

`pnpm bundle:windows` produces a Windows NSIS installer under `src-tauri/target/release/bundle/nsis/`.

## Offline and sync behaviour

Firestore IndexedDB persistence is enabled with `persistentLocalCache()`. Reads remain available from the local cache, writes are queued by Firestore while offline, and Firestore safely replays them after reconnection. The window reports cached/offline/synced state. Live `onSnapshot` updates are received from changes made on the Vite website and Expo Android app.

## Desktop behavior

- Floating, resizable always-on-top window.
- Closing hides the window instead of quitting it.
- Tray menu: show, hide, quit; a tray click reopens the widget.
- Windows startup is enabled by default through Tauri's autostart plugin.
