import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { StudySession, OverlayBreak } from "../../../shared/study-controller";

type FocusModule = {
  getFocusLockStatus?: () => Promise<{ enabled: boolean; allowedCount: number; serviceConnected?: boolean; sessionActive?: boolean; adminEnabled?: boolean; deviceOwner?: boolean; unlockAt?: number; error?: string }>;
  requestFocusAdmin?: () => Promise<void>;
  syncFocusLock?: (id: string, endsAt: number, accent: string) => Promise<void>;
  syncFocusState?: (id: string, endsAt: number, accent: string, paused: boolean, remainingMs: number, image: string) => Promise<void>;
  openFocusLockSettings?: () => Promise<void>;
  consumeFocusRecall?: () => Promise<boolean>;
  readFocusBreaks?: () => Promise<string>;
  acknowledgeFocusBreak?: (id: string) => Promise<void>;
  configureFocusImages?: (localFiles: string, manifest: string) => Promise<void>;
};
const native = Platform.OS === "android" ? requireOptionalNativeModule<FocusModule>("BuddyMusic") : null;
export const supportsDeviceFocus = !!native?.getFocusLockStatus;
export const supportsFocusAdmin = !!native?.requestFocusAdmin;
export const requestFocusAdmin = () => native?.requestFocusAdmin?.() ?? Promise.reject(new Error("Install the updated Android app to enable uninstall protection."));
export const deviceFocusStatus = () => native?.getFocusLockStatus?.() ?? Promise.resolve({ enabled: false, allowedCount: 0 });
export const syncDeviceFocus = (id: string, endsAt: number, accent: string) => native?.syncFocusLock?.(id, endsAt, accent) ?? Promise.resolve();
export const syncDeviceFocusState = (session: StudySession | null, accent: string, image: string) => native?.syncFocusState?.(session?.lockId ?? session?.id ?? "", session?.endsAt ?? 0, accent, session?.paused === true, session?.remainingMs ?? 0, image) ?? syncDeviceFocus(session?.lockId ?? session?.id ?? "", session?.endsAt ?? 0, accent);
export const openDeviceFocusSettings = () => native?.openFocusLockSettings?.() ?? Promise.resolve();
export const consumeFocusRecall = () => native?.consumeFocusRecall?.() ?? Promise.resolve(false);
export const readFocusBreaks = async (): Promise<OverlayBreak[]> => JSON.parse(await native?.readFocusBreaks?.() ?? "[]");
export const acknowledgeFocusBreak = (id: string) => native?.acknowledgeFocusBreak?.(id) ?? Promise.resolve();
export const configureDeviceFocusImages = (localFiles: string[], manifest: string) => native?.configureFocusImages?.(JSON.stringify(localFiles), manifest) ?? Promise.resolve();
