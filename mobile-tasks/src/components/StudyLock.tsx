import { effectiveStudySession, maxStudyBreaks, onStudyBreak, studyBreakState, studyTimerMilliseconds } from "../../../shared/study-breaks";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, Animated, Easing, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Line } from "react-native-svg";
import * as Crypto from "expo-crypto";
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { createStudyController, type StudyControl } from "../../../shared/study-controller";
import { emptyFocusDay, focusDayKey, formatFocusCountdown, formatFocusMinutes, formatFocusTime, todayFocusMilliseconds, type FocusDay } from "../../../shared/study-focus";
import { getFirebaseFirestore } from "../lib/firebase";
import { colors, useAppAccent } from "../theme";
import { accentInk } from "../domain/app-accent";
import { SlotTime } from "./SlotTime";
import { DeviceFocusSetup } from "./DeviceFocusSetup";
import { AnimatedTimeChips } from "./AnimatedTimeChips";
import { deviceFocusStatus, openDeviceFocusSettings, supportsDeviceFocus, syncDeviceFocusState } from "../lib/native-focus-lock";
import { clockValueFromPoint } from "../domain/clock-hand";
import { MAX_STUDY_WEBSITES } from "../../../shared/study-selection";
import { FocusSchedules } from "./FocusSchedules";

