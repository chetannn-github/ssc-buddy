import { createThemedStyles } from "../theme";
import { AnimatedDateHeading } from "./AnimatedDateHeading";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Mask } from "react-native-svg";
import Reanimated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  withRepeat,
  useReducedMotion,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { dateKeyFromOffset, summarizeTasks, type Task } from "../domain/tasks";
import { dailyTaskColors } from "../theme";
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);
const circumference = 2 * Math.PI * 18.5;
export function TaskDateStrip({
  today,
  selected,
  tasks,
  onSelect,
  headerActions,
  progressForDate,
  visibleWeekEnd,
  onWeekEndChange,
}: {
  headerActions?: ReactNode;
  progressForDate?: (date: string) => number;
  visibleWeekEnd?: string;
  onWeekEndChange?: (date: string) => void;
  today: string;
  selected: string;
  tasks: Task[];
  onSelect: (date: string) => void;
}) {
  const tomorrow = dateKeyFromOffset(1, new Date(today + "T12:00:00"));
  const latestDate = tasks.some((task) => task.date === tomorrow) ? tomorrow : today;
  const [localWeekEnd, setLocalWeekEnd] = useState(latestDate);
  const weekEnd = visibleWeekEnd ?? localWeekEnd;
  const setWeekEnd = (date: string) => { setLocalWeekEnd(date); onWeekEndChange?.(date); };
  const previousLatestDate = useRef(latestDate);
  useEffect(() => {
    const previous = previousLatestDate.current;
    if (weekEnd === previous || weekEnd > latestDate) setWeekEnd(latestDate);
    previousLatestDate.current = latestDate;
  }, [latestDate]);
  useEffect(() => {
    if (selected > latestDate) {
      onSelect(today);
      return;
    }
    const start = dateKeyFromOffset(-6, new Date(weekEnd + "T12:00:00"));
    if (selected < start || selected > weekEnd) setWeekEnd(selected);
  }, [selected, latestDate]);
  const move = (amount: number) => {
    const next = dateKeyFromOffset(amount, new Date(weekEnd + "T12:00:00"));
    setWeekEnd(next > latestDate ? latestDate : next);
  };
  return (
    <View style={{ gap: 13 }}>
      <View style={s.heading}>
        <AnimatedDateHeading date={selected} today={today} />
        {headerActions}
      </View>
      <View style={s.controls}>
        <Pressable accessibilityLabel="Previous task week" hitSlop={10} onPress={() => move(-7)}>
          <MaterialCommunityIcons name="chevron-left" color="#888" size={20} />
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {selected !== today && (
          <Pressable
            accessibilityLabel="Return to today"
            onPress={() => {
              setWeekEnd(latestDate);
              onSelect(today);
            }}
            style={s.jump}
          >
            <Text style={s.jumpText}>Today</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityLabel="Next task week"
          disabled={weekEnd >= latestDate}
          hitSlop={10}
          onPress={() => move(7)}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            color={weekEnd >= latestDate ? "#333" : "#888"}
            size={20}
          />
        </Pressable>
        </View>
      </View>
      <View style={s.week}>
        {Array.from({ length: 7 }, (_, index) =>
          dateKeyFromOffset(index - 6, new Date(weekEnd + "T12:00:00")),
        ).map((day) => {
          const summary = summarizeTasks(tasks.filter((task) => task.date === day));
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={progressForDate ? day + ", " + Math.round(progressForDate(day) * 100) + " percent complete" : day + ", " + summary.done + " of " + summary.total + " tasks complete"}
              accessibilityState={{ selected: day === selected }}
              key={day}
              onPress={() => onSelect(day)}
              style={s.day}
            >
              <Text
                style={[s.weekLabel, day === selected && { color: "white", fontWeight: "700" }]}
              >
                {new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}
              </Text>
              <View style={s.ring}>
                <TaskDayRing
                  progress={progressForDate ? progressForDate(day) : summary.total ? summary.done / summary.total : 0}
                  selected={day === selected}
                />
                <Text style={s.date}>{new Date(day + "T12:00:00").getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
function TaskDayRing({ progress, selected }: { progress: number; selected: boolean }) {
  const displayedProgress = selected ? Math.max(progress, 0.02) : progress;
  const value = useSharedValue(0);
  const flow = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const maskId = "date-ring-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    value.value = withTiming(Math.max(0, Math.min(1, displayedProgress)), {
      duration: reducedMotion ? 0 : 650,
      easing: Easing.inOut(Easing.cubic),
    });
    return () => cancelAnimation(value);
  }, [displayedProgress, reducedMotion, value]);
  useEffect(() => {
    if (!reducedMotion && progress > 0) {
      flow.value = 0;
      flow.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(flow);
      flow.value = 0;
    }
    return () => cancelAnimation(flow);
  }, [progress, reducedMotion, flow]);
  const maskProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - value.value),
    opacity: value.value > 0.0001 ? 1 : 0,
  }));
  const flowProps = useAnimatedProps(() => ({ strokeDashoffset: -circumference * flow.value }));
  return <Svg width={43} height={43} pointerEvents="none">
    <Defs>
      <Mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={43} height={43}>
        <AnimatedCircle cx={21.5} cy={21.5} r={18.5} fill="none" stroke="white" strokeWidth={3}
          strokeLinecap="round" strokeDasharray={circumference} animatedProps={maskProps}
          rotation={-90} origin="21.5,21.5" />
      </Mask>
    </Defs>
    <Circle cx={21.5} cy={21.5} r={18.5} stroke={selected ? "#535353" : "#292929"} strokeWidth={3} fill="none" />
    <G mask={`url(#${maskId})`}>
      <Circle cx={21.5} cy={21.5} r={18.5} stroke={dailyTaskColors.accent} strokeWidth={3} fill="none" />
      {!reducedMotion && progress > 0 && <AnimatedCircle cx={21.5} cy={21.5} r={18.5}
        stroke="white" opacity={0.45} strokeWidth={1.5} fill="none" strokeLinecap="round"
        strokeDasharray={[8, circumference - 8]} animatedProps={flowProps} rotation={-90} origin="21.5,21.5" />}
    </G>
  </Svg>;
}
const s = createThemedStyles({
  heading: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: "white", fontSize: 20, fontWeight: "800" },
  jump: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9, backgroundColor: "#202020" },
  jumpText: { fontSize: 10, color: dailyTaskColors.accent, fontWeight: "600" },
  controls: { height: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  caption: { fontSize: 10, letterSpacing: 1.3, color: "#777" },
  week: { flexDirection: "row", justifyContent: "space-between" },
  day: { alignItems: "center", gap: 8 },
  weekLabel: { color: "#777", fontSize: 11 },
  ring: { width: 43, height: 43, alignItems: "center", justifyContent: "center" },
  date: { position: "absolute", fontSize: 16, fontWeight: "600", color: "white" },
});
