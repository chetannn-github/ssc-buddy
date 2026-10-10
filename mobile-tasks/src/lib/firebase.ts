import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { Platform } from "react-native";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

let auth: Auth | null = null;

export function getFirebaseAuth() {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured on this device.");
  if (auth) return auth;

  const app = getApps().length ? getApp() : initializeApp(config);
  try {
    if (Platform.OS === "web") {
      auth = getAuth(app);
    } else {
      // Metro resolves `firebase/auth` to Firebase's React-Native bundle at runtime.
      // Its RN-only helper is intentionally not exposed in the web TypeScript declarations.
      const getReactNativePersistence = (
        FirebaseAuth as unknown as {
          getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
        }
      ).getReactNativePersistence;
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage) as NonNullable<
          Parameters<typeof initializeAuth>[1]
        >["persistence"],
      });
    }
  } catch {
    // Fast Refresh may have already initialized Auth in this JavaScript runtime.
    auth = getAuth(app);
  }
  return auth;
}

export function observeSession(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function continueWithEmail(email: string, password: string) {
  const firebaseAuth = getFirebaseAuth();
  try {
    return (await signInWithEmailAndPassword(firebaseAuth, email, password)).user;
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    return (await createUserWithEmailAndPassword(firebaseAuth, email, password)).user;
  }
}

export async function logout() {
  await signOut(getFirebaseAuth());
}
