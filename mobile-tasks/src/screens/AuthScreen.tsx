import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, ImageBackground, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useState } from "react";

import { continueWithEmail, isFirebaseConfigured } from "../lib/firebase";
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setMessage("");
    try {
      await continueWithEmail(email.trim(), password);
      onAuthenticated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message.replace("Firebase: ", "") : "Could not continue.");
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
        <Text style={styles.heading}>Continue to SSC Buddy</Text>
        <Text style={styles.description}>Sign in if you already have an account. Otherwise, we’ll create one for you.</Text>
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
                  onChangeText={setPassword}
                  onSubmitEditing={() => void submit()}
                />
                <Pressable style={styles.eye} onPress={() => setShowPassword((visible) => !visible)} hitSlop={10}>
                  <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              </View>
              <Pressable disabled={loading} style={[styles.continue, loading && styles.disabled]} onPress={() => void submit()}>
                <Text style={styles.continueText}>Continue</Text>
              </Pressable>
            </View>
            <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>OR</Text><View style={styles.dividerLine} /></View>
            <Pressable disabled={loading} style={[styles.google, loading && styles.disabled]} onPress={() => setMessage("Google sign-in will be enabled after Google OAuth client IDs are added to .env.")}>
              <Image source={googleImage} style={styles.googleIcon} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
            {!!message && <Text style={styles.message}>{message}</Text>}
          </>
        )}
      </View>
      {loading && <View style={styles.loadingLayer}><View style={styles.loadingCard}><MaterialCommunityIcons name="loading" size={26} color={colors.accent} /><Text style={styles.loadingText}>Securing your workspace…</Text></View></View>}
    </View>
  );
}

function Brand() {
  return <View style={styles.brand}><View style={styles.brandIcon}><MaterialCommunityIcons name="school-outline" size={21} color={colors.accent} /></View><Text style={styles.brandText}>SSC Buddy</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, pageWide: { flexDirection: "row" },
  mobileBackground: { ...StyleSheet.absoluteFill, width: "100%", height: "100%", opacity: 0.13 },
  mobileScrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,16,16,0.73)" },
  visual: { flex: 1, minHeight: 580, backgroundColor: "#171717" }, visualImage: { opacity: 0.35 },
  visualOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,16,16,0.56)" },
  visualContent: { flex: 1, justifyContent: "space-between", padding: 46 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 }, brandIcon: { height: 40, width: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(94,234,212,0.12)" }, brandText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  kicker: { color: colors.accent, fontSize: 10, letterSpacing: 1.8, fontWeight: "800", marginTop: 34 },
  heroTitle: { color: colors.text, marginTop: 16, fontSize: 43, lineHeight: 50, fontWeight: "700", letterSpacing: -1 }, heroCopy: { color: colors.muted, maxWidth: 430, marginTop: 18, fontSize: 16, lineHeight: 25 }, footerCopy: { color: colors.subdued, fontSize: 13 },
  formSide: { flex: 1, justifyContent: "center", paddingHorizontal: 60, backgroundColor: colors.background }, formCompact: { paddingHorizontal: 26, backgroundColor: "transparent" },
  heading: { color: colors.text, marginTop: 7, fontSize: 30, fontWeight: "700", letterSpacing: -0.5 }, description: { color: colors.muted, marginTop: 8, fontSize: 14, lineHeight: 21, maxWidth: 350 },
  warning: { marginTop: 25, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: "rgba(251,191,36,0.25)", backgroundColor: "rgba(251,191,36,0.10)" }, warningText: { color: "#fde68a", fontSize: 13, lineHeight: 19 },
  form: { marginTop: 27, gap: 13 }, input: { height: 50, borderRadius: 25, borderWidth: 1, borderColor: "#303030", paddingHorizontal: 19, color: colors.text, backgroundColor: "rgba(255,255,255,0.04)", fontSize: 14 }, password: { paddingRight: 54 }, eye: { position: "absolute", right: 18, top: 14 },
  continue: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent }, continueText: { color: colors.accentDeep, fontSize: 14, fontWeight: "800" }, disabled: { opacity: 0.58 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 19 }, dividerLine: { flex: 1, height: 1, backgroundColor: "#303030" }, dividerText: { color: colors.subdued, fontSize: 10, fontWeight: "700" },
  google: { height: 50, borderRadius: 25, borderWidth: 1, borderColor: "#303030", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, backgroundColor: "rgba(255,255,255,0.04)" }, googleIcon: { width: 17, height: 17 }, googleText: { color: colors.text, fontSize: 14, fontWeight: "600" }, message: { color: "#fcd34d", marginTop: 14, textAlign: "center", fontSize: 13 },
  loadingLayer: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,16,16,0.88)", alignItems: "center", justifyContent: "center" }, loadingCard: { alignItems: "center", gap: 11, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 28, paddingVertical: 24 }, loadingText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
