import { registerRootComponent } from "expo";

import App from "./App";

// Explicit entry point avoids Expo AppEntry resolving App from pnpm's nested store.
registerRootComponent(App);
