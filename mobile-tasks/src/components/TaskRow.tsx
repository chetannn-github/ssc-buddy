import { createThemedStyles } from "../theme";
import { useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { dateKeyFromOffset, formatMinutes, type Task } from "../domain/tasks";
import { colors, dailyTaskColors } from "../theme";

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
  yellow?: boolean;
};
export function TaskRow({
  task,
  points,
  onDone,
  onReopen,
  onEdit,
  onDelete,
  compact = false,
  grouped = false,
  last = false,
  yellow = false,
}: Props) {
  const row = useRef<View>(null);
  const completedTone = yellow
    ? { backgroundColor: dailyTaskColors.accent, borderColor: dailyTaskColors.accent }
    : undefined;
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const { width, height } = useWindowDimensions();
  const canDelete = task.date === dateKeyFromOffset(1);
  const openMenu = () => {
    if (compact) return;
    row.current?.measureInWindow((x, y, rowWidth, rowHeight) => {
      const menuHeight = canDelete ? 108 : 58;
      setMenu({
        left: Math.max(12, Math.min(width - 192, x + rowWidth - 180)),
        top: Math.max(12, Math.min(height - menuHeight - 24, y + rowHeight)),
      });
    });
  };
  const act = (callback: () => void) => {
    setMenu(null);
    callback();
  };
  return (
    <View>
      <Pressable
        ref={row}
        disabled={compact}
        onLongPress={openMenu}
        delayLongPress={400}
        accessibilityHint={compact ? undefined : "Long press for task actions"}
        style={[
          styles.task,
          task.completed && styles.completed,
          compact && styles.compact,
          grouped && styles.grouped,
          grouped && !compact && task.completed && styles.groupedCompleted,
          grouped && last && styles.groupedLast,
          yellow && styles.dailyCard,
          yellow && !task.completed && styles.pendingCard,
          yellow && last && { borderBottomWidth: 0 },
          yellow &&
            task.completed && {
              backgroundColor: dailyTaskColors.completeSurface,
              borderColor: dailyTaskColors.completeBorder,
            },
        ]}
      >
        {compact ? (
          <View
            style={[
              styles.check,
              yellow && styles.dailyCheck,
              task.completed ? styles.checkComplete : styles.checkIncompleteHistory,
              task.completed && completedTone,
              yellow && !task.completed && !compact && styles.pendingCheck,
            ]}
          >
            <MaterialCommunityIcons
              name={task.completed ? "check-bold" : "close-thick"}
              size={task.completed ? 14 : 12}
              color={task.completed ? (yellow ? dailyTaskColors.ink : colors.accentDeep) : "#f19a9f"}
            />
          </View>
        ) : (
          <Pressable
            accessibilityLabel={task.completed ? "Mark task incomplete" : "Mark task complete"}
            onPress={task.completed ? onReopen : onDone}
            onLongPress={openMenu}
            delayLongPress={400}
            style={[
              styles.check,
              yellow && styles.dailyCheck,
              task.completed && styles.checkComplete,
              task.completed && completedTone,
              yellow && !task.completed && !compact && styles.pendingCheck,
            ]}
          >
            <Text style={[styles.checkText, yellow && { color: dailyTaskColors.ink }]}>
              {task.completed ? "✓" : ""}
            </Text>
          </Pressable>
        )}
        <View style={styles.main}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, yellow && styles.dailyName, task.completed && styles.strike]} numberOfLines={yellow ? 2 : 1}>
              {task.name}
            </Text>
            {(!yellow || points !== 0) && <Text
              style={[
                styles.points,
                points < 0 ? styles.penalty : points === 0 ? styles.neutral : undefined,
              ]}
            >
              {points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : "0"} pts
            </Text>}
          </View>
          <Text style={[styles.meta, yellow && { marginTop: 4, color: "#909099" }]} numberOfLines={1}>
            {task.subject} · {task.type}
            {task.completed ? ` · ${formatMinutes(task.minutesSpent ?? 0)}` : ""}
          </Text>
        </View>
      </Pressable>
      <Modal
        transparent
        visible={menu !== null}
        animationType="fade"
        onRequestClose={() => setMenu(null)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close task menu"
            style={styles.menuBackdrop}
            onPress={() => setMenu(null)}
          />
          {menu && (
            <View
              accessibilityViewIsModal
              style={[styles.menu, { top: menu.top, left: menu.left }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${task.name}`}
                onPress={() => act(onEdit)}
                style={styles.menuItem}
              >
                <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.text} />
                <Text style={styles.menuText}>Edit Task</Text>
              </Pressable>
              {canDelete && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${task.name}`}
                  onPress={() => act(onDelete)}
                  style={styles.menuItem}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#fca5a5" />
                  <Text style={[styles.menuText, { color: "#fca5a5" }]}>Delete</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = createThemedStyles({
  task: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 0,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: colors.border,
  },
  dailyCard: { minHeight: 58, borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: "#292929", paddingHorizontal: 11, paddingVertical: 9, gap: 10, marginTop: 0, backgroundColor: "transparent" },
  pendingCard: { backgroundColor: "transparent" },
  dailyCheck: { width: 25, height: 25, borderRadius: 13 },
  pendingCheck: { borderWidth: 1.5, borderColor: colors.accent + "99", backgroundColor: "transparent" },
  dailyName: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  completed: { backgroundColor: colors.completeSurface, borderColor: colors.completeBorder },
  compact: { marginTop: 9, minHeight: 52, marginBottom: 0 },
  grouped: {
    minHeight: 54,
    marginTop: 0,
    marginBottom: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    borderBottomColor: "#303030",
    backgroundColor: "transparent",
    paddingHorizontal: 2,
  },
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
  checkIncompleteHistory: { borderColor: "#64363c", backgroundColor: "#27191d", borderWidth: 1 },
  incompleteHistoryText: { color: "#ff8a95", fontSize: 16 },
  main: { flex: 1 },
  name: { color: colors.text, fontSize: 13, fontWeight: "700" },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  points: { color: "#86efac", fontSize: 10, fontWeight: "800" },
  penalty: { color: "#fca5a5" },
  neutral: { color: colors.subdued },
  meta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  strike: { textDecorationLine: "line-through", color: colors.muted },
  menuBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,.15)",
  },
  menu: {
    position: "absolute",
    width: 180,
    borderRadius: 13,
    padding: 4,
    backgroundColor: "#242424",
    borderWidth: 1,
    borderColor: "#414141",
    elevation: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  menuText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