// Use the mobile app's SDK instance and native UUID source with the shared contract.
export const controller = createStudyController({ collection, doc, onSnapshot, runTransaction, serverTimestamp }, () => Crypto.randomUUID());
const remaining = (end: number, now: number) => {
  return formatFocusCountdown(end - now);
};
export function StudyLock({ uid, taskButton = false, openRequest = 0, onRequestOpened }: { uid: string; taskButton?: boolean; openRequest?: number; onRequestOpened?: () => void }) {
  const accent = useAppAccent();
  const [open, setOpen] = useState(false), [picking, setPicking] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const panelMotion = useRef(new Animated.Value(1)).current;
  useEffect(() => { if (!open) setSchedulesOpen(false); }, [open]);
  useEffect(() => { if (openRequest) { setOpen(true); onRequestOpened?.(); } }, [openRequest, onRequestOpened]);
  const [control, setControl] = useState<StudyControl | null>(null);
  const [now, setNow] = useState(Date.now()), [minutes, setMinutes] = useState(25);
  const [breakLimit, setBreakLimit] = useState(0);
  const maxBreaks = maxStudyBreaks(minutes);
  useEffect(() => setBreakLimit(value => Math.min(value, maxBreaks)), [maxBreaks]);
  const [appLimit, setAppLimit] = useState(2);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    panelMotion.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return;
    const animation = Animated.timing(panelMotion, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [schedulesOpen, reducedMotion, panelMotion]);
  const appLimitSlide = useRef(new Animated.Value(2 * 46)).current;
  useEffect(() => {
    if (reducedMotion) {
      appLimitSlide.setValue(appLimit * 46);
      return;
    }
    const animation = Animated.timing(appLimitSlide, {
      toValue: appLimit * 46,
      duration: 240,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [appLimit, appLimitSlide, reducedMotion]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [focusData, setFocusData] = useState<FocusDay>(emptyFocusDay);
  const date = focusDayKey(now, control?.session?.timeZone);
  useEffect(() => controller.watchStudyFocusDay(getFirebaseFirestore(), uid, date, setFocusData, () => setError("Could not load today's focus time.")), [uid, date]);
  useEffect(() => { void controller.publishStudyFocusDay(getFirebaseFirestore(), uid, date, control?.session?.timeZone, focusData.totalMilliseconds).catch(() => {}); }, [uid, date, focusData.totalMilliseconds]);
  const todayFocus = todayFocusMilliseconds(focusData, control?.session ?? null, now);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stopControl = () => {};
    const failed = () => { setError("Could not load your focus session. Please try again."); setReady(false); };
    try {
      const db = getFirebaseFirestore();
      stopControl = controller.watchStudyControl(db, uid, value => { setControl(value); setReady(true); }, failed);
    } catch { failed(); }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { stopControl(); clearInterval(timer); };
  }, [uid]);
  const candidate = control?.session ? effectiveStudySession(control.session, now) : null;
  const session = candidate && (candidate.paused || candidate.endsAt > now) ? candidate : null;
  const breaking = onStudyBreak(session, now);
  const breakState = session ? studyBreakState(session, now) : null;
  const canBreak = !breaking && (!!breakState?.available || session?.breakLimit === undefined);
  const breakLabel = breaking ? "Break · auto-resumes" : session?.breakLimit === undefined && session?.paused ? "Resume focus" : breakState?.available ? "Take a break · 10 min" : !breakState?.left ? "No breaks remaining" : `Break in ${Math.ceil((breakState?.waitMs ?? 0) / 60000)} min`;
  const domains = (session?.domains ?? control?.allowedDomains ?? []).slice(0, MAX_STUDY_WEBSITES);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (e) { const message = e instanceof Error ? e.message : ""; setError(/firebase|googleapis/i.test(message) || !message ? "Could not update your focus session. Please try again." : message); }
    finally { setBusy(false); }
  };
  const close = () => { if (picking) setPicking(false); else if (schedulesOpen) setSchedulesOpen(false); else setOpen(false); };
  const icon = (name: React.ComponentProps<typeof MaterialCommunityIcons>["name"], size = 17, tint = "#999") => <MaterialCommunityIcons name={name} size={size} color={tint} />;
  return <>
    {taskButton ? <Pressable accessibilityRole="button" accessibilityLabel={session ? "Open focus timer" : "Start Focus"} hitSlop={4} style={s.taskStart} onPress={() => setOpen(true)}>
      {icon("timer-outline", 17, "#111")}{session ? <View style={s.taskTimer}>
        <Text style={s.taskStartText}>{breaking ? "Break" : session.paused ? "Focus paused" : "Focus"} · </Text>
        <SlotTime value={remaining(now + studyTimerMilliseconds(session, now), now)} color="#111" size={14} weight="700" compact />
      </View> : <Text style={s.taskStartText}>Start Focus</Text>}
    </Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="Focus Lock" style={s.profileTrigger} onPress={() => setOpen(true)}>
      <View style={s.profileLock}>{icon("lock-outline", 18, session ? accent : "#eee")}{session && <ActiveLockDot color={accent} />}</View><Text style={s.profileLabel}>Focus Lock</Text>
      <View style={s.profileFocus}><Text style={s.profileFocusTime}>Today · </Text><SlotTime value={formatFocusTime(todayFocus)} color="#ddd" size={12} weight="600" compact /></View>
    </Pressable>}
    <Modal transparent visible={open} animationType="fade" statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close Focus Lock" onPress={close} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={s.dialog} contentContainerStyle={s.dialogContent}>
          <Animated.View style={{ opacity: panelMotion, transform: [{ translateY: panelMotion.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
          {schedulesOpen ? <>
            <View style={[s.heading,{justifyContent:"flex-start"}]}><Pressable accessibilityRole="button" accessibilityLabel="Back to Focus Lock" hitSlop={10} onPress={()=>setSchedulesOpen(false)}>{icon("arrow-left", 21)}</Pressable><Text accessibilityRole="header" style={s.title}>Schedules</Text></View>
            <FocusSchedules items={control?.focusSchedules??[]} now={now} saveSchedule={(draft,id)=>controller.saveFocusSchedule(getFirebaseFirestore(),uid,draft,id)} renderClock={(value,onSave,onCancel,title)=><StudyClock minutes={value} accent={accent} onSave={onSave} onCancel={onCancel} timeOfDay title={title} />} />
          </> : picking && !session ? <StudyClock minutes={minutes} accent={accent} onCancel={() => setPicking(false)} onSave={value => { setMinutes(value); setPicking(false); }} /> : <>
            <View style={s.heading}><Text accessibilityRole="header" style={s.title}>Focus Lock</Text><Pressable accessibilityRole="button" accessibilityLabel="Focus schedules" hitSlop={10} onPress={()=>setSchedulesOpen(true)}>{icon("calendar-clock-outline", 21)}</Pressable></View>
            {!ready && !error && <ActivityIndicator color={accent} />}
            <DeviceFocusSetup />
            {session ? <>
              <Text style={s.secondaryText}>{breaking ? "Break time" : "Focus time"}{session.breakLimit !== undefined ? ` · ${breakState?.left ?? 0} breaks left` : ""}</Text>
              <SlotTime value={remaining(now + studyTimerMilliseconds(session, now), now)} color={accent} />
              <Pressable accessibilityRole="button" accessibilityLabel={breakLabel} disabled={busy || !canBreak} style={[s.secondary, (busy || !canBreak) && { opacity: 0.45 }]} onPress={() => void run(() => session.paused ? controller.resumeStudySession(getFirebaseFirestore(), uid, "mobile") : controller.pauseStudySession(getFirebaseFirestore(), uid, "mobile"))}><Text style={s.secondaryText}>{breakLabel}</Text></Pressable>
            </> : <>
              <Pressable accessibilityRole="button" accessibilityLabel="Focus time" style={s.duration} disabled={busy} onPress={() => setPicking(true)}>{icon("clock-outline", 17)}<Text style={s.durationLabel}>Focus time</Text><View style={s.durationValue}><SlotTime value={formatFocusMinutes(minutes)} color="#eee" size={12} weight="600" compact /></View></Pressable>
              <AnimatedTimeChips options={[15, 30, 60, 90]} labels={[15, 30, 60, 90].map(formatFocusMinutes)} value={minutes} onChange={setMinutes} disabled={busy} color={accent} ink={accentInk(accent)} style={s.quickTimes} />
              <View style={s.breakCard}>
                <View style={s.breakCopy}><Text style={s.breakTitle}>Breaks</Text><Text style={s.breakHint}>10 min each · up to {maxBreaks}</Text></View>
                <View style={s.breakControls}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Fewer breaks" disabled={busy || breakLimit === 0} style={({ pressed }) => [s.breakButton, (busy || breakLimit === 0) && s.breakDisabled, pressed && s.breakPressed]} onPress={() => setBreakLimit(value => Math.max(0, value - 1))}><MaterialCommunityIcons name="minus" size={20} color="#f9fcf5" /></Pressable>
                  <View accessibilityLiveRegion="polite" style={s.breakCount}><SlotTime value={String(breakLimit)} color="#f9fcf5" size={18} weight="700" compact /></View>
                  <Pressable accessibilityRole="button" accessibilityLabel="More breaks" disabled={busy || breakLimit >= maxBreaks} style={({ pressed }) => [s.breakButton, (busy || breakLimit >= maxBreaks) && s.breakDisabled, pressed && s.breakPressed]} onPress={() => setBreakLimit(value => Math.min(maxBreaks, value + 1))}><MaterialCommunityIcons name="plus" size={20} color="#f9fcf5" /></Pressable>
                </View>
              </View>
              <View style={s.appLimitRow}>
                <Text style={s.durationLabel}>Allowed apps</Text>
                <View style={s.appLimitOptions}>
                  <Animated.View pointerEvents="none" style={[s.appLimitIndicator, { transform: [{ translateX: appLimitSlide }] }]} />
                  {[0, 1, 2].map(value => {
                    const range = [(value - 1) * 46, value * 46, (value + 1) * 46];
                    const selectedOpacity = appLimitSlide.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: "clamp" });
                    return (
                    <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} extra allowed apps`} accessibilityState={{ selected: appLimit === value, disabled: busy }} disabled={busy} onPress={() => setAppLimit(value)} style={s.appLimitOption}>
                      <Animated.View pointerEvents="none" accessible={false} style={{ transform: [{ scale: appLimitSlide.interpolate({ inputRange: range, outputRange: [1, 1.1, 1], extrapolate: "clamp" }) }] }}>
                        <Animated.Text style={[s.quickTimeText, { opacity: appLimitSlide.interpolate({ inputRange: range, outputRange: [1, 0, 1], extrapolate: "clamp" }) }]}>{value}</Animated.Text>
                        <Animated.Text style={[s.quickTimeText, s.appLimitSelectedText, { opacity: selectedOpacity }]}>{value}</Animated.Text>
                      </Animated.View>
                    </Pressable>
                    );
                  })}
                </View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Start Focus Lock" disabled={busy || !ready} style={[s.primary, (busy || !ready) && { opacity: 0.4 }]} onPress={() => void run(async () => {
                if (Platform.OS === "android" && supportsDeviceFocus && !(await deviceFocusStatus()).enabled) {
                  Alert.alert("Enable app blocking", "Turn on SSC Buddy Focus Lock in Accessibility settings, then return to start.", [
                    { text: "Not now", style: "cancel" },
                    { text: "Enable", onPress: () => { void openDeviceFocusSettings().catch(() => setError("Could not open Accessibility settings.")); } },
                  ]);
                  return;
                }
                const started = await controller.startStudySession(getFirebaseFirestore(), uid, minutes, domains, "mobile", appLimit, breakLimit);
                await syncDeviceFocusState(started, accent, "");
              })}>{busy ? <ActivityIndicator color="#111" /> : <Text style={s.primaryText}>Start Focus Lock</Text>}</Pressable>
            </>}
            {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          </>}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

function StudyClock({ minutes, accent, onCancel, onSave, timeOfDay=false, title="Focus time" }: { minutes: number; accent: string; onCancel: () => void; onSave: (value: number) => void; timeOfDay?:boolean; title?:string }) {
  const [hour, setHour] = useState(Math.floor(minutes / 60)), [minute, setMinute] = useState(minutes % 60);
  const [part, setPart] = useState<"hour" | "minute">(minutes < 60 ? "minute" : "hour"), [keyboard, setKeyboard] = useState(false);
  const selected = part === "hour" ? (timeOfDay ? hour % 12 : hour) : minute, angle = selected * (part === "hour" ? 30 : 6) * Math.PI / 180;
  const displayHour = timeOfDay ? hour % 12 || 12 : hour;
  const total = hour * 60 + minute, valid = timeOfDay ? total>=0&&total<1440 : total >= 1 && total <= 720;
  const choose = (value: number) => { if (part === "hour") setHour(timeOfDay?value%12+(hour>=12?12:0):value); else setMinute(value); };
  return <>
    <Text accessibilityRole="header" style={s.title}>{title}</Text>
    <View style={[s.digits,timeOfDay&&{gap:7}]}>
      {(["hour", "minute"] as const).map((field, index) => <View key={field} style={[s.digitGroup,timeOfDay&&{gap:7}]}>
        {index === 1 && <Text style={s.colon}>:</Text>}
        <View>{keyboard ? <TextInput accessibilityLabel={field === "hour" ? "Hours" : "Minutes"} keyboardType="number-pad" value={String(field === "hour" ? displayHour : minute)} onFocus={() => setPart(field)} onChangeText={value => {
          const next=Math.max(0,Math.min(field==="hour"?12:59,Number(value.replace(/\D/g,""))||0));
          if(field==="hour")setHour(timeOfDay?next%12+(hour>=12?12:0):next);else setMinute(next);
        }} style={[s.digit,timeOfDay&&{width:64},{color:"#fff"}]} /> : <Pressable accessibilityRole="button" accessibilityLabel={field === "hour" ? "Select hours" : "Select minutes"} onPress={()=>setPart(field)} style={[s.digit,timeOfDay&&{width:64},part===field&&{backgroundColor:accent}]}><Text style={[s.digitText,part===field&&{color:accentInk(accent)}]}>{String(field==="hour"?displayHour:minute).padStart(2,"0")}</Text></Pressable>}
          <Text style={s.digitLabel}>{field==="hour"?"Hours":"Minutes"}</Text>
        </View>
      </View>)}
      {timeOfDay&&<AnimatedTimeChips vertical options={[0,12]} labels={["AM","PM"]} value={hour>=12?12:0} onChange={value=>setHour(hour%12+value)} color="#f9fcf5" ink="#111" height={33} radius={0} gap={0} style={{width:48,height:66,alignSelf:"flex-start",borderRadius:12,overflow:"hidden",backgroundColor:"#202020"}} />}
    </View>
    {!keyboard && <View style={s.clock}>
      <Svg pointerEvents="none" width={220} height={220} style={StyleSheet.absoluteFill}><Line x1={110} y1={110} x2={110 + Math.sin(angle) * 82} y2={110 - Math.cos(angle) * 82} stroke={accent} strokeWidth={2} /><Circle cx={110} cy={110} r={4} fill={accent} /><Circle cx={110 + Math.sin(angle) * 82} cy={110 - Math.cos(angle) * 82} r={17} fill={accent} /></Svg>
      <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderGrant={event => { const value = clockValueFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, part); if (value !== null) choose(part === "hour" ? value % 12 : value); }} onResponderMove={event => { const value = clockValueFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, part); if (value !== null) choose(part === "hour" ? value % 12 : value); }} onResponderRelease={() => { if (part === "hour") setPart("minute"); }} />
      {Array.from({ length: 12 }, (_, index) => { const value = part === "hour" ? index : index * 5, label=timeOfDay&&part==="hour"&&value===0?12:value; return <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${label} ${part === "hour" ? "hours" : "minutes"}`} style={[s.clockNumber, { left: 110 + Math.sin(index * Math.PI / 6) * 82 - 17, top: 110 - Math.cos(index * Math.PI / 6) * 82 - 17 }]} onPress={() => { choose(value); if (part === "hour") setPart("minute"); }}><Text style={{ fontSize: 15, color: selected === value ? accentInk(accent) : "#eee" }}>{label}</Text></Pressable>; })}
    </View>}
    {!valid && <Text style={s.error}>Choose 1 minute to 12 hours.</Text>}
    <View style={s.clockActions}><Pressable accessibilityRole="button" accessibilityLabel={keyboard ? "Use clock" : "Use keyboard"} onPress={() => setKeyboard(!keyboard)}><MaterialCommunityIcons name={keyboard ? "clock-outline" : "keyboard-outline"} size={21} color="#aaa" /></Pressable><View style={{ flex: 1 }} /><Pressable accessibilityRole="button" onPress={onCancel}><Text style={[s.clockAction, { color: accent }]}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={!valid} onPress={() => onSave(total)}><Text style={[s.clockAction, { color: accent, opacity: valid ? 1 : 0.4 }]}>Save</Text></Pressable></View>
  </>;
}

function ActiveLockDot({ color }: { color: string }) {
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(phase, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [phase]);
  return <Animated.View accessible={false} pointerEvents="none" style={[s.activeLockDot, { backgroundColor: color, transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) }] }]} />;
}

