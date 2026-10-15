import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMinutes, type Task } from "../domain/tasks";
import { colors } from "../theme";

type Props = {
  task: Task;
  points: number;
  onDone: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
  grouped?: boolean;
  last?: boolean;
};

export function TaskRow({ task, points, onDone, onReopen, onEdit, onDelete, compact = false, grouped = false, last = false }: Props) {
  return (
    <View>
      <View style={[styles.task, task.completed && styles.completed, compact && styles.compact, grouped && styles.grouped, grouped && task.completed && styles.groupedCompleted, grouped && last && styles.groupedLast]}>
        {compact ? (
          <View style={[styles.check, task.completed ? styles.checkComplete : styles.checkIncompleteHistory]}>
            <Text style={[styles.checkText, !task.completed && styles.incompleteHistoryText]}>
              {task.completed ? "✓" : "×"}
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={task.completed ? "Mark task incomplete" : "Mark task complete"}
            onPress={task.completed ? onReopen : onDone}
            style={[styles.check, task.completed && styles.checkComplete]}
          >
            <Text style={styles.checkText}>{task.completed ? "✓" : ""}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" disabled={compact} style={styles.main} onPress={onEdit}>
          <View style={styles.nameLine}><Text style={[styles.name, task.completed && styles.strike]} numberOfLines={1}>{task.name}</Text><Text style={[styles.points, points < 0 ? styles.penalty : points === 0 ? styles.neutral : undefined]}>{points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : "0"} pts</Text></View>
          <Text style={styles.meta} numberOfLines={1}>
            {task.subject} · {task.type}
            {task.completed ? ` · ${formatMinutes(task.minutesSpent ?? 0)} completed` : ""}
          </Text>
        </Pressable>
        {!compact ? (
          <View style={styles.actions}>
            <Pressable accessibilityLabel="Delete task" onPress={onDelete} hitSlop={9} style={styles.iconAction}><MaterialCommunityIcons name="trash-can-outline" size={17} color={colors.muted} /></Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  task: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: colors.border,
  },
  completed: { backgroundColor: colors.completeSurface, borderColor: colors.completeBorder },
  compact: { marginTop: 9, minHeight: 52, marginBottom: 0 },
  grouped: { minHeight: 54, marginTop: 0, marginBottom: 0, borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, borderBottomColor: "#303030", backgroundColor: "transparent", paddingHorizontal: 2 },
  groupedCompleted: { backgroundColor: "rgba(96,165,250,.06)" },
  groupedLast: { borderBottomWidth: 0 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.subdued,
    alignItems: "center",
    justifyContent: "center",
  },
  checkComplete: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkText: { color: colors.accentDeep, fontWeight: "900" },
  checkIncompleteHistory: { borderColor: "#70373c", backgroundColor: "#2b1d20" },
  incompleteHistoryText: { color: "#ff8a95", fontSize: 16 },
  main: { flex: 1 },
  name: { color: colors.text, fontSize: 13, fontWeight: "700" },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  points: { color: "#86efac", fontSize: 10, fontWeight: "800" },
  penalty: { color: "#fca5a5" },
  neutral: { color: colors.subdued },
  meta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  strike: { textDecorationLine: "line-through", color: colors.muted },
  actions: { flexDirection: "row", alignItems: "center", gap: 2 },
  iconAction: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 9 },
});
