import { createThemedStyles } from "../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import { ActivityIndicator, Image, ImageBackground, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useEffect, useRef, useState } from "react";

import { continueWithEmail, continueWithGoogleIdToken, isFirebaseConfigured } from "../lib/firebase";
import { colors } from "../theme";

const authImage = require("../../assets/auth.jpg");
const googleImage = require("../../assets/google.png");

type Props = { onAuthenticated: () => void };

export function AuthScreen({ onAuthenticated }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    androidClientId: androidClientId || undefined,
    iosClientId: iosClientId || undefined,
    webClientId: webClientId || undefined,
    selectAccount: true,
  });
  const schedulePasswordHide = () => {
    if (passwordHideTimer.current) clearTimeout(passwordHideTimer.current);
    passwordHideTimer.current = setTimeout(() => setShowPassword(false), 6500);
  };
  useEffect(() => () => { if (passwordHideTimer.current) clearTimeout(passwordHideTimer.current); }, []);

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== "success") {
      if (googleResponse.type === "error") setMessage("Google sign-in was not completed. Please try again.");
      return;
    }
    const idToken = googleResponse.params.id_token;
    if (!idToken) {
      setMessage("Google did not return an identity token. Check the OAuth client configuration.");
      return;
    }
    setLoading(true);
    setMessage("");
    void continueWithGoogleIdToken(idToken)
      .then(() => onAuthenticated())
      .catch((error) => setMessage(authErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [googleResponse, onAuthenticated]);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setMessage("");
    try {
      await continueWithEmail(email.trim(), password, mode === "signup");
      onAuthenticated();
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.page, !compact && styles.pageWide]}>
      {compact && (
        <>
          <Image source={authImage} style={styles.mobileBackground} />
          <View pointerEvents="none" style={styles.mobileScrim} />
        </>
      )}
      {!compact && (
        <ImageBackground source={authImage} style={styles.visual} imageStyle={styles.visualImage}>
          <View style={styles.visualOverlay} />
          <View style={styles.visualContent}>
            <Brand />
            <View>
              <Text style={styles.kicker}>YOUR PREPARATION, IN SYNC</Text>
              <Text style={styles.heroTitle}>Study anywhere.{"\n"}Pick up exactly where you left off.</Text>
              <Text style={styles.heroCopy}>Your practice, tracker, favourites and progress stay private to your account.</Text>
            </View>
            <Text style={styles.footerCopy}>Built for focused SSC preparation.</Text>
          </View>
        </ImageBackground>
      )}
      <View style={[styles.formSide, compact && styles.formCompact]}>
        {compact && <Brand />}
        <Text style={styles.kicker}>YOUR PRIVATE WORKSPACE</Text>
        <Text style={styles.heading}>{mode === "signin" ? "Welcome back" : "Create your account"}</Text>
        <Text style={styles.description}>
          {mode === "signin"
            ? "Sign in to continue your preparation."
            : "Use your email and password to create a private workspace."}
        </Text>
        {!isFirebaseConfigured ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>Add Firebase values to mobile-tasks/.env before signing in.</Text>
          </View>
        ) : (
          <>
            <View style={styles.form}>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor={colors.subdued}
                style={styles.input}
                value={email}
                onChangeText={setEmail}
              />
              <View>
                <TextInput
                  autoComplete="password"
                  placeholder="Password"
                  placeholderTextColor={colors.subdued}
                  secureTextEntry={!showPassword}
                  style={[styles.input, styles.password]}
                  value={password}
                  onChangeText={(value) => { setPassword(value); if (showPassword) schedulePasswordHide(); }}
                  onSubmitEditing={() => void submit()}
                />
                <Pressable style={styles.eye} onPress={() => { if (showPassword) { if (passwordHideTimer.current) clearTimeout(passwordHideTimer.current); setShowPassword(false); } else { setShowPassword(true); schedulePasswordHide(); } }} hitSlop={10}>
                  <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              </View>
              {!!message && <Text style={styles.authError}>{message}</Text>}
              <Pressable disabled={loading} style={[styles.continue, loading && styles.disabled]} onPress={() => void submit()}>
                {loading ? <ActivityIndicator size="small" color={colors.accentDeep} /> : <Text style={styles.continueText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>}
              </Pressable>
            </View>
            <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>OR</Text><View style={styles.dividerLine} /></View>
            <Pressable
              disabled={loading || !googleRequest}
              style={[styles.google, (loading || !googleRequest) && styles.disabled]}
              onPress={() => {
                const configured = Platform.OS === "ios" ? iosClientId : androidClientId;
                if (!configured) {
                  setMessage(`Google sign-in is not configured for ${Platform.OS === "ios" ? "iOS" : "Android"} yet.`);
                  return;
                }
                setMessage("");
                void promptGoogle();
              }}
            >
              <Image source={googleImage} style={styles.googleIcon} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={() => {
                setMode((current) => (current === "signin" ? "signup" : "signin"));
                setMessage("");
              }}
              style={styles.modeSwitch}
            >
              <Text style={styles.modeSwitchText}>
                {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/missing-password": "Enter your password to continue.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/email-already-in-use": "An account with this email already exists. Please sign in.",
    "auth/invalid-credential": "Email or password is incorrect. Please try again.",
    "auth/user-not-found": "No account found for this email. Create an account first.",
    "auth/wrong-password": "Password is incorrect. Please try again.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network issue. Check your internet connection and try again.",
  };
  return messages[code] ?? "Could not continue. Please try again.";
}

function Brand() {
  return <View style={styles.brand}><Image source={authImage} style={styles.brandIcon} /><Text style={styles.brandText}>SSC Buddy</Text></View>;
}

const styles = createThemedStyles({
  page: { flex: 1, backgroundColor: "transparent" }, pageWide: { flexDirection: "row" },
  mobileBackground: { ...StyleSheet.absoluteFill, width: "100%", height: "100%", opacity: 0.13 },
  mobileScrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,16,16,0.73)" },
  visual: { flex: 1, minHeight: 580, backgroundColor: "#171717" }, visualImage: { opacity: 0.35 },
  visualOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,16,16,0.56)" },
  visualContent: { flex: 1, justifyContent: "space-between", padding: 46 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 }, brandIcon: { height: 40, width: 40, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,.14)" }, brandText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  kicker: { color: colors.accent, fontSize: 10, letterSpacing: 1.8, fontWeight: "800", marginTop: 34 },
  heroTitle: { color: colors.text, marginTop: 16, fontSize: 43, lineHeight: 50, fontWeight: "700", letterSpacing: -1 }, heroCopy: { color: colors.muted, maxWidth: 430, marginTop: 18, fontSize: 16, lineHeight: 25 }, footerCopy: { color: colors.subdued, fontSize: 13 },
  formSide: { flex: 1, justifyContent: "center", paddingHorizontal: 60, backgroundColor: colors.background }, formCompact: { paddingHorizontal: 26, backgroundColor: "transparent" },
  heading: { color: colors.text, marginTop: 7, fontSize: 30, fontWeight: "700", letterSpacing: -0.5 }, description: { color: colors.muted, marginTop: 8, fontSize: 14, lineHeight: 21, maxWidth: 350 },
  warning: { marginTop: 25, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: "rgba(251,191,36,0.25)", backgroundColor: "rgba(251,191,36,0.10)" }, warningText: { color: "#fde68a", fontSize: 13, lineHeight: 19 },
  form: { marginTop: 27, gap: 13 }, input: { height: 50, borderRadius: 25, borderWidth: 1, borderColor: "#303030", paddingHorizontal: 19, color: colors.text, backgroundColor: "rgba(255,255,255,0.04)", fontSize: 14 }, password: { paddingRight: 54 }, eye: { position: "absolute", right: 18, top: 14 },
  continue: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.button }, continueText: { color: colors.buttonInk, fontSize: 14, fontWeight: "800" }, disabled: { opacity: 0.58 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 19 }, dividerLine: { flex: 1, height: 1, backgroundColor: "#303030" }, dividerText: { color: colors.subdued, fontSize: 10, fontWeight: "700" },
  google: { height: 50, borderRadius: 25, borderWidth: 1, borderColor: "#303030", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, backgroundColor: "rgba(255,255,255,0.04)" }, googleIcon: { width: 17, height: 17 }, googleText: { color: colors.text, fontSize: 14, fontWeight: "600" }, authError: { marginTop: -3, color: "#fca5a5", fontSize: 12, lineHeight: 17 },
  modeSwitch: { alignSelf: "center", marginTop: 19, padding: 5 }, modeSwitchText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
});
