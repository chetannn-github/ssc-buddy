import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { StudySession } from "../../../shared/study-controller";

type FocusModule = {
  getFocusLockStatus?: () => Promise<{ enabled: boolean; allowedCount: number; serviceConnected?: boolean; sessionActive?: boolean; error?: string }>;
  syncFocusLock?: (id: string, endsAt: number, accent: string) => Promise<void>;
  syncFocusState?: (id: string, endsAt: number, accent: string, paused: boolean, remainingMs: number, image: string) => Promise<void>;
  openFocusLockSettings?: () => Promise<void>;
  consumeFocusRecall?: () => Promise<boolean>;
};
const native = Platform.OS === "android" ? requireOptionalNativeModule<FocusModule>("BuddyMusic") : null;
export const supportsDeviceFocus = !!native?.getFocusLockStatus;
export const deviceFocusStatus = () => native?.getFocusLockStatus?.() ?? Promise.resolve({ enabled: false, allowedCount: 0 });
export const syncDeviceFocus = (id: string, endsAt: number, accent: string) => native?.syncFocusLock?.(id, endsAt, accent) ?? Promise.resolve();
export const syncDeviceFocusState = (session: StudySession | null, accent: string, image: string) => native?.syncFocusState?.(session?.lockId ?? session?.id ?? "", session?.endsAt ?? 0, accent, session?.paused === true, session?.remainingMs ?? 0, image) ?? syncDeviceFocus(session?.lockId ?? session?.id ?? "", session?.endsAt ?? 0, accent);
export const openDeviceFocusSettings = () => native?.openFocusLockSettings?.() ?? Promise.resolve();
export const consumeFocusRecall = () => native?.consumeFocusRecall?.() ?? Promise.resolve(false);
