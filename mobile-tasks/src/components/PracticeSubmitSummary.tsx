import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, createThemedStyles } from "../theme";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function PracticeSubmitSummary({ title, count, attempted, seconds, elapsed, busy, onBack, onSubmit }: {
  title: string; count: number; attempted: number; seconds: number; elapsed: number; busy: boolean;
  onBack: () => void; onSubmit: () => void;
}) {
  return <View style={s.page}>
    <View style={s.header}><View><Text style={s.eyebrow}>BEFORE YOU SUBMIT</Text><Text accessibilityRole="header" style={s.title}>Session summary</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Back to questions" disabled={busy} onPress={onBack}><Text style={s.back}>Back</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.session}>{title}</Text>
        <Text style={s.total}>{attempted}<Text style={s.outOf}>/{count}</Text></Text>
        <Text style={s.muted}>Questions attempted</Text>
        <View style={s.track}><View style={[s.fill, { width: `${count ? attempted / count * 100 : 0}%` }]} /></View>
        <View style={s.stats}>{[["Total", count], ["Attempted", attempted], ["Unattempted", Math.max(0, count - attempted)]].map(([label, value]) => <View key={label} style={s.stat}><Text style={s.value}>{value}</Text><Text style={s.caption}>{label}</Text></View>)}</View>
      </View>
      <View style={s.card}><View style={s.time}><Text style={s.muted}>Time spent</Text><Text style={s.timeValue}>{clock(elapsed)}</Text></View><View style={s.time}><Text style={s.muted}>Time left</Text><Text style={s.timeValue}>{clock(seconds)}</Text></View></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Submit session" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={onSubmit} style={[s.primary, busy && s.disabled]}>{busy ? <ActivityIndicator color={colors.buttonInk} /> : <><MaterialCommunityIcons name="check" size={18} color={colors.buttonInk} /><Text style={s.primaryText}>Submit session</Text></>}</Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={s.secondary}><Text style={s.secondaryText}>Keep solving</Text></Pressable>
    </ScrollView>
  </View>;
}

const s = createThemedStyles({
  page: { flex: 1, backgroundColor: "transparent" },
  header: { padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4 },
  back: { color: colors.text, fontSize: 13, padding: 8 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  session: { color: colors.text, fontSize: 15, fontWeight: "700" },
  total: { color: colors.text, fontSize: 48, fontWeight: "800", marginTop: 24 },
  outOf: { color: colors.muted, fontSize: 25, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 13 },
  track: { height: 5, borderRadius: 3, backgroundColor: "#343434", marginTop: 20, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#f9fcf5", borderRadius: 3 },
  stats: { flexDirection: "row", marginTop: 20 },
  stat: { flex: 1 }, value: { color: colors.text, fontSize: 20, fontWeight: "700" },
  caption: { color: colors.muted, fontSize: 10, marginTop: 4 },
  time: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  timeValue: { color: colors.text, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  primary: { backgroundColor: colors.button, borderRadius: 16, minHeight: 50, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.buttonInk, fontSize: 14, fontWeight: "700" },
  secondary: { padding: 14, alignItems: "center" }, secondaryText: { color: colors.text, fontSize: 13, fontWeight: "600" }, disabled: { opacity: 0.6 },
});
