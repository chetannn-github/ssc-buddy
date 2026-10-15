import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseFirestore, readPublicProfile, type PublicProfile } from "../lib/firebase";
import { colors } from "../theme";
import { avatarAssets, ProfileScreen } from "./ProfileScreen";

const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const week = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
};
const medalAssets = [
  require("../../assets/gold-medal.png"),
  require("../../assets/silver-medal.png"),
  require("../../assets/bronze-medal.png"),
];
const dateLabel = (date: string) =>
  date === dayKey()
    ? "Today"
    : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

function DayFilter({
  dates,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  dates: string[];
  value: string;
  onChange: (date: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (open) {
      setMounted(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [open, progress]);
  const choose = (date: string) => {
    onChange(date);
    onOpenChange(false);
  };
  return (
    <View style={s.filterWrap}>
      <Pressable style={[s.filter, open && s.filterOpen]} onPress={() => onOpenChange(!open)}>
        <Text numberOfLines={1} style={s.filterText}>
          {dateLabel(value)}
        </Text>
        <Animated.View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <MaterialCommunityIcons name="chevron-down" size={17} color={colors.muted} />
        </Animated.View>
      </Pressable>
      {mounted && (
        <Animated.View
          style={[
            s.menu,
            {
              opacity: progress,
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-7, 0] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          {dates.map((date) => {
            const selected = date === value;
            return (
              <Pressable
                key={date}
                onPress={() => choose(date)}
                style={[s.menuItem, selected && s.menuItemSelected]}
              >
                <Text style={[s.menuText, selected && s.menuTextSelected]}>{dateLabel(date)}</Text>
                {selected && <MaterialCommunityIcons name="check" size={16} color="#171717" />}
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

function PublicProfileView({ entry, onBack, onOpenWeeklyStats, viewerUser, viewerTasks }: { entry: any; onBack: () => void; onOpenWeeklyStats: () => void; viewerUser: User | null; viewerTasks: any[] }) {
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  useEffect(() => { let active = true; void readPublicProfile(String(entry.username ?? "")).then((next) => { if (active) setProfile(next); }).catch(() => { if (active) setProfile(null); }); return () => { active = false; }; }, [entry.username]);
  if (profile === undefined) return <View style={s.page}><View style={s.header}><Pressable onPress={onBack}><MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} /></Pressable><Text style={s.title}>Profile</Text><View style={{ width: 24 }} /></View><View style={s.loadingProfile}><ActivityIndicator size="small" color="#86efac" /><Text style={s.sub}>Loading profile…</Text></View></View>;
  const isOwnProfile = entry.uid === viewerUser?.uid;
  if (!profile && !isOwnProfile) return <View style={s.page}><View style={s.header}><Pressable onPress={onBack}><MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} /></Pressable><Text style={s.title}>Profile</Text><View style={{ width: 24 }} /></View><View style={s.loadingProfile}><Text style={s.sub}>This profile is no longer available.</Text></View></View>;
  const shown = profile ?? entry;
  const activeDates = new Set(Object.keys(profile?.activity ?? {}).filter((date) => Number(profile?.activity?.[date]) > 0));
  // Older shared profiles may not yet have an activity aggregate. Rebuild the
  // streak from the same dashboard data used by their visible stats.
  (profile?.dashboard?.records ?? []).forEach((record: any) => {
    if (typeof record?.date === "string") activeDates.add(record.date.slice(0, 10));
  });
  const sharedTracker: any = profile?.dashboard?.tracker;
  (Array.isArray(sharedTracker?.activity) ? sharedTracker.activity : []).forEach((entry: any) => {
    if (typeof entry?.date === "string") activeDates.add(entry.date.slice(0, 10));
  });
  (Array.isArray(sharedTracker?.tests?.log) ? sharedTracker.tests.log : []).forEach((test: any) => {
    if (typeof test?.date === "string") activeDates.add(test.date.slice(0, 10));
  });
  (profile?.dashboard?.dailyTasks ?? []).filter((task: any) => task?.completed).forEach((task: any) => {
    const date = task.completedAt ?? task.date;
    if (typeof date === "string") activeDates.add(date.slice(0, 10));
  });
  let streak = 0;
  for (let cursor = new Date(), index = 0; ; index += 1) { const key = dayKey(cursor); if (!activeDates.has(key)) { if (index === 0) { cursor.setDate(cursor.getDate() - 1); continue; } break; } streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return <ProfileScreen user={isOwnProfile ? viewerUser : null} tasks={(isOwnProfile ? viewerTasks : profile?.dashboard?.dailyTasks ?? []) as any} profileSettings={{ name: shown.name, username: shown.username, questionGoal: shown.questionGoal, avatar: shown.avatar, examName: shown.examName, practiceSessionEnabled: shown.practiceSessionEnabled !== false, trackProgressEnabled: shown.trackProgressEnabled !== false } as any} onProfileSaved={() => undefined} onLogout={() => undefined} onOpenVideo={() => undefined} onOpenMusic={() => undefined} onOpenTracker={() => undefined} onOpenLeaderboard={onOpenWeeklyStats} streak={streak} readOnly onBack={onBack} publicDashboard={profile?.dashboard} publicActivity={isOwnProfile || profile?.dashboard ? undefined : profile?.activity} publicRank={entry.leaderboardRank} />;
}

export function LeaderboardScreen({ onClose, user, tasks: viewerTasks = [] }: { onClose: () => void; user: User | null; tasks?: any[] }) {
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(dayKey());
  const [publicEntry, setPublicEntry] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const [dayFilterOpen, setDayFilterOpen] = useState(false);
  useEffect(() => {
    setIsSyncing(true);
    return onSnapshot(
      collection(getFirebaseFirestore(), "leaderboards", week(), "entries"),
      (snapshot) => {
        setRows(
          snapshot.docs
            .map((doc) => doc.data())
            .sort((a, b) => b.points - a.points || b.studyMinutes - a.studyMinutes),
        );
        setIsSyncing(false);
      },
      () => setIsSyncing(false),
    );
  }, []);
  const tasks = useMemo(
    () =>
      selected?.leaderboardTasks ??
      (selected?.completedTasks ?? []).map((task: any) => ({
        ...task,
        completed: true,
        date: dayKey(),
        points: 10,
      })),
    [selected],
  );
  const dates = useMemo(
    () =>
      Array.from(new Set([dayKey(), ...tasks.map((task: any) => task.date).filter(Boolean)]))
        .sort()
        .reverse(),
    [tasks],
  );
  if (publicEntry) return <PublicProfileView entry={publicEntry} viewerUser={user} viewerTasks={viewerTasks} onBack={() => setPublicEntry(null)} onOpenWeeklyStats={() => { setSelected(publicEntry); setSelectedDate(dayKey()); setPublicEntry(null); }} />;
  if (selected) {
    const hours = Math.floor((selected.studyMinutes || 0) / 60),
      mins = (selected.studyMinutes || 0) % 60;
    const studyTimeLabel = hours ? `${hours}h${mins ? ` ${mins}m` : ""}` : `${mins}m`;
    const rank = rows.findIndex((row) => row.uid === selected.uid) + 1;
    const medal = medalAssets[rank - 1];
    const tasksForDay = tasks.filter((task: any) => task.date === selectedDate);
    const taskList = tasksForDay.length ? (
      tasksForDay.map((task: any, index: number) => {
        const meta = [task.subject, task.type, task.minutesSpent ? `${task.minutesSpent}m` : ""]
          .filter(Boolean)
          .join(" · ");
        return (
          <View key={`${task.name}-${index}`} style={s.task}>
            <MaterialCommunityIcons
              name={task.completed ? "check-circle" : "close-circle"}
              size={16}
              color={task.completed ? "#86efac" : "#fca5a5"}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>
                {task.name}
              </Text>
              {meta ? <Text style={s.sub}>{meta}</Text> : null}
            </View>
            <Text
              style={[
                s.taskPoints,
                task.points < 0 ? s.taskPenalty : task.points === 0 ? s.taskNeutral : undefined,
              ]}
            >
              {task.points > 0
                ? `+${task.points}`
                : task.points < 0
                  ? `−${Math.abs(task.points)}`
                  : "0"}{" "}
              pts
            </Text>
          </View>
        );
      })
    ) : (
      <Text style={s.sub}>No tasks for this day.</Text>
    );
    return (
      <View style={s.page}>
        <View style={s.header}>
          <Pressable onPress={() => setSelected(null)}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={s.title}>Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView
          onTouchStart={() => {
            if (dayFilterOpen) setDayFilterOpen(false);
          }}
          contentContainerStyle={s.profile}
        >
          <View style={s.detailProfileHeader}>
            <View style={s.avatarRankLine}>
              <Pressable style={s.bigAvatar} onPress={() => setPublicEntry({ ...selected, leaderboardRank: rank })}>
                {selected.avatar && avatarAssets[selected.avatar] ? (
                  <Image source={avatarAssets[selected.avatar]} style={s.bigImage} />
                ) : (
                  <Text style={s.bigAvatarText}>
                    {String(selected.name || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </Text>
                )}
              </Pressable>
              <View style={[s.profileRank, s.detailRank]}>{medal ? <Image source={medal} style={s.profileMedal} /> : null}<Text style={s.profileRankText}>#{rank}</Text></View>
            </View>
            <Pressable style={s.detailIdentity} onPress={() => setPublicEntry({ ...selected, leaderboardRank: rank })}><Text style={s.profileName}>{selected.name}</Text><Text style={[s.sub, s.centeredUsername]}>@{selected.username}</Text></Pressable>
          </View>
          <View style={s.profileStats}>
            <View>
              <Text style={s.profileValue}>{selected.points}</Text>
              <Text style={s.sub}>Points</Text>
            </View>
            <View>
              <Text style={s.profileValue}>{selected.completed}</Text>
              <Text style={s.sub}>Completed</Text>
            </View>
            <View>
              <Text style={s.profileValue}>{studyTimeLabel}</Text>
              <Text style={s.sub}>Study time</Text>
            </View>
          </View>
          <View style={s.tasks}>
            <View style={{ alignItems: "flex-end", marginBottom: 9 }}>
              <DayFilter
                dates={dates}
                value={selectedDate}
                onChange={setSelectedDate}
                open={dayFilterOpen}
                onOpenChange={setDayFilterOpen}
              />
            </View>
            {taskList}
          </View>
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={s.page}>
      <View style={s.header}>
        <Pressable onPress={onClose}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Weekly leaderboard</Text>
        <View style={{ width: 24 }} />
      </View>
      {isSyncing ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator size="small" color="#86efac" />
          <Text style={s.sub}>Syncing leaderboard…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          {rows.map((row, index) => (
            <View key={row.uid} style={s.row}>
              <Pressable onPress={() => setSelected(row)} style={s.rankPress}>{index < 3 ? <Image source={medalAssets[index]} style={s.medal} /> : <Text style={s.rank}>#{index + 1}</Text>}</Pressable>
              <Pressable style={s.publicIdentity} onPress={() => { setSelected(row); setSelectedDate(dayKey()); }}><View style={s.avatar}>
                {row.avatar && avatarAssets[row.avatar] ? (
                  <Image source={avatarAssets[row.avatar]} style={s.avatarImage} />
                ) : (
                  <Text style={s.avatarText}>
                    {String(row.name || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </Text>
                )}
              </View><View style={{ flex: 1 }}>
                <Text style={s.name}>{row.uid === user?.uid ? "You" : row.name}</Text>
                <Text style={s.sub}>
                  {row.completed} completed · {row.studyMinutes} min study
                </Text>
              </View></Pressable>
              <Pressable onPress={() => setSelected(row)}><Text style={s.points}>{row.points}</Text></Pressable>
            </View>
          ))}
          {!rows.length && <Text style={s.empty}>No activity this week yet.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  body: { padding: 16, gap: 9 },
  sub: { color: colors.subdued, fontSize: 12 },
  you: { color: "#7dd3fc", fontSize: 10, fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankPress: { width: 30, alignItems: "center" },
  publicIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  rank: { width: 30, color: "#a1a1aa", fontWeight: "800" },
  medal: { width: 26, height: 26, resizeMode: "contain" },
  avatar: {
    height: 34,
    width: 34,
    borderRadius: 17,
    backgroundColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { color: colors.text, fontWeight: "800" },
  name: { color: colors.text, fontWeight: "700" },
  points: { color: "#86efac", fontWeight: "800", fontSize: 16 },
  empty: { color: colors.subdued, textAlign: "center", marginTop: 45 },
  profile: { alignItems: "center", padding: 30 },
  detailProfileHeader: { alignSelf: "stretch", alignItems: "center" },
  avatarRankLine: { alignSelf: "stretch", alignItems: "center", justifyContent: "center", position: "relative" },
  detailIdentity: { alignItems: "center" },
  centeredUsername: { textAlign: "center" },
  publicProfile: { alignItems: "center", padding: 24, paddingBottom: 42 },
  bigAvatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  bigImage: { width: "100%", height: "100%" },
  bigAvatarText: { color: colors.text, fontSize: 32, fontWeight: "800" },
  profileName: { color: colors.text, fontSize: 23, fontWeight: "800", marginTop: 15 },
  publicExam: { color: colors.muted, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginTop: 14 },
  weeklyStatsAction: { marginTop: 24, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 15, paddingVertical: 11 },
  weeklyStatsActionText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  publicNote: { color: colors.muted, fontSize: 11, marginTop: 12 },
  loadingProfile: { paddingTop: 50, alignItems: "center", gap: 10 },
  publicSection: { alignSelf: "stretch", marginTop: 24, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
  publicSectionTitle: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.6, paddingHorizontal: 14, paddingTop: 13 },
  publicMetricGrid: { marginTop: 11, flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderTopColor: colors.border },
  publicMetric: { width: "50%", minHeight: 71, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 8 },
  publicMetricValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  publicMetricLabel: { color: colors.subdued, fontSize: 10, marginTop: 4, textAlign: "center" },
  publicHeatHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 14 },
  publicHeatmap: { flexDirection: "row", flexWrap: "wrap", gap: 5, padding: 14, paddingTop: 12 },
  publicHeatCell: { width: 15, height: 15, borderRadius: 4 },
  profileRank: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: "rgba(0,0,0,.16)", paddingHorizontal: 9, paddingVertical: 4 },
  detailRank: { position: "absolute", right: 0, top: 2, marginTop: 0 },
  profileMedal: { width: 16, height: 16, resizeMode: "contain" },
  profileRankText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  profileStats: { marginTop: 28, flexDirection: "row", gap: 30 },
  profileValue: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  tasks: { alignSelf: "stretch", marginTop: 30, gap: 9 },
  tasksTitle: { color: colors.subdued, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  task: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskNameLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  taskPoints: { color: "#86efac", fontSize: 11, fontWeight: "800" },
  taskPenalty: { color: "#fca5a5" },
  taskNeutral: { color: colors.subdued },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
    zIndex: 20,
    elevation: 20,
  },
  filterWrap: { width: 132, position: "relative", zIndex: 30, elevation: 30 },
  filter: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 9,
    paddingHorizontal: 10,
    backgroundColor: "#252525",
    borderWidth: 1,
    borderColor: "#414141",
  },
  filterOpen: { borderColor: "#60a5fa", backgroundColor: "#22272a" },
  filterText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  menu: {
    position: "absolute",
    top: 43,
    left: 0,
    right: 0,
    overflow: "hidden",
    borderRadius: 11,
    padding: 4,
    backgroundColor: "#282828",
    borderWidth: 1,
    borderColor: "#414141",
    elevation: 30,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  menuItem: {
    minHeight: 37,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  menuItemSelected: { backgroundColor: "#f4f4f5" },
  menuText: { color: "#e4e4e7", fontSize: 12 },
  menuTextSelected: { color: "#171717", fontWeight: "700" },
});
