import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import { usePreviousWeeklyAward } from "../hooks/use-weekly-results";
import { leaderboardWeekLabel, weeklyAwardSeenKey } from "../domain/weekly-results";
import { CelebrationFireworks } from "./CelebrationFireworks";
import { CELEBRATION_PREVIEW, CELEBRATION_PREVIEW_ID, CELEBRATION_PREVIEW_RANK } from "../domain/celebration-preview";
import { leaderboardWeek, shiftLeaderboardWeek } from "../domain/weekly-results";

const medals = [require("../../assets/gold-medal.png"), require("../../assets/silver-medal.png"), require("../../assets/bronze-medal.png")];
export function WeeklyAwardCelebration({ uid, enabled }: { uid: string; enabled: boolean }) {
  const earnedAward = usePreviousWeeklyAward(uid);
  const award = CELEBRATION_PREVIEW ? { rank: CELEBRATION_PREVIEW_RANK, points: 0, week: shiftLeaderboardWeek(leaderboardWeek(), -1) } : earnedAward;
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const key = CELEBRATION_PREVIEW ? `${CELEBRATION_PREVIEW_ID}:${uid}` : award ? weeklyAwardSeenKey(uid, award.week) : null;
  useEffect(() => {
    let active = true;
    setVisibleKey(null);
    if (key) void AsyncStorage.getItem(key).then((seen) => { if (active && !seen) setVisibleKey(key); }).catch(() => { if (active) setVisibleKey(key); });
    return () => { active = false; };
  }, [key]);
  if (!award) return null;
  const close = () => { if (key) void AsyncStorage.setItem(key, "1").catch(() => undefined); setVisibleKey(null); };
  return <Modal transparent animationType="fade" visible={enabled && key === visibleKey} onRequestClose={close}><View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,.88)" }}>{enabled && key === visibleKey && <CelebrationFireworks />}<View style={{ borderRadius: 24, padding: 28, alignItems: "center", backgroundColor: "#1c1c1c", borderWidth: 1, borderColor: "#786037" }}>
    <Image source={medals[award.rank - 1]} style={{ width: 100, height: 100, resizeMode: "contain" }} />
    <Text style={{ color: "#fcd34d", fontSize: 12, fontWeight: "800", marginTop: 18 }}>{CELEBRATION_PREVIEW ? "SILVER CELEBRATION PREVIEW" : "WEEKLY PODIUM"}</Text>
    <Text style={{ color: "#fafafa", fontSize: 26, fontWeight: "800", marginTop: 8 }}>You finished #{award.rank}!</Text>
    <Text style={{ color: "#a1a1aa", fontSize: 12, marginTop: 10, textAlign: "center" }}>{leaderboardWeekLabel(award.week)}</Text>
    <Text style={{ color: "#d4d4d8", fontSize: 14, marginTop: 12, textAlign: "center" }}>{CELEBRATION_PREVIEW ? "Preview only · Your actual rank is unchanged." : `${award.points} points · Your weekly medal is on your profile.`}</Text>
    <Pressable onPress={close} style={{ alignSelf: "stretch", alignItems: "center", borderRadius: 12, padding: 14, backgroundColor: "#fde68a", marginTop: 24 }}><Text style={{ color: "#18181b", fontWeight: "800" }}>Celebrate & continue</Text></Pressable>
  </View></View></Modal>;
}
