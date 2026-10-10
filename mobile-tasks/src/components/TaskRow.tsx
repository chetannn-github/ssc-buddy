import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMinutes, type Task } from "../domain/tasks";
import { colors } from "../theme";

type Props = {
  task: Task;
  onDone: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
};

export function TaskRow({ task, onDone, onReopen, onEdit, onDelete, compact = false }: Props) {
  return (
    <View style={[styles.task, task.completed && styles.completed, compact && styles.compact]}>
      <Pressable
        accessibilityLabel={task.completed ? "Mark task incomplete" : "Mark task complete"}
        onPress={task.completed ? onReopen : onDone}
        style={[styles.check, task.completed && styles.checkComplete]}
      >
        <Text style={styles.checkText}>{task.completed ? "✓" : ""}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.main} onPress={onEdit}>
        <Text style={[styles.name, task.completed && styles.strike]} numberOfLines={1}>
          {task.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {task.subject} · {task.type} · {formatMinutes(task.targetMinutes)} target
          {task.completed ? ` · ${formatMinutes(task.minutesSpent ?? 0)} done` : ""}
        </Text>
      </Pressable>
      <Pressable accessibilityLabel="Delete task" onPress={onDelete} hitSlop={10}>
        <Text style={styles.delete}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  task: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 17,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  completed: { backgroundColor: colors.completeSurface, borderColor: colors.completeBorder },
  compact: { marginTop: 9, minHeight: 58 },
  check: {
    width: 29,
    height: 29,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.subdued,
    alignItems: "center",
    justifyContent: "center",
  },
  checkComplete: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkText: { color: colors.accentDeep, fontWeight: "900" },
  main: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  strike: { textDecorationLine: "line-through", color: colors.muted },
  delete: { fontSize: 27, color: colors.muted, paddingHorizontal: 4 },
});
