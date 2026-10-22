import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type FocusModule = {
  getFocusLockStatus?: () => Promise<{ enabled: boolean; allowedCount: number }>;
  syncFocusLock?: (id: string, endsAt: number, accent: string) => Promise<void>;
  openFocusLockSettings?: () => Promise<void>;
  consumeFocusRecall?: () => Promise<boolean>;
};
const native = Platform.OS === "android" ? requireOptionalNativeModule<FocusModule>("BuddyMusic") : null;
export const supportsDeviceFocus = !!native?.getFocusLockStatus;
export const deviceFocusStatus = () => native?.getFocusLockStatus?.() ?? Promise.resolve({ enabled: false, allowedCount: 0 });
export const syncDeviceFocus = (id: string, endsAt: number, accent: string) => native?.syncFocusLock?.(id, endsAt, accent) ?? Promise.resolve();
export const openDeviceFocusSettings = () => native?.openFocusLockSettings?.() ?? Promise.resolve();
export const consumeFocusRecall = () => native?.consumeFocusRecall?.() ?? Promise.resolve(false);
