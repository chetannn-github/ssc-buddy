import { NativeModule, requireOptionalNativeModule } from "expo";
import { Platform, Alert } from "react-native";
import { useEffect, useState } from "react";

export type MusicStatus = { trackId: string | null; playing: boolean; currentTime: number; duration: number; repeat: boolean; isLoaded: boolean; error: string | null; didJustFinish?: boolean };
declare class MusicModule extends NativeModule<{ status: (status: MusicStatus) => void }> {
  addListener(event: "status", listener: (status: MusicStatus) => void): { remove(): void };
  initialize(): Promise<MusicStatus>;
  getStatus(): Promise<MusicStatus>;
  setQueue(json: string, index: number): Promise<void>;
  play(): Promise<void>; pause(): Promise<void>; next(): Promise<void>; previous(): Promise<void>;
  seekTo(seconds: number): Promise<void>; setRepeat(single: boolean): Promise<void>; stop(): Promise<void>;
}
export const nativeMusic = Platform.OS === "android" ? requireOptionalNativeModule<MusicModule>("BuddyMusic") : null;
const empty: MusicStatus = { trackId: null, playing: false, currentTime: 0, duration: 0, repeat: false, isLoaded: false, error: null };
let connection: Promise<MusicStatus> | null = null;
export function musicCommand(command: Promise<unknown>) {
  void command.catch((error) => Alert.alert("Music player", error instanceof Error ? error.message : "Unable to play music. Please try again."));
}
export function useNativeMusic() {
  const [status, setStatus] = useState(empty);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!nativeMusic) return;
    let active = true;
    const subscription = nativeMusic.addListener("status", (value) => { if (active) setStatus(value); });
    connection ??= nativeMusic.initialize().finally(() => { connection = null; });
    musicCommand(connection.then(() => nativeMusic!.getStatus()).then((value) => { if (active) { setStatus(value); setReady(true); } }));
    return () => { active = false; subscription.remove(); };
  }, []);
  return { status, ready };
}
