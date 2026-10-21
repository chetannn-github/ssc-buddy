# SSC Buddy Mobile

## Build-time media

Use the shared project folders: `public/media/music/` for music, `public/media/videos/` for reels, and `public/avatars/` for motivational/profile images. Add or delete files there; no playlist or image-list code changes are needed.

Expo config automatically copies the current shared images into the mobile assets and regenerates literal imports before an APK build. The copied image selection is retained in mobile-only EAS archives. `pnpm run prepare-media` also refreshes these lists before app development and EAS builds. Music/reels use the deployed website; images are bundled, so install a new APK after changing images.

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
