# SSC Buddy Mobile

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
