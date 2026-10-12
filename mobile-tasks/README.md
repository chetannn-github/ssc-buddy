# SSC Buddy Mobile

## Build-time media

Put music in `assets/music/` and reels in `assets/videos/` (nested music folders are supported). `pnpm run prepare-media` generates Expo's required static import map automatically. It runs before `pnpm start`, `pnpm android`, and EAS builds, so new `.mp3`/`.m4a`/`.ogg`/`.wav` and `.mp4`/`.mov`/`.webm` files appear in the app without editing playlist code. Every bundled file increases the Android installer size.

Separate Expo/React Native app for SSC Buddy. Navigation has Tasks, Track, Practice, Progress,
and Profile; Daily Tasks is the first functional module. It keeps task data locally with
AsyncStorage until shared Firebase sync is deliberately added.

The project uses the latest Expo SDK and supports Android, iOS, and web.

```powershell
cd E:\ssc-buddy\mobile-tasks
pnpm install
pnpm start
```

Use Expo Go to scan the QR code, or run `pnpm android` / `pnpm ios`.