const s = StyleSheet.create({
  breakCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12, borderRadius: 14, backgroundColor: "#191919" },
  breakCopy: { flex: 1 },
  breakTitle: { color: "#f9fcf5", fontSize: 12, fontWeight: "600" },
  breakHint: { color: "#929292", fontSize: 10, marginTop: 2 },
  breakControls: { flexDirection: "row", alignItems: "center", gap: 2 },
  breakButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#292929", alignItems: "center", justifyContent: "center" },
  breakDisabled: { opacity: 0.25 },
  breakPressed: { backgroundColor: "#3b3b3b", transform: [{ scale: 0.94 }] },
  breakCount: { minWidth: 28, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  taskStart: { alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, minWidth: 156, paddingHorizontal: 20, borderRadius: 24, backgroundColor: "#f9fcf5" },
  taskStartText: { color: "#111", fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  taskTimer: { flexDirection: "row", alignItems: "center" },
  appLimitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 },
  appLimitOptions: { flexDirection: "row", gap: 6, padding: 4, borderRadius: 24, backgroundColor: "#202020" },
  appLimitIndicator: { position: "absolute", left: 4, top: 4, width: 40, height: 36, borderRadius: 20, backgroundColor: colors.button },
  appLimitOption: { width: 40, minHeight: 36, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  appLimitSelectedText: { position: "absolute", top: 0, left: 0, right: 0, textAlign: "center", color: colors.buttonInk },
  quickTimes: { flexDirection: "row", gap: 8, marginBottom: 16 },
  quickTime: { flex: 1, minHeight: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#202020" },
  quickTimeText: { color: "#c6c6c6", fontSize: 12, fontWeight: "600" },
  profileLock: { flexDirection: "row", alignItems: "center", gap: 3 },
  activeLockDot: { width: 4, height: 4, borderRadius: 2 },
  profileFocusTime: { color: "#ddd", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  profileFocus: { marginLeft: "auto", flexDirection: "row", alignItems: "center" },
  profileTrigger: { flexDirection: "row", alignItems: "center", gap: 9, padding: 15, borderRadius: 18, backgroundColor: "#1b1b1b", marginTop: 12 }, profileLabel: { color: "#fafaf7", fontSize: 13, fontWeight: "600" }, profileHint: { marginLeft: "auto", color: "#888", fontSize: 11 },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 12, backgroundColor: "#000b" }, dialog: { flexGrow: 0, width: "100%", maxWidth: 365, maxHeight: "92%", borderRadius: 24, backgroundColor: "#000" }, dialogContent: { padding: 18 }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, title: { color: "#fafaf7", fontSize: 17, fontWeight: "700" },
  connection: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, marginTop: 10, marginBottom: 18, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 20, backgroundColor: "#ffffff08" }, connectionText: { color: "#999", fontSize: 10 }, dot: { width: 5, height: 5, borderRadius: 3 }, liveTime: { fontSize: 48, fontWeight: "700", textAlign: "center", marginVertical: 16, fontVariant: ["tabular-nums"] },
  duration: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#242424", borderRadius: 14, padding: 13, marginVertical: 12 }, durationLabel: { color: "#ddd", fontSize: 12 }, durationValue: { marginLeft: "auto", color: "#eee", fontSize: 12, fontWeight: "600" }, primary: { alignItems: "center", justifyContent: "center", minHeight: 40, borderRadius: 24, backgroundColor: "#f9fcf5", padding: 11, marginTop: 4 }, primaryText: { color: "#111", fontSize: 12, fontWeight: "700" }, secondary: { alignItems: "center", justifyContent: "center", minHeight: 40, borderRadius: 24, backgroundColor: "#242424", padding: 11, marginTop: 12 }, secondaryText: { color: "#fafaf7", fontSize: 12, fontWeight: "700" }, error: { color: "#ff8495", fontSize: 11, lineHeight: 17, marginTop: 9 },
  digits: { flexDirection: "row", justifyContent: "center", marginTop: 20, marginBottom: 18, gap: 9 }, digitGroup: { flexDirection: "row", alignItems: "flex-start", gap: 9 }, digit: { width: 82, height: 66, borderRadius: 12, backgroundColor: "#333", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 36, fontWeight: "700" }, digitText: { color: "#fff", fontSize: 36, fontWeight: "700" }, digitLabel: { color: "#999", fontSize: 10, marginTop: 6, textAlign: "center" }, colon: { color: "#ccc", fontSize: 36, lineHeight: 66 }, clock: { width: 220, height: 220, borderRadius: 110, backgroundColor: "#333", alignSelf: "center" }, clockNumber: { position: "absolute", width: 34, height: 34, alignItems: "center", justifyContent: "center" }, clockActions: { flexDirection: "row", alignItems: "center", gap: 22, marginTop: 20, paddingVertical: 8 }, clockAction: { fontSize: 14, fontWeight: "600" },
});
