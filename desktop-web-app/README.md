# SSC Buddy Desktop

Standalone Tauri shell for the deployed SSC Buddy website. This folder does not
import, modify, or build the website, Expo app, or the compact desktop widget.

## Development

```powershell
cd desktop-web-app
pnpm install
pnpm dev
```

## Windows installer

```powershell
pnpm bundle:windows
```

The installer is generated under `src-tauri/target/release/bundle/nsis/`.

The app opens `https://ssc-buddy.vercel.app` directly, so its Firebase auth and
Firestore data are exactly the same as the website.
