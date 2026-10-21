import { UppercaseTextInput as TextInput } from "../components/UppercaseTextInput";
import { colors } from "../theme";
import { createThemedStyles } from "../theme";
import { TaskOverview } from "../components/TaskOverview";
import { DailySectionHeader } from "../components/DailySectionHeader";
import type { Task } from "../domain/tasks";
import { cacheWidgetHabits, pinHabitWidget } from "../widgets/habit-widget-store";
import { NumberFlow } from "number-flow-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { User } from "firebase/auth";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { HabitEditor } from "../components/HabitEditor";
import { useHabits, useHabitToday } from "../hooks/use-habits";
import {
  HABIT_COLORS,
  HABIT_DEFAULT_COLORS,
  habitCalendar,
  habitDay,
  habitEntry,
  canEditHabitDay,
  habitIsComplete,
  habitIntensity,
  habitDue,
  habitScheduled,
  habitStats,
  normalizeHabitSettings,
  type Habit,
  type HabitColor,
  type HabitDayAction,
  type HabitSaveDetails,
} from "../domain/habits";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
export function HabitsScreen({ user, widgetRequest, onWidgetRequestHandled, onSwitchToTasks, selectedDate, onSelectDate, dateTasks, visibleWeekEnd, onWeekEndChange, rankAction, dueOnly, onFilterChange }: {
  widgetRequest?: { id: string; uid?: string } | null; onWidgetRequestHandled?: () => void;
  dueOnly: boolean; onFilterChange: (value: boolean) => void;
  user: User | null; onSwitchToTasks?: () => void; selectedDate: string; onSelectDate: (date: string) => void;
  dateTasks: Task[]; visibleWeekEnd?: string; onWeekEndChange: (date: string) => void; rankAction?: React.ReactNode;
}) {
  const { habits, loading, error, retry, save, remove, updateDay } = useHabits(user?.uid);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const menuWidth = Math.min(260, windowWidth - 24);
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 100 });
  const openHabitMenu = (habit: Habit, event: { nativeEvent: { pageX: number; pageY: number } }) => {
    if (busy) return;
    const menuHeight = Platform.OS === "android" ? 200 : 104;
    setMenuPosition({
      left: Math.max(12, Math.min(windowWidth - menuWidth - 12, event.nativeEvent.pageX - 24)),
      top: Math.max(12, Math.min(windowHeight - menuHeight - 24, event.nativeEvent.pageY + 12)),
    });
    setMenu(habit);
  };
  const today = useHabitToday();
  const selected = selectedDate;
  const setDueOnly = onFilterChange;
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<Habit | "new" | null>(null),
    [deleting, setDeleting] = useState<Habit | null>(null),
    [menu, setMenu] = useState<Habit | null>(null);
  const [detail, setDetail] = useState<{ id: string; day: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const locked = useRef(false);
  useEffect(() => {
    setEditing(null);
    setDeleting(null);
    setDetail(null);
    setMenu(null);
    setMessage("");
    setCategory("");
  }, [user?.uid]);
  const act = async (work: () => Promise<void>, after?: () => void) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
      after?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save. Try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const openDetail = (habit: Habit, day: string) => {
    setMessage("");
    setDetail({ id: habit.id, day });
  };
  useEffect(() => {
    if (!widgetRequest || !user || loading || error) return;
    if (widgetRequest.uid && widgetRequest.uid !== user.uid) {
      onWidgetRequestHandled?.();
      return;
    }
    const requested = habits.find(habit => habit.id === widgetRequest.id);
    if (requested && normalizeHabitSettings(requested.settings).tracking === "checklist") {
      onSelectDate(today);
      openDetail(requested, today);
    }
    onWidgetRequestHandled?.();
  }, [widgetRequest, user?.uid, loading, error, habits, today, onWidgetRequestHandled, onSelectDate]);
  const detailHabit = habits.find((habit) => habit.id === detail?.id),
    detailSettings = normalizeHabitSettings(detailHabit?.settings);
  const scoped = habits.filter(
      (habit) => !category || normalizeHabitSettings(habit.settings).category === category,
    ),
    due = scoped.filter((habit) => habitDue(habit, selected));
  const scheduled = scoped.filter((habit) => habitScheduled(habit, selected));
  const score = scheduled.length
    ? Math.round(
        (scheduled.reduce((total, habit) => total + habitIntensity(habit, selected), 0) /
          scheduled.length) *
          100,
      )
    : 0;
  const categories = [
      ...new Set(
        habits.map((habit) => normalizeHabitSettings(habit.settings).category).filter(Boolean),
      ),
    ];
  const mark = (id: string, day: string, action: HabitDayAction) => {
    void updateDay(id, day, action).catch(() => undefined);
  };
  const tap = (habit: Habit) => {
    const settings = normalizeHabitSettings(habit.settings);
    if (settings.tracking === "checklist") openDetail(habit, selected);
    else
      mark(
        habit.id,
        selected,
        settings.tracking === "count"
          ? { type: "increment", amount: settings.step }
          : { type: "toggle" },
      );
  };
  return (
    <View style={s.page}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={s.content}
        scrollEventThrottle={16}
        onScroll={(event) => reportVerticalScroll(event.nativeEvent.contentOffset.y, event.nativeEvent)}
      >
        <View style={{ backgroundColor: "#000000", paddingTop: 16, paddingBottom: 12 }}>
        <DailySectionHeader section="habits" today={today} selected={selected} tasks={dateTasks}
          weekEnd={visibleWeekEnd} onWeekEndChange={onWeekEndChange} onSelect={onSelectDate}
          onSwitch={onSwitchToTasks} rankAction={rankAction} addDisabled={!user || busy}
          onAdd={() => { setMessage(""); setEditing("new"); }}
          progressForDate={(day) => {
            const items = habits.filter((habit) => habitScheduled(habit, day));
            return items.length ? items.reduce((total, habit) => total + habitIntensity(habit, day), 0) / items.length : 0;
          }} />
        <TaskOverview total={scoped.length} due={due.length} percent={score}
          dueOnly={dueOnly} onFilterChange={setDueOnly} meterLabel="Habit Score" />
        </View>
        {!!categories.length && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {["", ...categories].map((item) => (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                style={[s.category, category === item && { borderColor: colors.accent }]}
              >
                <Text style={{ color: category === item ? colors.accent : "#999", fontSize: 11 }}>
                  {item || "All categories"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {!user ? (
          <Text style={s.muted}>Sign in to track your habits.</Text>
        ) : loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : error ? (
          <View>
            <Text style={s.error}>{error}</Text>
            <Pressable onPress={retry}>
              <Text style={s.muted}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {!(dueOnly ? due : scoped).length && (
              <View style={{ padding: 30, alignItems: "center", gap: 20 }}>
                <Text style={s.muted}>
                  {habits.length
                    ? "All caught up for this day."
                    : "Make room for a better routine."}
                </Text>
                <Pressable style={s.add} onPress={() => setEditing("new")}>
                  <Text style={s.addText}>＋ Add habit</Text>
                </Pressable>
              </View>
            )}
            {(dueOnly ? due : scoped).map((habit) => {
              const stats = habitStats(habit, today),
                settings = normalizeHabitSettings(habit.settings),
                tint = HABIT_COLORS[habit.color],
                entry = habitEntry(habit, selected),
                done = habitIsComplete(habit, selected),
                available = habitScheduled(habit, selected) && canEditHabitDay(selected, today);
              return (
                <View key={habit.id} style={s.card}>
                  <Pressable
                    delayLongPress={400}
                    onLongPress={(event) => openHabitMenu(habit, event)}
                    style={s.cardHeader}
                  >
                    <Pressable
                      accessibilityLabel={"Options for " + habit.name}
                      onPress={(event) => openHabitMenu(habit, event)}
                      style={[s.habitIcon, { backgroundColor: tint + "14" }]}
                    >
                      <MaterialCommunityIcons name={settings.icon as any} size={26} color={tint} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{habit.name}</Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          marginTop: 5,
                          flexWrap: "wrap",
                        }}
                      >
                        <MaterialCommunityIcons name="fire" size={13} color={tint} />
                        <NumberFlow
                          value={stats.streak}
                          style={{
                            color: tint,
                            fontSize: 12,
                            fontWeight: "700",
                            fontVariant: ["tabular-nums"],
                          }}
                        />
                        {settings.tracking !== "tick" && (
                          <Text style={{ color: "#858585", fontSize: 12 }}>
                            {" "}
                            ·{" "}
                            {settings.tracking === "count"
                              ? `${entry.count}/${settings.dailyGoal}${settings.unit ? " " + settings.unit : ""}`
                              : `${entry.checks.filter((id) => settings.checklist.some((item) => item.id === id)).length}/${settings.checklist.length}`}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <HabitMarkButton
                          hitSlop={6}
                          accessibilityLabel={
                            settings.tracking === "count"
                              ? "Add " + settings.step
                              : done
                                ? "Undo completed day"
                                : "Complete day"
                          }
                          done={done}
                          disabled={!available || busy}
                          accessibilityState={{
                            disabled: !available || busy,
                          }}
                          onPress={() => tap(habit)}
                          onLongPress={() => openDetail(habit, selected)}
                          style={[
                            s.mark,
                            {
                              backgroundColor: done ? tint : tint + "22",
                              borderColor: tint + "35",
                              opacity: available ? 1 : 0.3,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={
                              settings.type === "quit" && !done
                                ? "close"
                                : done
                                  ? "check"
                                  : settings.tracking === "count"
                                    ? "plus"
                                    : settings.tracking === "checklist"
                                      ? "format-list-checks"
                                      : "check"
                            }
                            size={22}
                            color={done ? "#000" : "white"}
                          />
                        </HabitMarkButton>
                      </View>
                    </View>
                  </Pressable>
                  <HabitGrid habit={habit} today={today} selected={selected} />
                  {!!habit.targetDays && (
                    <>
                      <View style={s.track}>
                        <View
                          style={{
                            height: "100%",
                            width: (stats.progress * 100 + "%") as `${number}%`,
                            backgroundColor: tint,
                            borderRadius: 4,
                          }}
                        />
                      </View>
                      <Text style={[s.copy, { color: tint }]}>
                        {stats.total}/{habit.targetDays} days
                        {stats.total >= habit.targetDays ? " · Challenge complete!" : ""}
                      </Text>
                    </>
                  )}
                </View>
              );
            })}
          </>
        )}
        {!!message && !editing && !deleting && !detail && (
          <Text accessibilityRole="alert" style={s.error}>
            {message}
          </Text>
        )}
      </ScrollView>
      {editing && (
        <HabitEditor
          key={editing === "new" ? "new" : editing.id}
          habit={editing === "new" ? null : editing}
          initialColor={
            (HABIT_DEFAULT_COLORS[habits.length % HABIT_DEFAULT_COLORS.length] ??
              "yellow") as HabitColor
          }
          busy={busy}
          error={message}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          onSave={(details) =>
            act(
              () => save(details, editing !== "new" ? editing : undefined),
              () => setEditing(null),
            )
          }
        />
      )}
      <Modal transparent visible={!!menu} animationType="fade" onRequestClose={() => setMenu(null)}>
        <View style={{ flex: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close habit menu"
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,.15)" }]} onPress={() => setMenu(null)} />
          {menu && <View accessibilityViewIsModal style={[s.habitMenu, { width: menuWidth, maxHeight: windowHeight - 48 }, menuPosition]}
            onLayout={({ nativeEvent: { layout } }) => setMenuPosition(previous => {
              const left = Math.max(12, Math.min(windowWidth - layout.width - 12, previous.left));
              const top = Math.max(12, Math.min(windowHeight - layout.height - 24, previous.top));
              return left === previous.left && top === previous.top ? previous : { left, top };
            })}>
            <Pressable disabled={busy} style={s.habitMenuItem} onPress={() => { setEditing(menu); setMessage(""); setMenu(null); }}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.text} />
              <Text style={s.habitMenuText}>Edit Habit</Text>
            </Pressable>
            {Platform.OS === "android" && <Pressable disabled={busy || !user} style={s.habitMenuItem}
              onPress={() => {
                const habit = menu; setMenu(null);
                if (habit && user) void act(async () => {
                  await cacheWidgetHabits(user.uid, habits);
                  await pinHabitWidget(user.uid, habit.id);
                });
              }}>
              <MaterialCommunityIcons name="widgets-outline" size={18} color={colors.text} />
              <Text style={s.habitMenuText}>Add to widget</Text>
            </Pressable>}
            {Platform.OS === "android" && <Pressable disabled={busy || !user} style={s.habitMenuItem}
              onPress={() => {
                const habit = menu; setMenu(null);
                if (habit && user) void act(async () => {
                  await cacheWidgetHabits(user.uid, habits);
                  await pinHabitWidget(user.uid, habit.id, "compact");
                });
              }}>
              <MaterialCommunityIcons name="widgets-outline" size={18} color={colors.text} />
              <Text style={s.habitMenuText}>Add compact widget</Text>
            </Pressable>}
            <Pressable disabled={busy} style={s.habitMenuItem} onPress={() => { setMessage(""); setDeleting(menu); setMenu(null); }}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#fca5a5" />
              <Text style={[s.habitMenuText, { color: "#fca5a5" }]}>Delete</Text>
            </Pressable>
          </View>}
        </View>
      </Modal>
      <Modal
        transparent
        visible={!!detail && !!detailHabit}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setDetail(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[s.backdrop, { justifyContent: "flex-end", padding: 0 }]}
        >
          <Pressable
            accessibilityLabel="Dismiss habit sheet"
            style={StyleSheet.absoluteFill}
            onPress={() => setDetail(null)}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ width: "100%", maxHeight: "75%", flexGrow: 0 }}
            contentContainerStyle={{
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <View
              style={[
                s.dialog,
                {
                  backgroundColor: "#000",
                  padding: 10,
                  paddingBottom: detailSettings.tracking === "count" ? 26 : 10,
                  maxWidth: detailSettings.tracking === "count" ? undefined : 420,
                  gap: 10,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                },
              ]}
            >
              <View
                style={{
                  alignSelf: "center",
                  width: 32,
                  height: 4,
                  borderRadius: 4,
                  backgroundColor: "#444",
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  marginTop: 2,
                  marginBottom: 2,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: detailHabit ? HABIT_COLORS[detailHabit.color] : colors.accent,
                  }}
                >
                  <MaterialCommunityIcons
                    name={detailSettings.icon as any}
                    size={21}
                    color="#000"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.dialogTitle, { fontSize: 17 }]}>{detailHabit?.name}</Text>
                  <Text style={[s.muted, { marginTop: 4 }]}>
                    {detailSettings.tracking === "checklist"
                      ? "Checklist"
                      : detailSettings.tracking === "count"
                        ? "Count"
                        : "Habit"}{" "}
                    ·{" "}
                    {detail &&
                      new Date(detail.day + "T12:00:00").toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                  </Text>
                </View>
                {detailHabit && detail && detailSettings.tracking === "checklist" && (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 24,
                      backgroundColor: HABIT_COLORS[detailHabit.color] + "25",
                    }}
                  >
                    <NumberFlow
                      value={
                        habitEntry(detailHabit, detail.day).checks.filter((id) =>
                          detailSettings.checklist.some((item) => item.id === id),
                        ).length
                      }
                      suffix={"/" + detailSettings.checklist.length}
                      style={{ color: "white", fontSize: 15, fontWeight: "700" }}
                    />
                  </View>
                )}
              </View>
              {detailHabit && detail && detailSettings.tracking === "count" && (
                <HabitCountControls
                  value={habitEntry(detailHabit, detail.day).count}
                  goal={detailSettings.dailyGoal}
                  tint={HABIT_COLORS[detailHabit.color]}
                  disabled={busy || !canEditHabitDay(detail.day, today)}
                  onChange={direction => mark(detailHabit.id, detail.day, { type: "increment", amount: direction * detailSettings.step })}
                />
              )}
              {detailHabit &&
                detail &&
                detailSettings.tracking === "checklist" &&
                detailSettings.checklist.map((item, index) => {
                  const checked = habitEntry(detailHabit, detail.day).checks.includes(item.id),
                    tint = HABIT_COLORS[detailHabit.color];
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="checkbox"
                      accessibilityLabel={item.title}
                      accessibilityState={{
                        checked,
                        disabled: busy || !canEditHabitDay(detail.day, today),
                      }}
                      disabled={busy || !canEditHabitDay(detail.day, today)}
                      onPress={() =>
                        mark(detailHabit.id, detail.day, { type: "check", id: item.id })
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        padding: 10,
                        borderRadius: 17,
                        borderWidth: 1,
                        borderColor: checked ? tint + "70" : "#262626",
                        backgroundColor: checked ? tint + "28" : "#0e0e0e",
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 17,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: checked ? tint + "30" : "#202020",
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "600" }}>{index + 1}</Text>
                      </View>
                      <Text
                        style={[
                          s.name,
                          {
                            flex: 1,
                            fontWeight: "400",
                            color: checked ? "#aaa" : "white",
                            textDecorationLine: checked ? "line-through" : "none",
                          },
                        ]}
                      >
                        {item.title}
                      </Text>
                      <HabitMarkButton
                        done={checked}
                        disabled={busy || !canEditHabitDay(detail.day, today)}
                        accessibilityLabel={"Toggle " + item.title}
                        onPress={() =>
                          mark(detailHabit.id, detail.day, { type: "check", id: item.id })
                        }
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 19,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: checked ? tint : tint + "22",
                        }}
                      >
                        <MaterialCommunityIcons
                          name="check"
                          size={22}
                          color={checked ? "#000" : "white"}
                        />
                      </HabitMarkButton>
                    </Pressable>
                  );
                })}
              {detailHabit && detail && detailSettings.tracking === "tick" && (
                <Pressable
                  disabled={busy || !detail || !canEditHabitDay(detail.day, today)}
                  style={s.add}
                  onPress={() => mark(detailHabit.id, detail.day, { type: "toggle" })}
                >
                  <Text style={s.addText}>
                    {habitIsComplete(detailHabit, detail.day)
                      ? detailSettings.type === "quit"
                        ? "Mark a slip"
                        : "Undo completion"
                      : detailSettings.type === "quit"
                        ? "Mark a slip"
                        : "Mark complete"}
                  </Text>
                </Pressable>
              )}
              {!!message && <Text style={s.error}>{message}</Text>}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        transparent
        visible={!!deleting}
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setDeleting(null);
        }}
      >
        <Pressable
          style={s.backdrop}
          onPress={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <Pressable accessibilityViewIsModal onPress={() => undefined} style={s.dialog}>
            <Text style={s.dialogTitle}>Delete habit?</Text>
            <Text style={s.muted}>Remove “{deleting?.name}” and its history?</Text>
            {!!message && <Text style={s.error}>{message}</Text>}
            <View style={s.actions}>
              <Pressable disabled={busy} onPress={() => setDeleting(null)}>
                <Text style={s.muted}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                style={[s.add, { backgroundColor: "#ef334f" }]}
                onPress={() => {
                  if (deleting)
                    void act(
                      () => remove(deleting.id),
                      () => setDeleting(null),
                    );
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
const INITIAL_HEATMAP_OFFSET = { x: 10000, y: 0 };
function HabitCountControls({ value, goal, tint, disabled, onChange }: {
  value: number; goal: number; tint: string; disabled: boolean; onChange: (direction: number) => void;
}) {
  const progress = useRef(new Animated.Value(goal > 0 ? Math.min(1, value / goal) : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [value, goal, progress]);
  return <View style={{ paddingHorizontal: 22, paddingTop: 24, gap: 28 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 40 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Decrease count" disabled={disabled || value <= 0} onPress={() => onChange(-1)}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: tint + "25", opacity: disabled || value <= 0 ? .5 : 1 }}>
        <MaterialCommunityIcons name="minus" size={30} color={tint} />
      </Pressable>
      <View accessibilityLabel={`${value} of ${goal}`} style={{ minWidth: 56, alignItems: "center", gap: 5 }}>
        <NumberFlow value={value} style={{ color: "#fafafa", fontSize: 30, fontWeight: "700" }} />
        <Text style={{ color: "#888", fontSize: 15 }}>/ {goal}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Increase count" disabled={disabled} onPress={() => onChange(1)}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: tint, opacity: disabled ? .5 : 1 }}>
        <MaterialCommunityIcons name="plus" size={30} color="#000" />
      </Pressable>
    </View>
    <View style={{ height: 9, backgroundColor: tint + "28", borderRadius: 9, overflow: "hidden" }}>
      <Animated.View style={{ height: "100%", borderRadius: 9, backgroundColor: tint, width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
    </View>
  </View>;
}

const HabitGrid = memo(function HabitGrid({
  habit,
  today,
  selected,
}: {
  habit: Habit;
  today: string;
  selected: string;
}) {
  const cells = useMemo(() => habitCalendar(today), [today]),
    tint = HABIT_COLORS[habit.color];
  const size = 13;
  const gridRef = useRef<ScrollView>(null);
  const gridWidth = Math.ceil(cells.length / 7) * 16 - 3;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const positionedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!viewportWidth || contentWidth <= viewportWidth) return;
    const key = habit.id + ":" + today;
    if (positionedFor.current === key) return;
    positionedFor.current = key;
    const end = contentWidth - viewportWidth;
    gridRef.current?.scrollTo({ x: end, animated: false });
  }, [contentWidth, viewportWidth, habit.id, today]);
  return (
    <View style={{ width: "100%" }}>
      <Animated.ScrollView
        ref={gridRef}
        horizontal
        accessibilityLabel={habit.name + " heatmap"}
        contentOffset={INITIAL_HEATMAP_OFFSET}
        showsHorizontalScrollIndicator={false}
        style={{ marginRight: 6 }}
        contentContainerStyle={{ paddingRight: 18, paddingBottom: 4 }}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}
        scrollEventThrottle={16}
      >
        <View pointerEvents="none" style={{ position: "relative", height: 109, width: gridWidth }}>
          {cells.map((cell) => {
            const level = habitIntensity(habit, cell.key);
            return (
              <View
                key={cell.key}
                accessible
                accessibilityRole="image"
                accessibilityLabel={
                  cell.key +
                  (level >= 1 ? ", completed" : ", " + Math.round(level * 100) + " percent")
                }
                style={{
                  position: "absolute",
                  left: cell.column * 16,
                  top: cell.row * 16,
                  width: size,
                  height: size,
                  borderRadius: 2,
                  backgroundColor: level > 0 ? tint : tint + "22",
                  opacity: cell.future
                    ? 0.3
                    : cell.key < habitDay(new Date(habit.createdAt))
                      ? 0.8
                      : level > 0
                        ? 0.25 + 0.75 * level
                        : 1,
                  borderWidth: cell.key === selected ? 1 : 0,
                  borderColor: tint,
                }}
              />
            );
          })}
        </View>
      </Animated.ScrollView>
    </View>
  );
});
const s = createThemedStyles({
  habitMenu: { position: "absolute", borderRadius: 13, padding: 4, backgroundColor: "#0e0e0e", borderWidth: 1, borderColor: "#262626", elevation: 12, overflow: "hidden" },
  habitMenuItem: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 13 },
  habitMenuText: { flex: 1, flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: "600" },
  page: { flex: 1, backgroundColor: "#000" },
  content: { padding: 20, gap: 20, paddingBottom: 110, paddingTop: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: "white", fontSize: 21, fontWeight: "800" },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101010",
  },
  weekControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: -12,
  },
  week: { flexDirection: "row", justifyContent: "space-between" },
  weekDay: { alignItems: "center", gap: 10 },
  weekLabel: { color: "#777", fontSize: 12 },
  dateCircle: { width: 43, height: 43, alignItems: "center", justifyContent: "center" },
  dateNumber: { position: "absolute", color: "white", fontSize: 16, fontWeight: "600" },
  filters: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  small: { fontSize: 11, color: "#777", letterSpacing: 0.7, marginBottom: 7 },
  filterGroup: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#292929",
    borderRadius: 10,
    overflow: "hidden",
  },
  filter: { paddingHorizontal: 10, paddingVertical: 6 },
  score: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#292929",
    borderRadius: 10,
  },
  category: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#292929",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  card: { padding: 12, borderRadius: 21, backgroundColor: "#0e0e0e" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  habitIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: "white", fontWeight: "700", fontSize: 15 },
  copy: { color: "#858585", fontSize: 12, marginTop: 5 },
  muted: { color: "#a1a1aa", fontSize: 13 },
  streak: { flexDirection: "row", gap: 3, alignItems: "center" },
  noteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 4,
    backgroundColor: "#292929",
    overflow: "hidden",
    marginTop: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "#000a",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#101010",
    borderRadius: 26,
    padding: 24,
    gap: 14,
  },
  dialogTitle: { color: "white", fontWeight: "700", fontSize: 21 },
  menuItem: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 12 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 20,
    marginTop: 16,
  },
  add: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  addText: { color: "#000", fontWeight: "800" },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#303030",
    borderRadius: 12,
    padding: 14,
    color: "white",
  },
  error: { color: "#fca5a5", fontSize: 13 },
});

function HabitMarkButton({
  done,
  style,
  ...props
}: React.ComponentProps<typeof Pressable> & { done: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(done);
  useEffect(() => {
    if (previous.current === done) return;
    previous.current = done;
    scale.stopAnimation();
    Animated.sequence([
      Animated.timing(scale, { toValue: done ? 1.16 : 0.94, duration: 140, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }),
    ]).start();
    return () => scale.stopAnimation();
  }, [done, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable {...props} style={style} />
    </Animated.View>
  );
}
