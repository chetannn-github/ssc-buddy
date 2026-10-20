import { colors } from "../theme";
import type { ReactNode } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import type { Task } from "../domain/tasks";
import { TaskDateStrip } from "./TaskDateStrip";
import { TaskHabitSwitch } from "./TaskHabitSwitch";

export function DailySectionHeader({ section, today, selected, tasks, onSelect, weekEnd, onWeekEndChange, onSwitch, onAdd, addDisabled, rankAction, progressForDate }: {
  section: "tasks" | "habits"; today: string; selected: string; tasks: Task[];
  onSelect: (date: string) => void; weekEnd?: string; onWeekEndChange: (date: string) => void;
  onSwitch?: () => void; onAdd: () => void; addDisabled?: boolean;
  rankAction?: ReactNode; progressForDate?: (date: string) => number;
}) {
  return <TaskDateStrip today={today} selected={selected} tasks={tasks} onSelect={onSelect}
    visibleWeekEnd={weekEnd} onWeekEndChange={onWeekEndChange} progressForDate={progressForDate}
    headerActions={<View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      {onSwitch && <TaskHabitSwitch section={section} onPress={onSwitch} />}
      {rankAction}
      <Pressable accessibilityRole="button" accessibilityLabel={section === "tasks" ? "Add task" : "Add habit"}
        disabled={addDisabled} onPress={onAdd}
        style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, opacity: addDisabled ? 0.5 : 1 }}>
        <MaterialCommunityIcons name="plus" size={23} color={colors.accentDeep} />
      </Pressable>
    </View>} />;
}
